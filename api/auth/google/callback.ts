import {
  authErrorRedirect,
  clearAuthCookies,
  createSessionCookie,
  exchangeGoogleCode,
  isAllowedAdminEmail,
  readOAuthState,
  readSignedOAuthState,
} from "../../_lib/auth.js";
import { clearCookie, getRequestUrl, redirect, sendMethodNotAllowed } from "../../_lib/http.js";
import type { ApiRequest, ApiResponse } from "../../_lib/types.js";

type PopupResult = {
  type: "cvht2:auth";
  ok: boolean;
  email?: string;
  reason?: string;
};

function sendPopupResult(res: ApiResponse, result: PopupResult): void {
  const payload = JSON.stringify(result).replace(/</g, "\\u003c");

  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CVHT2 Admin Login</title>
    <style>
      body {
        align-items: center;
        background: #f4faf7;
        color: #12332a;
        display: flex;
        font-family: Arial, sans-serif;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
      }
      main {
        background: white;
        border: 1px solid #d7e6df;
        border-radius: 12px;
        box-shadow: 0 16px 40px rgba(10, 54, 44, 0.14);
        max-width: 360px;
        padding: 28px;
        text-align: center;
      }
      h1 {
        font-size: 20px;
        margin: 0 0 10px;
      }
      p {
        color: #5d6f68;
        line-height: 1.5;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${result.ok ? "Đăng nhập thành công" : "Đăng nhập thất bại"}</h1>
      <p>Cửa sổ này sẽ tự đóng.</p>
    </main>
    <script>
      (function () {
        var payload = ${payload};
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, window.location.origin);
        }
        setTimeout(function () {
          window.close();
        }, 500);
      })();
    </script>
  </body>
</html>`);
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "GET") {
    sendMethodNotAllowed(res, ["GET"]);
    return;
  }

  const url = getRequestUrl(req);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthState = readOAuthState(req, state);
  const isPopup = Boolean(oauthState?.popup || readSignedOAuthState(state)?.popup);

  if (!code || !oauthState) {
    res.setHeader("set-cookie", clearAuthCookies());
    if (isPopup) {
      sendPopupResult(res, {
        type: "cvht2:auth",
        ok: false,
        reason: "invalid_oauth_state",
      });
      return;
    }
    redirect(res, authErrorRedirect("invalid_oauth_state"));
    return;
  }

  try {
    const profile = await exchangeGoogleCode(code);
    const email = profile.email?.toLowerCase();

    if (!email || profile.verified_email === false || !isAllowedAdminEmail(email)) {
      res.setHeader("set-cookie", clearAuthCookies());
      if (isPopup) {
        sendPopupResult(res, {
          type: "cvht2:auth",
          ok: false,
          reason: "admin_not_allowed",
        });
        return;
      }
      redirect(res, authErrorRedirect("admin_not_allowed"));
      return;
    }

    res.setHeader("set-cookie", [
      createSessionCookie(email, true),
      clearCookie("cvht_oauth_state"),
    ]);
    if (isPopup) {
      sendPopupResult(res, {
        type: "cvht2:auth",
        ok: true,
        email,
      });
      return;
    }
    redirect(res, "/?admin=1");
  } catch {
    res.setHeader("set-cookie", clearAuthCookies());
    if (isPopup) {
      sendPopupResult(res, {
        type: "cvht2:auth",
        ok: false,
        reason: "google_oauth_failed",
      });
      return;
    }
    redirect(res, authErrorRedirect("google_oauth_failed"));
  }
}
