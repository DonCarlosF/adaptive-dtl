import { createHash, randomBytes } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { DataStore, User } from "./store.js";

const TOKEN_TTL = "30d";
const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_BYTES = 32;
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export const credentialsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

export interface AuthedRequest extends Request {
  userId?: string;
}

function publicUser(u: User) {
  return { id: u.id, email: u.email, createdAt: u.createdAt };
}

export function signToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: TOKEN_TTL });
}

/**
 * Verify a JWT and return its payload, or null if invalid/expired. Used by
 * the WebSocket upgrade handler (which can't use Express middleware).
 */
export function verifyToken(
  token: string,
  secret: string,
): { sub: string } | null {
  try {
    const payload = jwt.verify(token, secret) as { sub?: string };
    return payload.sub ? { sub: payload.sub } : null;
  } catch {
    return null;
  }
}

export async function register(
  store: DataStore,
  secret: string,
  email: string,
  password: string,
): Promise<
  { ok: true; token: string; user: ReturnType<typeof publicUser> } | { ok: false; error: string }
> {
  if (store.findUserByEmail(email)) {
    return { ok: false, error: "An account with that email already exists." };
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = store.createUser(email, passwordHash);
  return { ok: true, token: signToken(user.id, secret), user: publicUser(user) };
}

export async function login(
  store: DataStore,
  secret: string,
  email: string,
  password: string,
): Promise<
  { ok: true; token: string; user: ReturnType<typeof publicUser> } | { ok: false; error: string }
> {
  const user = store.findUserByEmail(email);
  if (!user) return { ok: false, error: "Invalid email or password." };
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return { ok: false, error: "Invalid email or password." };
  return { ok: true, token: signToken(user.id, secret), user: publicUser(user) };
}

/** Hash a reset token for storage — a leaked store never exposes live tokens. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Start a password reset. Returns the raw single-use token when the account
 * exists, or null when it doesn't. The HTTP layer MUST respond identically
 * in both cases (200) so the endpoint can't be used to enumerate accounts.
 */
export function requestPasswordReset(
  store: DataStore,
  email: string,
  now: () => number = Date.now,
): string | null {
  const user = store.findUserByEmail(email);
  if (!user) return null;
  const token = randomBytes(RESET_TOKEN_BYTES).toString("hex");
  store.createResetToken(user.id, hashResetToken(token), now() + RESET_TOKEN_TTL_MS);
  return token;
}

/**
 * Complete a password reset: consume the token (single-use, 30-min expiry)
 * and bcrypt-rehash the new password.
 */
export async function resetPassword(
  store: DataStore,
  token: string,
  newPassword: string,
  now: () => number = Date.now,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = store.consumeResetToken(hashResetToken(token), now());
  if (!userId) return { ok: false, error: "Invalid or expired reset token." };
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  store.updateUserPassword(userId, passwordHash);
  return { ok: true };
}

/** Express middleware: require a valid Bearer token, set req.userId. */
export function requireAuth(secret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "Missing authorization token." });
      return;
    }
    try {
      const payload = jwt.verify(token, secret) as { sub?: string };
      if (!payload.sub) {
        res.status(401).json({ error: "Invalid token." });
        return;
      }
      req.userId = payload.sub;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token." });
    }
  };
}

export { publicUser };
