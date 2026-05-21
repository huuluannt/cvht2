import { parse, serialize } from "cookie";
import type { ApiRequest, ApiResponse } from "./types.js";

type JsonValue = Record<string, unknown> | unknown[];

type RateEntry = {
  count: number;
  resetAt: number;
};

const globalRateState = globalThis as typeof globalThis & {
  __cvhtRateLimit?: Map<string, RateEntry>;
};

const rateLimitStore = globalRateState.__cvhtRateLimit ?? new Map<string, RateEntry>();
globalRateState.__cvhtRateLimit = rateLimitStore;

export function sendJson(res: ApiResponse, statusCode: number, payload: JsonValue): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function sendMethodNotAllowed(res: ApiResponse, methods: string[]): void {
  res.setHeader("allow", methods.join(", "));
  sendJson(res, 405, {
    error: "method_not_allowed",
    message: `Method not allowed. Use: ${methods.join(", ")}.`,
  });
}

export function redirect(res: ApiResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader("location", location);
  res.end();
}

export function getRequestUrl(req: ApiRequest): URL {
  const host = req.headers.host || "localhost";
  return new URL(req.url || "/", `https://${host}`);
}

export function getCookies(req: ApiRequest): Record<string, string> {
  if (req.cookies) {
    return req.cookies;
  }

  const parsedCookies = parse(req.headers.cookie || "");
  return Object.fromEntries(
    Object.entries(parsedCookies).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function createCookie(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    path?: string;
    sameSite?: "lax" | "strict" | "none";
    secure?: boolean;
  } = {},
): string {
  return serialize(name, value, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...options,
  });
}

export function clearCookie(name: string): string {
  return serialize(name, "", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
  });
}

export async function readJsonBody<T>(
  req: ApiRequest,
  maxBytes = 128_000,
): Promise<T | undefined> {
  if (typeof req.body === "string") {
    return JSON.parse(req.body) as T;
  }

  if (req.body && typeof req.body === "object") {
    return req.body as T;
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBytes) {
      throw new Error("Request body is too large.");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export function getClientIp(req: ApiRequest): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const firstForwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0];

  return firstForwardedIp?.trim() || req.socket.remoteAddress || "unknown";
}

export function checkRateLimit(
  req: ApiRequest,
  scope: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const key = `${scope}:${getClientIp(req)}`;
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  current.count += 1;
  return { ok: true };
}
