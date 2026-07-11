import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createApp, type AppOptions } from "../src/app.js";
import { rateLimit, type RateLimitOptions } from "../src/rateLimit.js";
import { Store } from "../src/store.js";

const JWT_SECRET = "test-secret-please-rotate";

/** Minimal app exercising the middleware in isolation. */
function limitedApp(opts: RateLimitOptions, trustProxy = false) {
  const app = express();
  if (trustProxy) app.set("trust proxy", true);
  app.use(rateLimit(opts));
  app.get("/", (_req, res) => res.json({ ok: true }));
  return app;
}

function makeApp(extra?: Partial<AppOptions>) {
  return createApp({
    store: new Store(),
    jwtSecret: JWT_SECRET,
    anthropicApiKey: "sk-test",
    ...extra,
  });
}

describe("rateLimit middleware", () => {
  it("allows up to the limit, then responds 429 with retry-after", async () => {
    const app = limitedApp({ limit: 3, windowMs: 60_000, now: () => 0 });
    for (let i = 0; i < 3; i++) {
      await request(app).get("/").expect(200);
    }
    const blocked = await request(app).get("/");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many requests/i);
    // Oldest hit at t=0 leaves the 60s window at t=60s.
    expect(blocked.headers["retry-after"]).toBe("60");
  });

  it("slides the window: old hits stop counting once they age out", async () => {
    let t = 0;
    const app = limitedApp({ limit: 2, windowMs: 1_000, now: () => t });
    await request(app).get("/").expect(200); // t=0
    t = 400;
    await request(app).get("/").expect(200); // t=400
    t = 900;
    await request(app).get("/").expect(429); // both still in window
    t = 1_001; // the t=0 hit has aged out
    await request(app).get("/").expect(200);
    t = 1_200; // window now holds t=400 and t=1001
    await request(app).get("/").expect(429);
  });

  it("rejected requests do not consume budget", async () => {
    let t = 0;
    const app = limitedApp({ limit: 1, windowMs: 1_000, now: () => t });
    await request(app).get("/").expect(200);
    for (let i = 0; i < 5; i++) {
      await request(app).get("/").expect(429); // hammering while blocked
    }
    t = 1_001; // exactly when retry-after promised, budget is free again
    await request(app).get("/").expect(200);
  });

  it("tracks each client IP independently (behind trust proxy)", async () => {
    const app = limitedApp({ limit: 1, windowMs: 60_000, now: () => 0 }, true);
    await request(app).get("/").set("X-Forwarded-For", "10.0.0.1").expect(200);
    await request(app).get("/").set("X-Forwarded-For", "10.0.0.2").expect(200);
    await request(app).get("/").set("X-Forwarded-For", "10.0.0.1").expect(429);
    await request(app).get("/").set("X-Forwarded-For", "10.0.0.2").expect(429);
  });
});

describe("createApp rate limiting", () => {
  it("applies the strict tier to /api/auth/* without exhausting the general tier", async () => {
    const app = makeApp({
      rateLimit: { authLimit: 3, apiLimit: 100, windowMs: 60_000 },
      now: () => 0,
    });
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: "a@example.com", password: "password123" })
        .expect(401); // wrong creds — but the request was accepted
    }
    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@example.com", password: "password123" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
    // The general /api tier still has room.
    await request(app).get("/api/health").expect(200);
  });

  it("applies the general tier to all of /api/*", async () => {
    const app = makeApp({
      rateLimit: { authLimit: 100, apiLimit: 5, windowMs: 60_000 },
      now: () => 0,
    });
    for (let i = 0; i < 5; i++) {
      await request(app).get("/api/health").expect(200);
    }
    const blocked = await request(app).get("/api/health");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
  });

  it("recovers after the window passes (injected clock)", async () => {
    let t = 0;
    const app = makeApp({
      rateLimit: { authLimit: 100, apiLimit: 2, windowMs: 60_000 },
      now: () => t,
    });
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/health").expect(429);
    t = 60_001;
    await request(app).get("/api/health").expect(200);
  });

  it("is enabled by default with a strict auth tier", async () => {
    const app = makeApp(); // no rateLimit option at all
    let sawTooMany = false;
    for (let i = 0; i < 11 && !sawTooMany; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "password123" });
      sawTooMany = res.status === 429;
    }
    expect(sawTooMany).toBe(true);
  });

  it("can be disabled for tests", async () => {
    const app = makeApp({ rateLimit: { enabled: false } });
    for (let i = 0; i < 15; i++) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "password123" })
        .expect(401); // never 429
    }
  });
});
