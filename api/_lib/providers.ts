import { FALLBACK_ANSWER, SYSTEM_INSTRUCTION, getProviderModel } from "./env";
import type { Provider, RetrievedChunk } from "./types";

export class ProviderError extends Error {
  kind: "invalid_key" | "quota_exceeded" | "provider_error";

  constructor(kind: ProviderError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
    status?: string;
  };
};

type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
  };
};

function providerErrorFromStatus(status: number, fallbackMessage: string): ProviderError {
  if (status === 401 || status === 403 || status === 400) {
    return new ProviderError("invalid_key", "API key không hợp lệ hoặc không có quyền truy cập.");
  }

  if (status === 429) {
    return new ProviderError("quota_exceeded", "API key đã vượt hạn mức hoặc bị giới hạn tốc độ.");
  }

  return new ProviderError("provider_error", fallbackMessage);
}

function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (chunk) =>
        `[${chunk.file_name} | ${chunk.chunk_id}]\n${chunk.text}`,
    )
    .join("\n\n---\n\n");
}

function buildUserPrompt(question: string, chunks: RetrievedChunk[]): string {
  return [
    "Dữ liệu ngữ cảnh từ tài liệu CVHT:",
    buildContext(chunks),
    "",
    `Câu hỏi của sinh viên: ${question}`,
    "",
    "Trả lời bằng tiếng Việt, ngắn gọn, đúng trọng tâm. Không tự thêm mục nguồn dữ liệu; hệ thống sẽ thêm phần này dựa trên các chunk đã dùng.",
  ].join("\n");
}

async function callGemini(apiKey: string, question: string, chunks: RetrievedChunk[]) {
  const model = getProviderModel("gemini");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildUserPrompt(question, chunks) }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 900,
        },
      }),
    },
  );

  const data = (await response.json()) as GeminiResponse;

  if (!response.ok) {
    throw providerErrorFromStatus(
      response.status,
      data.error?.message || "Gemini request failed.",
    );
  }

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || ""
  );
}

async function callGroq(apiKey: string, question: string, chunks: RetrievedChunk[]) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: getProviderModel("groq"),
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: buildUserPrompt(question, chunks) },
      ],
      temperature: 0.1,
      max_tokens: 900,
    }),
  });

  const data = (await response.json()) as GroqResponse;

  if (!response.ok) {
    throw providerErrorFromStatus(
      response.status,
      data.error?.message || "Groq request failed.",
    );
  }

  return data.choices?.[0]?.message?.content?.trim() || "";
}

function stripSourceSection(answer: string): string {
  return answer.split(/Nguồn dữ liệu\s*:?/i)[0]?.trim() || answer.trim();
}

function appendSources(answer: string, chunks: RetrievedChunk[]): string {
  const sources = chunks.map((chunk) => `- ${chunk.file_name} (${chunk.chunk_id})`);
  return `${stripSourceSection(answer)}\n\nNguồn dữ liệu:\n${sources.join("\n")}`;
}

export async function answerWithProvider(
  provider: Provider,
  apiKey: string,
  question: string,
  chunks: RetrievedChunk[],
): Promise<string> {
  const rawAnswer =
    provider === "gemini"
      ? await callGemini(apiKey, question, chunks)
      : await callGroq(apiKey, question, chunks);

  if (!rawAnswer || rawAnswer.includes(FALLBACK_ANSWER)) {
    return FALLBACK_ANSWER;
  }

  return appendSources(rawAnswer, chunks);
}

