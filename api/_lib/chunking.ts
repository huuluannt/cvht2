import type { RagChunk } from "./types.js";

const TARGET_CHUNK_TOKENS = 800;
const MIN_CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 120;

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function formatChunkId(index: number): string {
  return `chunk-${String(index + 1).padStart(3, "0")}`;
}

export function splitTextIntoChunks(
  text: string,
  documentId: string,
  fileName: string,
): RagChunk[] {
  const tokens = tokenize(text);
  const createdAt = new Date().toISOString();
  const chunks: RagChunk[] = [];

  if (tokens.length <= TARGET_CHUNK_TOKENS) {
    return [
      {
        document_id: documentId,
        file_name: fileName,
        chunk_id: formatChunkId(0),
        text: tokens.join(" "),
        created_at: createdAt,
      },
    ];
  }

  let start = 0;

  while (start < tokens.length) {
    const end = Math.min(start + TARGET_CHUNK_TOKENS, tokens.length);
    const remaining = tokens.length - end;
    const adjustedEnd =
      remaining > 0 && remaining < MIN_CHUNK_TOKENS ? tokens.length : end;

    chunks.push({
      document_id: documentId,
      file_name: fileName,
      chunk_id: formatChunkId(chunks.length),
      text: tokens.slice(start, adjustedEnd).join(" "),
      created_at: createdAt,
    });

    if (adjustedEnd >= tokens.length) {
      break;
    }

    start = Math.max(adjustedEnd - OVERLAP_TOKENS, start + 1);
  }

  return chunks;
}
