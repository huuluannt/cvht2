import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Redis } from "@upstash/redis";
import { splitTextIntoChunks } from "./chunking.js";
import { extractTextFromFile } from "./extract.js";
import type { DocumentMeta, PublicDocumentMeta, RagChunk, StoreShape } from "./types.js";

export const STORAGE_NOT_CONFIGURED_MESSAGE =
  "Production document storage is not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel, then redeploy and upload files again.";

const DATA_DIR =
  process.env.CVHT_DATA_DIR ||
  (process.env.VERCEL ? "/tmp/cvht-data" : join(process.cwd(), ".cvht-data"));

const UPLOAD_DIR = join(DATA_DIR, "uploads");
const STORE_FILE = join(DATA_DIR, "store.json");
const REDIS_STORE_KEY = process.env.CVHT_REDIS_STORE_KEY || "cvht:store:v1";
const REDIS_FILE_PREFIX = process.env.CVHT_REDIS_FILE_PREFIX || "cvht:file:";
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);
const ALLOW_EPHEMERAL_STORAGE = process.env.CVHT_ALLOW_EPHEMERAL_STORAGE === "true";
const IS_VERCEL_DEPLOYMENT =
  Boolean(process.env.VERCEL) && process.env.VERCEL_ENV !== "development";
const REQUIRE_PERSISTENT_STORAGE = IS_VERCEL_DEPLOYMENT && !ALLOW_EPHEMERAL_STORAGE;

let redisClient: Redis | undefined;

function isStorageConfigErrorMessage(message: string): boolean {
  return message === STORAGE_NOT_CONFIGURED_MESSAGE;
}

export function isStorageConfigError(error: unknown): boolean {
  return error instanceof Error && isStorageConfigErrorMessage(error.message);
}

function emptyStore(): StoreShape {
  return { documents: [], chunks: [] };
}

function getRedisClient(): Redis | undefined {
  if (!USE_REDIS || !REDIS_URL || !REDIS_TOKEN) {
    return undefined;
  }

  redisClient ??= new Redis({
    url: REDIS_URL,
    token: REDIS_TOKEN,
  });

  return redisClient;
}

function assertStorageConfigured(): void {
  if (REQUIRE_PERSISTENT_STORAGE && !USE_REDIS) {
    throw new Error(STORAGE_NOT_CONFIGURED_MESSAGE);
  }
}

async function ensureDataDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

function parseStore(rawStore: string | StoreShape | null): StoreShape {
  if (!rawStore) {
    return emptyStore();
  }

  if (typeof rawStore === "string") {
    return JSON.parse(rawStore) as StoreShape;
  }

  return rawStore;
}

async function readStore(): Promise<StoreShape> {
  assertStorageConfigured();

  const redis = getRedisClient();

  if (redis) {
    const rawStore = await redis.get<string | StoreShape>(REDIS_STORE_KEY);
    return parseStore(rawStore);
  }

  await ensureDataDir();

  try {
    const raw = await readFile(STORE_FILE, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  assertStorageConfigured();

  const redis = getRedisClient();

  if (redis) {
    await redis.set(REDIS_STORE_KEY, JSON.stringify(store));
    return;
  }

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

export async function createDocumentFromBuffer(
  buffer: Buffer,
  originalName: string,
  fileSize: number,
): Promise<DocumentMeta> {
  assertStorageConfigured();

  const store = await readStore();
  const id = randomUUID();
  const extension = extname(originalName).toLowerCase();
  const fileName = safeFileName(originalName);
  const storedPath = join(UPLOAD_DIR, `${id}${extension}`);
  const redis = getRedisClient();

  if (redis) {
    await redis.set(`${REDIS_FILE_PREFIX}${id}`, buffer.toString("base64"));
  } else {
    await writeFile(storedPath, buffer);
  }

  const document: DocumentMeta = {
    id,
    file_name: fileName,
    uploaded_at: new Date().toISOString(),
    file_size: fileSize,
    status: "indexing",
    chunk_count: 0,
    stored_path: redis ? `redis:${id}` : storedPath,
  };

  store.documents.push(document);
  await writeStore(store);
  return document;
}

function ensureTextFileName(originalName: string): string {
  const trimmedName = originalName.trim() || "direct-content.txt";
  const extension = extname(trimmedName).toLowerCase();

  if (extension === ".txt" || extension === ".md") {
    return trimmedName;
  }

  return `${trimmedName}.txt`;
}

export async function createDocumentFromText(
  text: string,
  originalName: string,
): Promise<DocumentMeta> {
  const buffer = Buffer.from(text, "utf8");
  return await createDocumentFromBuffer(
    buffer,
    ensureTextFileName(originalName),
    buffer.byteLength,
  );
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
  assertStorageConfigured();

  const store = await readStore();
  const document = store.documents.find((item) => item.id === id);

  if (!document) {
    return false;
  }

  store.documents = store.documents.filter((item) => item.id !== id);
  store.chunks = store.chunks.filter((chunk) => chunk.document_id !== id);
  await writeStore(store);

  const redis = getRedisClient();

  if (redis) {
    await redis.del(`${REDIS_FILE_PREFIX}${id}`);
  } else if (document.stored_path) {
    await rm(document.stored_path, { force: true });
  }

  return true;
}

async function readStoredFile(document: DocumentMeta): Promise<Buffer> {
  const redis = getRedisClient();

  if (redis) {
    const rawFile = await redis.get<string>(`${REDIS_FILE_PREFIX}${document.id}`);

    if (!rawFile) {
      throw new Error("Failed text extraction: uploaded file content was not found.");
    }

    return Buffer.from(rawFile, "base64");
  }

  if (!document.stored_path) {
    throw new Error("Failed text extraction: uploaded file path was not found.");
  }

  return await readFile(document.stored_path);
}

export async function reindexDocument(id: string): Promise<DocumentMeta | undefined> {
  assertStorageConfigured();

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
    const buffer = await readStoredFile(document);
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
