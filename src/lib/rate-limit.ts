// Lightweight per-IP sliding-window rate limiter.
//
// This is BEST-EFFORT: state lives in a module-level Map, so on Cloudflare
// Workers it is per-isolate (an attacker spread across isolates isn't fully
// stopped) and resets when an isolate recycles. It cheaply blocks the common
// case — a single client hammering an endpoint — without any infrastructure.
// For hard guarantees use Cloudflare WAF rate-limiting rules or a Durable
// Object / KV-backed counter.

interface Decision {
  ok: boolean;
  retryAfter: number; // seconds until the next request is allowed
}

const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 5000; // cap memory; evict oldest when exceeded

/** Extract the caller's IP from Cloudflare / proxy headers. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Records a hit and reports whether it is within `limit` requests per
 * `windowMs`. Keyed by `${name}:${ip}` so each endpoint has its own budget.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Decision {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
    return { ok: false, retryAfter };
  }

  recent.push(now);

  // Simple memory guard: drop the oldest bucket if the map grows too large.
  if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }
  buckets.set(key, recent);
  return { ok: true, retryAfter: 0 };
}
