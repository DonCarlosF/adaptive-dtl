import { createServer } from "node:http";
import { createApp } from "./app.js";
import { DataStore, Store } from "./store.js";
import { SqliteStore } from "./sqliteStore.js";
import { attachRealtime } from "./realtimeServer.js";

const PORT = Number(process.env.PORT ?? 8787);
const JWT_SECRET = process.env.JWT_SECRET;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const DATA_BACKEND = (process.env.DATA_BACKEND ?? "json").toLowerCase();
const DATA_FILE = process.env.DATA_FILE ?? "./data/db.json";
const DB_FILE = process.env.DB_FILE ?? "./data/app.db";
const TRUST_PROXY = process.env.TRUST_PROXY;

if (!JWT_SECRET) {
  console.error(
    "Refusing to start: set JWT_SECRET (a long random string) in the environment.",
  );
  process.exit(1);
}

if (DATA_BACKEND !== "json" && DATA_BACKEND !== "sqlite") {
  console.error(
    `Refusing to start: unknown DATA_BACKEND "${DATA_BACKEND}" (use "json" or "sqlite").`,
  );
  process.exit(1);
}

// json (default): the original JSON-file store. sqlite: WAL-mode SQLite.
const store: DataStore =
  DATA_BACKEND === "sqlite" ? new SqliteStore(DB_FILE) : new Store(DATA_FILE);

// Express `trust proxy`: "true"/"1"…N hop counts, or a preset like
// "loopback". Only set this when running behind a proxy you control.
const trustProxy =
  TRUST_PROXY === undefined || TRUST_PROXY === ""
    ? undefined
    : TRUST_PROXY === "true"
      ? true
      : /^\d+$/.test(TRUST_PROXY)
        ? Number(TRUST_PROXY)
        : TRUST_PROXY;

const app = createApp({
  store,
  jwtSecret: JWT_SECRET,
  anthropicApiKey: ANTHROPIC_API_KEY,
  trustProxy,
});

// --- realtime co-presence: run Express on a raw HTTP server so the
// WebSocket relay can share the port via the upgrade handler. ---
const server = createServer(app);
attachRealtime(server, { jwtSecret: JWT_SECRET, path: "/ws/session" });

server.listen(PORT, () => {
  console.log(`Adaptive DTL server listening on :${PORT} (REST + /ws/session)`);
  console.log(
    DATA_BACKEND === "sqlite"
      ? `Data backend: sqlite (${DB_FILE}, WAL)`
      : `Data backend: json (${DATA_FILE})`,
  );
  if (!ANTHROPIC_API_KEY) {
    console.warn(
      "ANTHROPIC_API_KEY is not set — the /api/ai/messages proxy will return 503.",
    );
  }
});
