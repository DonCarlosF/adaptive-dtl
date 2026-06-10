import { createApp } from "./app.js";
import { Store } from "./store.js";

const PORT = Number(process.env.PORT ?? 8787);
const JWT_SECRET = process.env.JWT_SECRET;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const DATA_FILE = process.env.DATA_FILE ?? "./data/db.json";

if (!JWT_SECRET) {
  console.error(
    "Refusing to start: set JWT_SECRET (a long random string) in the environment.",
  );
  process.exit(1);
}

const store = new Store(DATA_FILE);
const app = createApp({
  store,
  jwtSecret: JWT_SECRET,
  anthropicApiKey: ANTHROPIC_API_KEY,
});

app.listen(PORT, () => {
  console.log(`Adaptive DTL server listening on :${PORT}`);
  if (!ANTHROPIC_API_KEY) {
    console.warn(
      "ANTHROPIC_API_KEY is not set — the /api/ai/messages proxy will return 503.",
    );
  }
});
