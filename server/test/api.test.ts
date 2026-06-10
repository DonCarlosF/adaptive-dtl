import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { Store } from "../src/store.js";
import type { ProxyParams, ProxyResult } from "../src/anthropic.js";

const JWT_SECRET = "test-secret-please-rotate";

function makeApp(proxy?: (k: string, p: ProxyParams) => Promise<ProxyResult>) {
  return createApp({
    store: new Store(), // in-memory
    jwtSecret: JWT_SECRET,
    anthropicApiKey: "sk-test",
    proxy,
  });
}

async function registerUser(app: ReturnType<typeof makeApp>, email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123" });
  return res.body.token as string;
}

describe("health", () => {
  it("responds ok", async () => {
    const res = await request(makeApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("auth", () => {
  let app: ReturnType<typeof makeApp>;
  beforeEach(() => {
    app = makeApp();
  });

  it("registers a new user and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "teacher@example.com", password: "password123" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("teacher@example.com");
  });

  it("rejects a weak password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "teacher@example.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate email", async () => {
    await registerUser(app, "dupe@example.com");
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "dupe@example.com", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await registerUser(app, "login@example.com");
    const ok = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@example.com", password: "password123" });
    expect(ok.status).toBe(200);
    const bad = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@example.com", password: "wrongpass1" });
    expect(bad.status).toBe(401);
  });

  it("returns the current user from a token", async () => {
    const token = await registerUser(app, "me@example.com");
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("me@example.com");
  });

  it("rejects protected routes without a token", async () => {
    const res = await request(app).get("/api/students");
    expect(res.status).toBe(401);
  });
});

describe("students & sessions", () => {
  let app: ReturnType<typeof makeApp>;
  let token: string;
  beforeEach(async () => {
    app = makeApp();
    token = await registerUser(app, "data@example.com");
  });

  const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

  it("stores and lists students for the authed user", async () => {
    await auth(
      request(app).put("/api/students/stu1").send({ id: "stu1", name: "Ana" }),
    ).expect(200);
    const res = await auth(request(app).get("/api/students"));
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].name).toBe("Ana");
  });

  it("rejects a student whose body id mismatches the URL", async () => {
    const res = await auth(
      request(app).put("/api/students/stu1").send({ id: "other", name: "Ana" }),
    );
    expect(res.status).toBe(400);
  });

  it("saves and lists sessions for a student", async () => {
    await auth(
      request(app)
        .post("/api/sessions")
        .send({ id: "sess1", studentId: "stu1", accuracy: 0.8 }),
    ).expect(201);
    const res = await auth(request(app).get("/api/students/stu1/sessions"));
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].accuracy).toBe(0.8);
  });

  it("cascades session deletion when a student is removed", async () => {
    await auth(
      request(app).put("/api/students/stu1").send({ id: "stu1", name: "Ana" }),
    );
    await auth(
      request(app).post("/api/sessions").send({ id: "sess1", studentId: "stu1" }),
    );
    await auth(request(app).delete("/api/students/stu1")).expect(200);
    const res = await auth(request(app).get("/api/students/stu1/sessions"));
    expect(res.body.sessions).toHaveLength(0);
  });

  it("scopes data per user — one teacher cannot see another's students", async () => {
    await auth(
      request(app).put("/api/students/stu1").send({ id: "stu1", name: "Ana" }),
    );
    const otherToken = await registerUser(app, "other@example.com");
    const res = await request(app)
      .get("/api/students")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.body.students).toHaveLength(0);
  });
});

describe("AI proxy", () => {
  it("returns proxied text and never exposes the key", async () => {
    let seenKey = "";
    const app = makeApp(async (key, params) => {
      seenKey = key;
      return { ok: true, text: `echo:${params.userPrompt}`, model: "claude-sonnet-4-6" };
    });
    const token = await registerUser(app, "ai@example.com");
    const res = await request(app)
      .post("/api/ai/messages")
      .set("Authorization", `Bearer ${token}`)
      .send({ systemPrompt: "sys", userPrompt: "make trials" });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("echo:make trials");
    expect(seenKey).toBe("sk-test"); // key stayed server-side
    expect(JSON.stringify(res.body)).not.toContain("sk-test");
  });

  it("requires auth", async () => {
    const res = await request(makeApp())
      .post("/api/ai/messages")
      .send({ systemPrompt: "sys", userPrompt: "u" });
    expect(res.status).toBe(401);
  });

  it("surfaces a proxy error status", async () => {
    const app = makeApp(async () => ({ ok: false, status: 429, error: "rate limited" }));
    const token = await registerUser(app, "err@example.com");
    const res = await request(app)
      .post("/api/ai/messages")
      .set("Authorization", `Bearer ${token}`)
      .send({ systemPrompt: "s", userPrompt: "u" });
    expect(res.status).toBe(429);
  });
});
