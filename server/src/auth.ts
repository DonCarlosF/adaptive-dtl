import { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Store, User } from "./store.js";

const TOKEN_TTL = "30d";
const BCRYPT_ROUNDS = 10;

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

export async function register(
  store: Store,
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
  store: Store,
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
