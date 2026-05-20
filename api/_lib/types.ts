import type { IncomingMessage, ServerResponse } from "node:http";

export type Provider = "gemini" | "groq";

export type ApiRequest = IncomingMessage & {
  body?: unknown;
  cookies?: Record<string, string>;
  query?: Record<string, string | string[]>;
};

export type ApiResponse = ServerResponse;

export type DocumentStatus = "indexing" | "ready" | "error";

export type DocumentMeta = {
  id: string;
  file_name: string;
  uploaded_at: string;
  file_size: number;
  status: DocumentStatus;
  chunk_count: number;
  stored_path: string;
  error_message?: string;
};

export type PublicDocumentMeta = Omit<DocumentMeta, "stored_path">;

export type RagChunk = {
  document_id: string;
  file_name: string;
  chunk_id: string;
  text: string;
  created_at: string;
};

export type RetrievedChunk = RagChunk & {
  score: number;
};

export type StoreShape = {
  documents: DocumentMeta[];
  chunks: RagChunk[];
};

