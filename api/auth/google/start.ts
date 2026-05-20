import {
  buildGoogleAuthUrl,
  createOAuthStateCookie,
  OAUTH_STATE_COOKIE,
} from "../../_lib/auth";
import {
  checkRateLimit,
  clearCookie,
  redirect,
  sendJson,
  sendMethodNotAllowed,
} from "../../_lib/http";
import type { ApiRequest, ApiResponse } from "../../_lib/types";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (req.method !== "GET") {
    sendMethodNotAllowed(res, ["GET"]);
    return;
  }

  const rateLimit = checkRateLimit(req, "oauth-start", 10, 60_000);

  if (!rateLimit.ok) {
    sendJson(res, 429, {
      error: "rate_limit",
      message: `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${rateLimit.retryAfterSeconds} giây.`,
    });
    return;
  }

  try {
    const { state, cookie } = createOAuthStateCookie();
    res.setHeader("set-cookie", cookie);
    redirect(res, buildGoogleAuthUrl(state));
  } catch (error) {
    res.setHeader("set-cookie", clearCookie(OAUTH_STATE_COOKIE));
    sendJson(res, 500, {
      error: "oauth_not_configured",
      message:
        error instanceof Error
          ? error.message
          : "Google OAuth chưa được cấu hình.",
    });
  }
}
