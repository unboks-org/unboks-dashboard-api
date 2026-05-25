import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const DEV_SECRET = "fallback-dev-secret";

function getSessionSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (secret?.trim()) {
    return secret;
  }
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return DEV_SECRET;
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

export function createToken(clientSlug: string): string {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64urlEncode(
    JSON.stringify({
      sub: clientSlug,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    }),
  );
  const sig = createHmac("sha256", getSessionSecret())
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts as [string, string, string];
    const expected = createHmac("sha256", getSessionSecret())
      .update(`${header}.${payload}`)
      .digest("base64url");
    // timing-safe comparison — pad to equal length
    const a = Buffer.from(sig.padEnd(expected.length, "="), "ascii");
    const b = Buffer.from(expected.padEnd(sig.length, "="), "ascii");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(base64urlDecode(payload)) as TokenPayload;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ detail: "Unauthorized" });
    return;
  }
  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({ detail: "Unauthorized" });
    return;
  }
  (req as Record<string, unknown>)["authPayload"] = payload;
  next();
}
