import {
  authErrorRedirect,
  clearAuthCookies,
  createSessionCookie,
  exchangeGoogleCode,
  isAllowedAdminEmail,
  validateOAuthState,
} from "../../_lib/auth.js";
import { clearCookie, getRequestUrl, redirect, sendMethodNotAllowed } from "../../_lib/http.js";
import type { ApiRequest, ApiResponse } from "../../_lib/types.js";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "GET") {
    sendMethodNotAllowed(res, ["GET"]);
    return;
  }

  const url = getRequestUrl(req);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !validateOAuthState(req, state)) {
    res.setHeader("set-cookie", clearAuthCookies());
    redirect(res, authErrorRedirect("invalid_oauth_state"));
    return;
  }

  try {
    const profile = await exchangeGoogleCode(code);
    const email = profile.email?.toLowerCase();

    if (!email || profile.verified_email === false || !isAllowedAdminEmail(email)) {
      res.setHeader("set-cookie", clearAuthCookies());
      redirect(res, authErrorRedirect("admin_not_allowed"));
      return;
    }

    res.setHeader("set-cookie", [
      createSessionCookie(email, true),
      clearCookie("cvht_oauth_state"),
    ]);
    redirect(res, "/?admin=1");
  } catch {
    res.setHeader("set-cookie", clearAuthCookies());
    redirect(res, authErrorRedirect("google_oauth_failed"));
  }
}
