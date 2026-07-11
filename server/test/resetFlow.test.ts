import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { createApp, type AppOptions } from "../src/app.js";
import { Store, type DataStore } from "../src/store.js";
import { SqliteStore } from "../src/sqliteStore.js";

const JWT_SECRET = "test-secret-please-rotate";

function makeApp(store: DataStore, extra?: Partial<AppOptions>) {
  return createApp({
    store,
    jwtSecret: JWT_SECRET,
    anthropicApiKey: "sk-test",
    exposeResetTokens: true, // dev/test-only switch under test here
    rateLimit: { enabled: false },
    ...extra,
  });
}

async function registerUser(app: ReturnType<typeof makeApp>, email: string) {
  await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123" })
    .expect(201);
}

const backends: Array<[string, () => DataStore]> = [
  ["Store (JSON)", () => new Store()],
  ["SqliteStore", () => new SqliteStore()],
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(backends)("password reset (%s)", (_name, makeStore) => {
  it("resets the password end to end: request, consume, sign in", async () => {
    const app = makeApp(makeStore());
    await registerUser(app, "forgetful@example.com");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const reqRes = await request(app)
      .post("/api/auth/request-reset")
      .send({ email: "forgetful@example.com" });
    expect(reqRes.status).toBe(200);
    const token = reqRes.body.resetToken as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex
    // Delivery stand-in: the token is logged server-side.
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes(token))).toBe(true);

    await request(app)
      .post("/api/auth/reset")
      .send({ token, newPassword: "brand-new-pass1" })
      .expect(200);

    // New password works; the old one no longer does.
    await request(app)
      .post("/api/auth/login")
      .send({ email: "forgetful@example.com", password: "brand-new-pass1" })
      .expect(200);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "forgetful@example.com", password: "password123" })
      .expect(401);
  });

  it("answers 200 for an unknown email without leaking existence", async () => {
    const app = makeApp(makeStore());
    const res = await request(app)
      .post("/api/auth/request-reset")
      .send({ email: "who@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true }); // no resetToken even when exposed
  });

  it("rejects an expired token", async () => {
    let t = 1_000_000;
    const app = makeApp(makeStore(), { now: () => t });
    await registerUser(app, "slow@example.com");
    const { body } = await request(app)
      .post("/api/auth/request-reset")
      .send({ email: "slow@example.com" });

    t += 31 * 60 * 1000; // past the 30-minute TTL
    const res = await request(app)
      .post("/api/auth/reset")
      .send({ token: body.resetToken, newPassword: "brand-new-pass1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);

    // The old password still works — nothing was changed.
    await request(app)
      .post("/api/auth/login")
      .send({ email: "slow@example.com", password: "password123" })
      .expect(200);
  });

  it("rejects a reused token (single-use)", async () => {
    const app = makeApp(makeStore());
    await registerUser(app, "reuse@example.com");
    const { body } = await request(app)
      .post("/api/auth/request-reset")
      .send({ email: "reuse@example.com" });

    await request(app)
      .post("/api/auth/reset")
      .send({ token: body.resetToken, newPassword: "first-new-pass1" })
      .expect(200);
    const again = await request(app)
      .post("/api/auth/reset")
      .send({ token: body.resetToken, newPassword: "second-new-pass1" });
    expect(again.status).toBe(400);

    // The password from the first (only) successful reset stands.
    await request(app)
      .post("/api/auth/login")
      .send({ email: "reuse@example.com", password: "first-new-pass1" })
      .expect(200);
  });
});

describe("password reset validation & exposure", () => {
  it("rejects a short newPassword and a bogus token", async () => {
    const app = makeApp(new Store());
    await registerUser(app, "v@example.com");
    const { body } = await request(app)
      .post("/api/auth/request-reset")
      .send({ email: "v@example.com" });

    await request(app)
      .post("/api/auth/reset")
      .send({ token: body.resetToken, newPassword: "short" })
      .expect(400);
    await request(app)
      .post("/api/auth/reset")
      .send({ token: "not-a-real-token", newPassword: "long-enough-pass1" })
      .expect(400);
    await request(app).post("/api/auth/request-reset").send({ email: "nope" }).expect(400);
  });

  it("never echoes the token unless exposeResetTokens is set", async () => {
    const app = createApp({
      store: new Store(),
      jwtSecret: JWT_SECRET,
      anthropicApiKey: "sk-test",
      rateLimit: { enabled: false },
      // note: no exposeResetTokens
    });
    await registerUser(app, "prod@example.com");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await request(app)
      .post("/api/auth/request-reset")
      .send({ email: "prod@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.body.resetToken).toBeUndefined();
    expect(logSpy).toHaveBeenCalled(); // still delivered via server log
  });
});
