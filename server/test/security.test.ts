import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { Store } from "../src/store.js";

function makeApp() {
  return createApp({
    store: new Store(),
    jwtSecret: "test-secret-please-rotate",
    anthropicApiKey: "sk-test",
  });
}

describe("security headers", () => {
  it("sets the baseline headers on every response", async () => {
    const res = await request(makeApp()).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("sets them on error responses too", async () => {
    const res = await request(makeApp()).get("/api/students"); // 401, no token
    expect(res.status).toBe(401);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("omits Strict-Transport-Security over plain HTTP", async () => {
    const res = await request(makeApp()).get("/api/health");
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("sends Strict-Transport-Security when the proxy says HTTPS", async () => {
    const res = await request(makeApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "https");
    expect(res.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("reads only the first hop of a chained X-Forwarded-Proto", async () => {
    const https = await request(makeApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "https, http");
    expect(https.headers["strict-transport-security"]).toBeDefined();

    const http = await request(makeApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "http, https");
    expect(http.headers["strict-transport-security"]).toBeUndefined();
  });
});
