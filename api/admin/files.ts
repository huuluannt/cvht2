import formidable from "formidable";
import { isSupportedFile, supportedFileTypesLabel } from "../_lib/extract";
import { checkRateLimit, getRequestUrl, sendJson, sendMethodNotAllowed } from "../_lib/http";
import { requireAdmin } from "../_lib/auth";
import {
  createDocumentFromTempFile,
  deleteDocument,
  listDocuments,
  reindexDocument,
  toPublicDocument,
} from "../_lib/store";
import type { ApiRequest, ApiResponse } from "../_lib/types";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

type FormidableFile = {
  filepath: string;
  originalFilename?: string | null;
  size: number;
};

function flattenFiles(files: formidable.Files<string>): FormidableFile[] {
  return Object.values(files)
    .flat()
    .filter(Boolean)
    .map((file) => file as FormidableFile);
}

async function parseUpload(req: ApiRequest): Promise<FormidableFile[]> {
  const form = formidable({
    multiples: true,
    maxFileSize: MAX_UPLOAD_SIZE,
    keepExtensions: true,
  });

  const [, files] = await form.parse(req);
  return flattenFiles(files);
}

async function handleUpload(req: ApiRequest, res: ApiResponse): Promise<void> {
  const files = await parseUpload(req);

  if (files.length === 0) {
    sendJson(res, 400, {
      error: "missing_file",
      message: "Vui lòng chọn ít nhất một file để upload.",
    });
    return;
  }

  const unsupported = files.find((file) => !isSupportedFile(file.originalFilename || ""));

  if (unsupported) {
    sendJson(res, 415, {
      error: "unsupported_file_type",
      message: `File không được hỗ trợ. Chỉ nhận: ${supportedFileTypesLabel()}.`,
    });
    return;
  }

  const indexed = [];

  for (const file of files) {
    const document = await createDocumentFromTempFile(
      file.filepath,
      file.originalFilename || "untitled.txt",
      file.size,
    );
    const reindexed = await reindexDocument(document.id);

    if (reindexed) {
      indexed.push(toPublicDocument(reindexed));
    }
  }

  sendJson(res, 201, { files: indexed });
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
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

  try {
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

    await handleUpload(req, res);
  } catch (error) {
    sendJson(res, 500, {
      error: "admin_file_error",
      message:
        error instanceof Error
          ? error.message
          : "Không thể xử lý file. Vui lòng thử lại.",
    });
  }
}
