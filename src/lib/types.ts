export type Provider = "gemini" | "groq";

export type AuthState = {
  email: string | null;
  isAdmin: boolean;
};

export type ChatRole = "assistant" | "user";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type PublicDocument = {
  id: string;
  file_name: string;
  uploaded_at: string;
  file_size: number;
  status: "indexing" | "ready" | "error";
  chunk_count: number;
  error_message?: string;
};

