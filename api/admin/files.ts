import { isSupportedFile, supportedFileTypesLabel } from "../_lib/extract.js";
import {
  checkRateLimit,
  getRequestUrl,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from "../_lib/http.js";
import { parseMultipartFiles } from "../_lib/multipart.js";
import { requireAdmin } from "../_lib/auth.js";
import {
  createDocumentFromBuffer,
  createDocumentFromText,
  deleteDocument,
  isStorageConfigError,
  listDocuments,
  reindexDocument,
  toPublicDocument,
} from "../_lib/store.js";
import type { ApiRequest, ApiResponse } from "../_lib/types.js";

const MAX_UPLOAD_SIZE = 4 * 1024 * 1024;
const MAX_DIRECT_CONTENT_BYTES = 128 * 1024;

type DirectContentBody = {
  title?: unknown;
  content?: unknown;
};

function isJsonRequest(req: ApiRequest): boolean {
  const contentType = req.headers["content-type"];
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return Boolean(value?.toLowerCase().includes("application/json"));
}

function directContentTitle(rawTitle: unknown): string {
  if (typeof rawTitle === "string" && rawTitle.trim()) {
    return rawTitle.trim().slice(0, 120);
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `Nội dung nhập trực tiếp ${timestamp}`;
}

async function handleUpload(req: ApiRequest, res: ApiResponse): Promise<void> {
  const files = await parseMultipartFiles(req, MAX_UPLOAD_SIZE);

  if (files.length === 0) {
    sendJson(res, 400, {
      error: "missing_file",
      message: "Vui lòng chọn ít nhất một file để upload.",
    });
    return;
  }

  const unsupported = files.find((file) => !isSupportedFile(file.fileName));

  if (unsupported) {
    sendJson(res, 415, {
      error: "unsupported_file_type",
      message: `File không được hỗ trợ. Chỉ nhận: ${supportedFileTypesLabel()}.`,
    });
    return;
  }

  const indexed = [];

  for (const file of files) {
    const document = await createDocumentFromBuffer(
      file.buffer,
      file.fileName || "untitled.txt",
      file.size,
    );
    const reindexed = await reindexDocument(document.id);

    if (reindexed) {
      indexed.push(toPublicDocument(reindexed));
    }
  }

  sendJson(res, 201, { files: indexed });
}

async function handleDirectContent(req: ApiRequest, res: ApiResponse): Promise<void> {
  const body = await readJsonBody<DirectContentBody>(req, MAX_DIRECT_CONTENT_BYTES + 4096);
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!content) {
    sendJson(res, 400, {
      error: "missing_content",
      message: "Vui lòng nhập nội dung trước khi lưu.",
    });
    return;
  }

  if (Buffer.byteLength(content, "utf8") > MAX_DIRECT_CONTENT_BYTES) {
    sendJson(res, 413, {
      error: "content_too_large",
      message: "Nội dung nhập trực tiếp quá dài. Vui lòng giữ dưới 128 KB.",
    });
    return;
  }

  const document = await createDocumentFromText(content, directContentTitle(body?.title));
  const reindexed = await reindexDocument(document.id);

  sendJson(res, 201, {
    file: toPublicDocument(reindexed || document),
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    if (!["GET", "POST", "DELETE"].includes(req.method || "")) {
      sendMethodNotAllowed(res, ["GET", "POST", "DELETE"]);
      return;
    }

    if (!requireAdmin(req, res)) {
      return;
    }

    const rateLimit = checkRateLimit(req, "admin-files", 30, 60_000);

    if (!rateLimit.ok) {
      sendJson(res, 429, {
        error: "rate_limit",
        message: `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${rateLimit.retryAfterSeconds} giây.`,
      });
      return;
    }

    const url = getRequestUrl(req);

    if (req.method === "GET") {
      sendJson(res, 200, { files: await listDocuments() });
      return;
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");

      if (!id) {
        sendJson(res, 400, {
          error: "missing_document_id",
          message: "Thiếu document id.",
        });
        return;
      }

      const deleted = await deleteDocument(id);

      sendJson(res, deleted ? 200 : 404, {
        ok: deleted,
        message: deleted ? "Đã xóa file." : "Không tìm thấy file.",
      });
      return;
    }

    if (url.searchParams.get("action") === "reindex") {
      const id = url.searchParams.get("id");

      if (!id) {
        sendJson(res, 400, {
          error: "missing_document_id",
          message: "Thiếu document id.",
        });
        return;
      }

      const document = await reindexDocument(id);

      if (!document) {
        sendJson(res, 404, {
          error: "document_not_found",
          message: "Không tìm thấy file.",
        });
        return;
      }

      sendJson(res, 200, { file: toPublicDocument(document) });
      return;
    }

    if (isJsonRequest(req)) {
      await handleDirectContent(req, res);
      return;
    }

    await handleUpload(req, res);
  } catch (error) {
    const isDirectContentRequest = isJsonRequest(req);
    const message =
      error instanceof Error ? error.message : "Không thể xử lý file. Vui lòng thử lại.";
    const isTooLarge = message.toLowerCase().includes("too large");

    console.error("[api/admin/files] request failed", {
      method: req.method,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    const storageNotConfigured = isStorageConfigError(error);

    if (isTooLarge) {
      sendJson(res, 413, {
        error: isDirectContentRequest ? "content_too_large" : "file_too_large",
        message: isDirectContentRequest
          ? "Nội dung nhập trực tiếp quá dài. Vui lòng giữ dưới 128 KB."
          : "File quá lớn. Vercel Functions chỉ nhận payload tối đa 4.5 MB; hãy upload file dưới 4 MB.",
      });
      return;
    }

    if (storageNotConfigured) {
      sendJson(res, 503, {
        error: "storage_not_configured",
        message:
          "Chưa cấu hình kho dữ liệu tài liệu dùng chung cho production. Hãy thêm UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN trong Vercel, redeploy, rồi upload lại file.",
      });
      return;
    }

    sendJson(res, 500, {
      error: "admin_file_error",
      message,
    });
  }
}
