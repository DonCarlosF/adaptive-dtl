import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { login, register, AuthUser } from "@/api/auth";
import { ApiError } from "@/api/client";

interface Props {
  onAuthed: (user: AuthUser) => void;
}

/**
 * Login / register gate, shown only in cloud mode (VITE_API_URL set).
 * In local mode the app never renders this — it goes straight to the
 * dashboard against IndexedDB.
 */
export function Login({ onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === "login"
          ? await login(email.trim(), password)
          : await register(email.trim(), password);
      onAuthed(user);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
      <Card className="p-8 w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink mb-1">Adaptive DTL</h1>
        <p className="text-sm text-muted mb-6">
          {mode === "login"
            ? "Sign in to your classroom."
            : "Create a teacher account."}
        </p>
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-sm text-ink">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-sage"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink">Password</span>
            <input
              type="password"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-sage"
            />
          </label>
          {error && <p className="text-sm text-coral">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy
              ? "Working…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "login" ? "register" : "login"));
            setError(null);
          }}
          className="mt-4 text-sm text-sage-600 hover:underline"
        >
          {mode === "login"
            ? "Need an account? Register"
            : "Already have an account? Sign in"}
        </button>
      </Card>
    </div>
  );
}
