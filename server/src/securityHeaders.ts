import type { RequestHandler } from "express";

/**
 * Baseline security headers, applied to every response:
 *
 * - `X-Content-Type-Options: nosniff` — no MIME sniffing.
 * - `X-Frame-Options: DENY` — the API never renders inside a frame.
 * - `Referrer-Policy: no-referrer` — never leak URLs outward.
 * - `Strict-Transport-Security` — only when the request actually arrived
 *   over HTTPS (`req.secure`, or `X-Forwarded-Proto: https` from a TLS-
 *   terminating proxy), so local plain-HTTP development never pins HSTS
 *   for localhost.
 */
const HSTS_VALUE = "max-age=31536000; includeSubDomains";

export function securityHeaders(): RequestHandler {
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");

    // X-Forwarded-Proto may be a comma-separated chain; the first hop is
    // the protocol the client used.
    const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (req.secure || forwardedProto === "https") {
      res.setHeader("Strict-Transport-Security", HSTS_VALUE);
    }
    next();
  };
}
