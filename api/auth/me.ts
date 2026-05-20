import { readSession } from "../_lib/auth";
import { sendJson, sendMethodNotAllowed } from "../_lib/http";
import type { ApiRequest, ApiResponse } from "../_lib/types";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (req.method !== "GET") {
    sendMethodNotAllowed(res, ["GET"]);
    return;
  }

  const session = readSession(req);

  sendJson(res, 200, {
    email: session?.email || null,
    isAdmin: Boolean(session?.isAdmin),
  });
}

