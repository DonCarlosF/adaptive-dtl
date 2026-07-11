import type { RequestHandler } from "express";

/**
 * Dependency-free per-IP rate limiting (sliding-window log).
 *
 * Each client IP gets a list of accepted-request timestamps; a request is
 * rejected with 429 + `retry-after` (seconds) once `limit` requests have
 * been accepted within the trailing `windowMs`. Rejected requests do not
 * count against the window, so a client that backs off recovers exactly
 * when `retry-after` says it will.
 *
 * Keying uses `req.ip`. Behind a reverse proxy / load balancer every client
 * shares the proxy's address until Express is told to trust the
 * `X-Forwarded-For` chain — set the `trustProxy` option of `createApp`
 * (env `TRUST_PROXY`) in that deployment. Do NOT enable it when clients
 * connect directly, or they could spoof their way past the limiter.
 *
 * The clock is injectable so tests can march time forward deterministically.
 */
export interface RateLimitOptions {
  /** Maximum accepted requests per IP within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Safety cap on distinct IPs tracked; a sweep evicts idle ones beyond it. */
  maxEntries?: number;
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const { limit, windowMs } = options;
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 10_000;
  /** IP → ascending timestamps of accepted requests still inside the window. */
  const hits = new Map<string, number[]>();

  return (req, res, next) => {
    const key = req.ip ?? "unknown";
    const t = now();
    const cutoff = t - windowMs;

    let stamps = hits.get(key);
    if (!stamps) {
      stamps = [];
      hits.set(key, stamps);
    }
    // Slide the window: drop timestamps that are no longer inside it.
    while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();

    if (stamps.length >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((stamps[0] - cutoff) / 1000));
      res.setHeader("retry-after", String(retryAfterSec));
      res.status(429).json({ error: "Too many requests. Please retry later." });
      return;
    }

    stamps.push(t);
    if (hits.size > maxEntries) sweep(hits, cutoff);
    next();
  };
}

/** Evict IPs whose every timestamp has left the window (bounds memory). */
function sweep(hits: Map<string, number[]>, cutoff: number): void {
  for (const [key, stamps] of hits) {
    while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();
    if (stamps.length === 0) hits.delete(key);
  }
}
