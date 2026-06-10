/**
 * Auth flow against the cloud backend. No-ops / throws are never reached
 * in local mode because the UI only renders the login gate when
 * `isCloudEnabled()` is true.
 */
import { apiFetch, clearToken, getToken, setToken } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  createdAt: number;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function register(email: string, password: string): Promise<AuthUser> {
  const res = await apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: { email, password },
    noAuth: true,
  });
  setToken(res.token);
  return res.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    noAuth: true,
  });
  setToken(res.token);
  return res.user;
}

export function logout(): void {
  clearToken();
}

/** Resolve the current user from a stored token, or null if not logged in. */
export async function currentUser(): Promise<AuthUser | null> {
  if (!getToken()) return null;
  try {
    const res = await apiFetch<{ user: AuthUser }>("/api/auth/me");
    return res.user;
  } catch {
    clearToken();
    return null;
  }
}
