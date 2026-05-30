// SSRF-safe fetch.
// The website analyzer fetches a URL supplied by the client. Without guards an
// attacker could point it at internal services (cloud metadata 169.254.169.254,
// localhost admin panels, RFC1918 hosts). This wrapper resolves the hostname and
// rejects any private / loopback / link-local / reserved address, and re-validates
// on every redirect hop instead of trusting redirect:"follow".

import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 5;

function ipToParts(ip: string): number[] | null {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p < 0 || p > 255)) return null;
  return parts;
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
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown format → block
}

async function assertPublicHost(hostname: string): Promise<void> {
  // URL.hostname keeps brackets around IPv6 literals (e.g. "[::1]"); strip them
  // so net.isIP recognises the address.
  const host = hostname.replace(/^\[|\]$/g, "");

  // Literal IP in the URL: check directly.
  if (net.isIP(host)) {
    if (isBlockedIP(host)) {
      throw new Error("Заблоковано: приватна або службова IP-адреса");
    }
    return;
  }
  // Resolve every A/AAAA record; block if ANY is private (DNS-rebinding safety).
  const records = await lookup(host, { all: true });
  if (records.length === 0) throw new Error("Не вдалося визначити IP хоста");
  for (const r of records) {
    if (isBlockedIP(r.address)) {
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
