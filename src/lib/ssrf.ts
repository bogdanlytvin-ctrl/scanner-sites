// SSRF-safe fetch — Cloudflare Workers compatible (no node:dns / node:net).
//
// The website analyzer fetches a URL supplied by the client. Without guards an
// attacker could point it at internal services (cloud metadata 169.254.169.254,
// localhost admin panels, RFC1918 hosts). This wrapper rejects any private /
// loopback / link-local / reserved address — both literal IPs in the URL and
// hostnames that resolve to one (checked via DNS-over-HTTPS) — and re-validates
// on every redirect hop instead of trusting redirect:"follow".
//
// Why DoH instead of node:dns: on the Workers runtime (workerd) `node:dns`
// `lookup` is not implemented and throws at runtime, which previously crashed
// EVERY website analysis. DoH resolution is best-effort: if the resolver itself
// errors or times out we proceed, so a transient DNS hiccup never blocks a
// legitimate public site. Note: Workers `fetch` can't pin the resolved IP, so a
// determined DNS-rebind (resolve public now, private at connect time) remains
// out of scope — the edge can't route to a user's LAN regardless.

const MAX_REDIRECTS = 5;
const DOH_TIMEOUT_MS = 2500;

// ── Pure-JS IP detection (replaces node:net) ──
function isIPv4(s: string): boolean {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1).every((p) => {
    const n = Number(p);
    return n >= 0 && n <= 255 && String(n) === p.replace(/^0+(?=\d)/, "");
  });
}

function isIPv6(s: string): boolean {
  // Loose check: hex groups separated by colons (optionally ::), optional
  // embedded IPv4 tail. Good enough — anything ambiguous is blocked upstream.
  if (!s.includes(":")) return false;
  return /^[0-9a-f:]+(?:\.\d{1,3}){0,3}$/i.test(s);
}

function isIP(s: string): boolean {
  return isIPv4(s) || isIPv6(s);
}

function ipToParts(ip: string): number[] | null {
  if (!isIPv4(ip)) return null;
  return ip.split(".").map(Number);
}

// True for any address that must never be reachable from a server-side fetch.
function isPrivateIPv4(ip: string): boolean {
  const p = ipToParts(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved 224.0.0.0/3
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::1" || v === "::") return true; // loopback / unspecified
  if (v.startsWith("fe80")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique-local
  // IPv4-mapped ::ffff:a.b.c.d — validate the embedded v4
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isBlockedIP(ip: string): boolean {
  if (isIPv4(ip)) return isPrivateIPv4(ip);
  if (isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown format → block
}

// Resolve A/AAAA via Cloudflare DNS-over-HTTPS. Returns resolved IP strings, or
// null if resolution could not be performed (caller treats null as best-effort
// allow). Never throws.
async function dohResolve(host: string): Promise<string[] | null> {
  const query = async (type: "A" | "AAAA"): Promise<string[]> => {
    const u = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`;
    const resp = await fetch(u, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(DOH_TIMEOUT_MS),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { Answer?: { type: number; data: string }[] };
    if (!data.Answer) return [];
    // type 1 = A, 28 = AAAA; ignore CNAME (5) and others
    return data.Answer
      .filter((a) => a.type === 1 || a.type === 28)
      .map((a) => a.data)
      .filter((ip) => isIP(ip));
  };

  try {
    const [a, aaaa] = await Promise.all([query("A"), query("AAAA")]);
    const ips = [...a, ...aaaa];
    return ips.length ? ips : null;
  } catch {
    return null; // resolver failed — best-effort allow
  }
}

async function assertPublicHost(hostname: string): Promise<void> {
  // URL.hostname keeps brackets around IPv6 literals (e.g. "[::1]"); strip them.
  const host = hostname.replace(/^\[|\]$/g, "");

  // Literal IP in the URL: check directly.
  if (isIP(host)) {
    if (isBlockedIP(host)) {
      throw new Error("Заблоковано: приватна або службова IP-адреса");
    }
    return;
  }

  // Hostname: resolve via DoH and block if ANY record is private. Best-effort —
  // if resolution fails we proceed rather than break a legitimate site.
  const ips = await dohResolve(host);
  if (!ips) return;
  for (const ip of ips) {
    if (isBlockedIP(ip)) {
      throw new Error("Заблоковано: хост вказує на приватну IP-адресу");
    }
  }
}

export async function safeFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new Error("Некоректний URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Дозволені тільки http/https");
    }

    // Port allowlist: a real website serves on 80/443. Blocking other ports
    // stops the fetch being used to probe internal services (SSH 22, DBs,
    // admin panels on :8080, etc.) even on a public host.
    const port = parsed.port;
    if (port && port !== "80" && port !== "443") {
      throw new Error("Заблоковано: дозволені тільки порти 80/443");
    }

    await assertPublicHost(parsed.hostname);

    const resp = await fetch(current, { ...init, redirect: "manual" });

    // Not a redirect → final response.
    if (resp.status < 300 || resp.status >= 400) {
      return resp;
    }

    const location = resp.headers.get("location");
    if (!location) return resp; // redirect without target → hand it back as-is

    current = new URL(location, current).toString();
  }

  throw new Error("Забагато редиректів");
}
