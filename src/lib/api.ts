import type { AuthState, Provider, PublicDocument } from "./types";

type ChatResponse = {
  answer?: string;
  message?: string;
};

type FilesResponse = {
  files: PublicDocument[];
  message?: string;
};

type FileResponse = {
  file: PublicDocument;
  message?: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };

  if (!response.ok) {
    throw new Error(data.message || "Yêu cầu thất bại.");
  }

  return data;
}

export async function getAuthState(): Promise<AuthState> {
  const data = await parseResponse<Partial<AuthState>>(await fetch("/api/auth/me"));
  return {
    email: data.email || null,
    isAdmin: Boolean(data.isAdmin),
  };
}

export async function logoutAdmin(): Promise<void> {
  await parseResponse(await fetch("/api/auth/logout", { method: "POST" }));
}

export async function askCvht(
  provider: Provider,
  question: string,
  options: { apiKey?: string; isAdmin: boolean },
): Promise<string> {
  const data = await parseResponse<ChatResponse>(
    await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        question,
        apiKey: options.isAdmin ? undefined : options.apiKey,
      }),
    }),
  );

  return data.answer || "";
}

export async function listAdminFiles(): Promise<PublicDocument[]> {
  const data = await parseResponse<FilesResponse>(await fetch("/api/admin/files"));
  return data.files;
}

export async function uploadAdminFiles(files: FileList): Promise<PublicDocument[]> {
  const form = new FormData();

  Array.from(files).forEach((file) => form.append("files", file));

  const data = await parseResponse<FilesResponse>(
    await fetch("/api/admin/files", {
      method: "POST",
      body: form,
    }),
  );

  return data.files;
}

export async function deleteAdminFile(id: string): Promise<void> {
  await parseResponse(
    await fetch(`/api/admin/files?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}

export async function reindexAdminFile(id: string): Promise<PublicDocument> {
  const data = await parseResponse<FileResponse>(
    await fetch(`/api/admin/files?id=${encodeURIComponent(id)}&action=reindex`, {
      method: "POST",
    }),
  );

  return data.file;
}
