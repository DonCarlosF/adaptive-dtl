/**
 * Cloud backend client.
 *
 * The app runs in one of two modes:
 *   - Local (default): no VITE_API_URL set → IndexedDB + browser-key AI.
 *   - Cloud: VITE_API_URL set → login required, data synced via the
 *     backend in server/, AI proxied so the key stays server-side.
 *
 * `isCloudEnabled()` gates every cloud code path so the local experience
 * is byte-for-byte unchanged when no backend is configured.
 */

const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
const TOKEN_KEY = "adaptive-dtl.token";

export function isCloudEnabled(): boolean {
  return Boolean(API_URL);
}

/** Base URL of the cloud backend, or null in local mode. */
export function apiBaseUrl(): string | null {
  return API_URL ?? null;
}

/** WebSocket base URL derived from the API URL (http→ws, https→wss). */
export function wsBaseUrl(): string | null {
  if (!API_URL) return null;
  return API_URL.replace(/^http/, "ws");
}

/** Authorization header for raw fetches that bypass apiFetch (e.g. streaming). */
export function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore storage failures (private mode, etc.) */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Skip the auth header (for login/register). */
  noAuth?: boolean;
}

/**
 * Make a JSON request to the backend. Throws ApiError on non-2xx so
 * callers can branch on `.status` (e.g. 401 → log out).
 */
export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  if (!API_URL) throw new ApiError(0, "Cloud mode is not configured.");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!opts.noAuth) {
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  if (res.status === 204) return undefined as T;

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      /* leave json null */
    }
  }

  if (!res.ok) {
    const message =
      (json as { error?: string } | null)?.error ?? `Request failed (${res.status}).`;
    throw new ApiError(res.status, message);
  }
  return json as T;
}
