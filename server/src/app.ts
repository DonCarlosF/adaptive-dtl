import express, { Response } from "express";
import cors from "cors";
import { z } from "zod";
import { Store } from "./store.js";
import {
  AuthedRequest,
  credentialsSchema,
  login,
  register,
  requireAuth,
} from "./auth.js";
import {
  ProxyParams,
  ProxyResult,
  proxyAnthropic,
  StreamResult,
  streamAnthropic,
} from "./anthropic.js";

export interface AppOptions {
  store: Store;
  jwtSecret: string;
  anthropicApiKey: string;
  /** Injectable for tests so the AI route never hits the network. */
  proxy?: (apiKey: string, params: ProxyParams) => Promise<ProxyResult>;
  /** Injectable streaming proxy for tests. */
  streamer?: (apiKey: string, params: ProxyParams) => Promise<StreamResult>;
}

const recordSchema = z.object({ id: z.string().min(1).max(200) }).passthrough();

const aiMessageSchema = z.object({
  systemPrompt: z.string().min(1).max(20_000),
  userPrompt: z.string().min(1).max(20_000),
  model: z.string().max(100).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
});

export function createApp(opts: AppOptions) {
  const { store, jwtSecret, anthropicApiKey } = opts;
  const proxy = opts.proxy ?? proxyAnthropic;
  const streamer = opts.streamer ?? streamAnthropic;
  const auth = requireAuth(jwtSecret);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // --- Auth --------------------------------------------------------------

  app.post("/api/auth/register", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Email and an 8+ character password are required." });
    }
    const out = await register(store, jwtSecret, parsed.data.email, parsed.data.password);
    if (!out.ok) return res.status(409).json({ error: out.error });
    res.status(201).json({ token: out.token, user: out.user });
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const out = await login(store, jwtSecret, parsed.data.email, parsed.data.password);
    if (!out.ok) return res.status(401).json({ error: out.error });
    res.json({ token: out.token, user: out.user });
  });

  app.get("/api/auth/me", auth, (req: AuthedRequest, res) => {
    const user = store.findUserById(req.userId!);
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } });
  });

  // --- Students ----------------------------------------------------------

  app.get("/api/students", auth, (req: AuthedRequest, res) => {
    res.json({ students: store.listStudents(req.userId!) });
  });

  app.put("/api/students/:id", auth, (req: AuthedRequest, res) => {
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.id !== req.params.id) {
      return res.status(400).json({ error: "Body must be a student object whose id matches the URL." });
    }
    store.upsertStudent(req.userId!, req.params.id, parsed.data);
    res.json({ ok: true });
  });

  app.delete("/api/students/:id", auth, (req: AuthedRequest, res) => {
    store.removeStudent(req.userId!, req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/students/:id/sessions", auth, (req: AuthedRequest, res) => {
    res.json({ sessions: store.listSessions(req.userId!, req.params.id) });
  });

  // --- Sessions ----------------------------------------------------------

  app.post("/api/sessions", auth, (req: AuthedRequest, res) => {
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success || typeof parsed.data.studentId !== "string") {
      return res.status(400).json({ error: "Body must be a session object with id and studentId." });
    }
    store.saveSession(req.userId!, parsed.data.id, parsed.data);
    res.status(201).json({ ok: true });
  });

  // --- AI generated sets -------------------------------------------------

  app.get("/api/students/:id/ai/:domain/latest", auth, (req: AuthedRequest, res) => {
    const set = store.latestAiSet(req.userId!, req.params.id, req.params.domain);
    if (!set) return res.status(204).end();
    res.json({ set });
  });

  app.get("/api/ai-sets/:id", auth, (req: AuthedRequest, res) => {
    const set = store.getAiSet(req.userId!, req.params.id);
    if (!set) return res.status(204).end();
    res.json({ set });
  });

  app.put("/api/ai-sets/:id", auth, (req: AuthedRequest, res) => {
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.id !== req.params.id) {
      return res.status(400).json({ error: "Body must be an AI set whose id matches the URL." });
    }
    store.saveAiSet(req.userId!, req.params.id, parsed.data);
    res.json({ ok: true });
  });

  // --- AI proxy ----------------------------------------------------------

  app.post("/api/ai/messages", auth, async (req: AuthedRequest, res: Response) => {
    const parsed = aiMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "systemPrompt and userPrompt are required." });
    }
    const out = await proxy(anthropicApiKey, parsed.data);
    if (!out.ok) return res.status(out.status).json({ error: out.error });
    res.json({ text: out.text, model: out.model });
  });

  // Streaming proxy for the teacher co-pilot. Relays Anthropic's raw SSE
  // chunks straight through; the browser's SSEParser owns the wire format.
  // The server key never leaves the server.
  app.post("/api/ai/stream", auth, async (req: AuthedRequest, res: Response) => {
    const parsed = aiMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "systemPrompt and userPrompt are required." });
    }
    const out = await streamer(anthropicApiKey, parsed.data);
    if (!out.ok) return res.status(out.status).json({ error: out.error });

    res.status(200);
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("connection", "keep-alive");
    res.flushHeaders?.();
    try {
      for await (const chunk of out.stream) {
        res.write(chunk);
      }
    } catch {
      // Upstream dropped mid-stream — send a terminal SSE error frame the
      // client's parser understands, then end.
      res.write(
        `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "stream_error", message: "Upstream stream interrupted." } })}\n\n`,
      );
    } finally {
      res.end();
    }
  });

  return app;
}
