import type { Provider } from "./types";

export const FALLBACK_ANSWER =
  "Tôi không tìm thấy thông tin này trong dữ liệu CVHT hiện có.";

export const SYSTEM_INSTRUCTION =
  "You are CVHT, an academic advisor chatbot. Answer strictly and only based on the provided context from uploaded documents. If the context does not contain the answer, say exactly: ‘Tôi không tìm thấy thông tin này trong dữ liệu CVHT hiện có.’ Do not invent policies, deadlines, course rules, names, contacts, scores, procedures, or recommendations.";

export const MAX_QUESTION_LENGTH = Number(process.env.MAX_QUESTION_LENGTH ?? 1200);
export const MAX_CONTEXT_LENGTH = Number(process.env.MAX_CONTEXT_LENGTH ?? 12000);

export function isProvider(value: unknown): value is Provider {
  return value === "gemini" || value === "groq";
}

export function getProviderModel(provider: Provider): string {
  if (provider === "gemini") {
    return process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  return process.env.GROQ_MODEL || "llama-3.1-8b-instant";
}

export function getServerApiKey(provider: Provider): string | undefined {
  return provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY;
}

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

