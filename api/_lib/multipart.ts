import { readRawBody } from "./http.js";
import type { ApiRequest } from "./types.js";

export type UploadedFile = {
  buffer: Buffer;
  fileName: string;
  size: number;
};

function getHeaderValue(headers: string, name: string): string | undefined {
  const line = headers
    .split("\r\n")
    .find((header) => header.toLowerCase().startsWith(`${name.toLowerCase()}:`));

  return line?.slice(line.indexOf(":") + 1).trim();
}

function getDispositionParam(disposition: string, name: string): string | undefined {
  const match = disposition.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1];
}

function findAll(buffer: Buffer, needle: Buffer): number[] {
  const positions: number[] = [];
  let position = buffer.indexOf(needle);

  while (position !== -1) {
    positions.push(position);
    position = buffer.indexOf(needle, position + needle.length);
  }

  return positions;
}

function trimPartBoundaryBytes(part: Buffer): Buffer {
  let next = part;

  if (next.subarray(0, 2).equals(Buffer.from("\r\n"))) {
    next = next.subarray(2);
  }

  if (next.subarray(-2).equals(Buffer.from("\r\n"))) {
    next = next.subarray(0, -2);
  }

  return next;
}

function splitMultipartBody(body: Buffer, boundary: string): Buffer[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const positions = findAll(body, delimiter);
  const parts: Buffer[] = [];

  for (let index = 0; index < positions.length - 1; index += 1) {
    const start = positions[index] + delimiter.length;
    const end = positions[index + 1];
    const part = trimPartBoundaryBytes(body.subarray(start, end));

    if (part.length > 0 && !part.subarray(0, 2).equals(Buffer.from("--"))) {
      parts.push(part);
    }
  }

  return parts;
}

function extractBoundary(contentType: string | undefined): string {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = match?.[1] || match?.[2];

  if (!boundary) {
    throw new Error("Missing multipart boundary.");
  }

  return boundary;
}

export async function parseMultipartFiles(
  req: ApiRequest,
  maxBytes: number,
): Promise<UploadedFile[]> {
  const contentType = Array.isArray(req.headers["content-type"])
    ? req.headers["content-type"][0]
    : req.headers["content-type"];

  if (!contentType?.toLowerCase().includes("multipart/form-data")) {
    throw new Error("Upload request must use multipart/form-data.");
  }

  const boundary = extractBoundary(contentType);
  const body = await readRawBody(req, maxBytes);
  const files: UploadedFile[] = [];

  for (const part of splitMultipartBody(body, boundary)) {
    const separator = Buffer.from("\r\n\r\n");
    const headerEnd = part.indexOf(separator);

    if (headerEnd === -1) {
      continue;
    }

    const headers = part.subarray(0, headerEnd).toString("utf8");
    const disposition = getHeaderValue(headers, "content-disposition");
    const fieldName = disposition ? getDispositionParam(disposition, "name") : undefined;
    const fileName = disposition ? getDispositionParam(disposition, "filename") : undefined;

    if (!disposition || !fileName || fieldName !== "files") {
      continue;
    }

    const buffer = part.subarray(headerEnd + separator.length);

    if (buffer.length > 0) {
      files.push({
        buffer,
        fileName,
        size: buffer.length,
      });
    }
  }

  return files;
}

