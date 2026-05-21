import { clearAuthCookies } from "../_lib/auth.js";
import { sendJson, sendMethodNotAllowed } from "../_lib/http.js";
import type { ApiRequest, ApiResponse } from "../_lib/types.js";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (req.method !== "POST") {
    sendMethodNotAllowed(res, ["POST"]);
    return;
  }

  res.setHeader("set-cookie", clearAuthCookies());
  sendJson(res, 200, { ok: true });
}
