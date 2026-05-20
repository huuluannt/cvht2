import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAdminEmails, getRequiredEnv } from "./env";
import { clearCookie, createCookie, getCookies, sendJson } from "./http";
import type { ApiRequest, ApiResponse } from "./types";

export const SESSION_COOKIE = "cvht_session";
export const OAUTH_STATE_COOKIE = "cvht_oauth_state";

type SessionPayload = {
  email: string;
  isAdmin: boolean;
  exp: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleUserInfo = {
  email?: string;
  verified_email?: boolean;
};

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signValue(value: string): string {
  const secret = getRequiredEnv("SESSION_SECRET");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function createSignedToken(payload: unknown): string {
  const body = base64Url(JSON.stringify(payload));
  return `${body}.${signValue(body)}`;
}

function verifySignedToken<T>(token: string): T | undefined {
  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return undefined;
  }

  const expected = signValue(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return undefined;
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  return payload;
}

export function createSessionCookie(email: string, isAdmin: boolean): string {
  const payload: SessionPayload = {
    email,
    isAdmin,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };

  return createCookie(SESSION_COOKIE, createSignedToken(payload), {
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function readSession(req: ApiRequest): SessionPayload | undefined {
  const token = getCookies(req)[SESSION_COOKIE];

  if (!token) {
    return undefined;
  }

  const payload = verifySignedToken<SessionPayload>(token);

  if (!payload || payload.exp <= Date.now()) {
    return undefined;
  }

  return payload;
}

export function requireAdmin(req: ApiRequest, res: ApiResponse): SessionPayload | undefined {
  const session = readSession(req);

  if (!session?.isAdmin) {
    sendJson(res, 401, {
      error: "admin_required",
      message: "Bạn cần đăng nhập bằng email admin được phép.",
    });
    return undefined;
  }

  return session;
}

export function createOAuthStateCookie(): { state: string; cookie: string } {
  const payload = {
    nonce: randomBytes(24).toString("base64url"),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const state = createSignedToken(payload);

  return {
    state,
    cookie: createCookie(OAUTH_STATE_COOKIE, state, {
      maxAge: 10 * 60,
    }),
  };
}

export function validateOAuthState(req: ApiRequest, state: string | null): boolean {
  if (!state) {
    return false;
  }

  const cookieState = getCookies(req)[OAUTH_STATE_COOKIE];

  if (!cookieState || cookieState !== state) {
    return false;
  }

  const payload = verifySignedToken<{ exp: number }>(state);
  return Boolean(payload && payload.exp > Date.now());
}

export function buildGoogleAuthUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", getRequiredEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", getRequiredEnv("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeGoogleCode(code: string): Promise<GoogleUserInfo> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: getRequiredEnv("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error || "Google OAuth token exchange failed.");
  }

  const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userResponse.ok) {
    throw new Error("Could not load Google user profile.");
  }

  return (await userResponse.json()) as GoogleUserInfo;
}

export function isAllowedAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.trim().toLowerCase());
}

export function authErrorRedirect(reason: string): string {
  return `/?auth=${encodeURIComponent(reason)}`;
}

export function clearAuthCookies(): string[] {
  return [clearCookie(SESSION_COOKIE), clearCookie(OAUTH_STATE_COOKIE)];
}
