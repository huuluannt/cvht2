import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { splitTextIntoChunks } from "./chunking.js";
import { extractTextFromFile } from "./extract.js";
import type { DocumentMeta, PublicDocumentMeta, RagChunk, StoreShape } from "./types.js";

const DATA_DIR =
  process.env.CVHT_DATA_DIR ||
  (process.env.VERCEL ? "/tmp/cvht-data" : join(process.cwd(), ".cvht-data"));

const UPLOAD_DIR = join(DATA_DIR, "uploads");
const STORE_FILE = join(DATA_DIR, "store.json");

function emptyStore(): StoreShape {
  return { documents: [], chunks: [] };
}

async function ensureDataDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

async function readStore(): Promise<StoreShape> {
  await ensureDataDir();

  try {
    const raw = await readFile(STORE_FILE, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  await ensureDataDir();
  const tempFile = `${STORE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempFile, JSON.stringify(store, null, 2), "utf8");
  await rename(tempFile, STORE_FILE);
}

function publicDocument(document: DocumentMeta): PublicDocumentMeta {
  return {
    id: document.id,
    file_name: document.file_name,
    uploaded_at: document.uploaded_at,
    file_size: document.file_size,
    status: document.status,
    chunk_count: document.chunk_count,
    error_message: document.error_message,
  };
}

function safeFileName(fileName: string): string {
  return basename(fileName).replace(/[^\w.\- ()\p{L}]/gu, "_");
}

export async function listDocuments(): Promise<PublicDocumentMeta[]> {
  const store = await readStore();
  return store.documents
    .slice()
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .map(publicDocument);
}

export async function getAllChunks(): Promise<RagChunk[]> {
  const store = await readStore();
  return store.chunks;
}

export async function createDocumentFromTempFile(
  tempPath: string,
  originalName: string,
  fileSize: number,
): Promise<DocumentMeta> {
  const store = await readStore();
  const id = randomUUID();
  const extension = extname(originalName).toLowerCase();
  const fileName = safeFileName(originalName);
  const storedPath = join(UPLOAD_DIR, `${id}${extension}`);

  await copyFile(tempPath, storedPath);

  const document: DocumentMeta = {
    id,
    file_name: fileName,
    uploaded_at: new Date().toISOString(),
    file_size: fileSize,
    status: "indexing",
    chunk_count: 0,
    stored_path: storedPath,
  };

  store.documents.push(document);
  await writeStore(store);
  return document;
}

async function updateDocument(
  id: string,
  update: (document: DocumentMeta, store: StoreShape) => void,
): Promise<DocumentMeta | undefined> {
  const store = await readStore();
  const document = store.documents.find((item) => item.id === id);

  if (!document) {
    return undefined;
  }

  update(document, store);
  await writeStore(store);
  return document;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const store = await readStore();
  const document = store.documents.find((item) => item.id === id);

  if (!document) {
    return false;
  }

  store.documents = store.documents.filter((item) => item.id !== id);
  store.chunks = store.chunks.filter((chunk) => chunk.document_id !== id);
  await writeStore(store);
  await rm(document.stored_path, { force: true });
  return true;
}

export async function reindexDocument(id: string): Promise<DocumentMeta | undefined> {
  const store = await readStore();
  const document = store.documents.find((item) => item.id === id);

  if (!document) {
    return undefined;
  }

  document.status = "indexing";
  document.error_message = undefined;
  document.chunk_count = 0;
  store.chunks = store.chunks.filter((chunk) => chunk.document_id !== id);
  await writeStore(store);

  try {
    const buffer = await readFile(document.stored_path);
    const text = await extractTextFromFile(buffer, document.file_name);
    const chunks = splitTextIntoChunks(text, document.id, document.file_name);

    return await updateDocument(document.id, (current, currentStore) => {
      current.status = "ready";
      current.chunk_count = chunks.length;
      current.error_message = undefined;
      currentStore.chunks = [
        ...currentStore.chunks.filter((chunk) => chunk.document_id !== document.id),
        ...chunks,
      ];
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed text extraction: could not read this file.";

    return await updateDocument(document.id, (current, currentStore) => {
      current.status = "error";
      current.chunk_count = 0;
      current.error_message = message;
      currentStore.chunks = currentStore.chunks.filter(
        (chunk) => chunk.document_id !== document.id,
      );
    });
  }
}

export function toPublicDocument(document: DocumentMeta): PublicDocumentMeta {
  return publicDocument(document);
}
