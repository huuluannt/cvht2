import {
  FALLBACK_ANSWER,
  MAX_CONTEXT_LENGTH,
  MAX_QUESTION_LENGTH,
  getServerApiKey,
  isProvider,
} from "./_lib/env.js";
import { readSession } from "./_lib/auth.js";
import { checkRateLimit, readJsonBody, sendJson, sendMethodNotAllowed } from "./_lib/http.js";
import { answerWithProvider, ProviderError } from "./_lib/providers.js";
import { retrieveRelevantChunks } from "./_lib/retrieval.js";
import { getAllChunks } from "./_lib/store.js";
import type { ApiRequest, ApiResponse, Provider } from "./_lib/types.js";

type ChatBody = {
  provider?: Provider;
  apiKey?: string;
  question?: string;
};

function errorStatus(error: ProviderError): number {
  if (error.kind === "quota_exceeded") {
    return 429;
  }

  if (error.kind === "invalid_key") {
    return 401;
  }

  return 502;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") {
    sendMethodNotAllowed(res, ["POST"]);
    return;
  }

  const rateLimit = checkRateLimit(req, "chat", 20, 60_000);

  if (!rateLimit.ok) {
    sendJson(res, 429, {
      error: "rate_limit",
      message: `Bạn gửi quá nhanh. Vui lòng thử lại sau ${rateLimit.retryAfterSeconds} giây.`,
    });
    return;
  }

  try {
    const body = (await readJsonBody<ChatBody>(req)) || {};
    const question = body.question?.trim() || "";
    const provider = body.provider;
    const session = readSession(req);
    const isAdmin = Boolean(session?.isAdmin);

    if (!isProvider(provider)) {
      sendJson(res, 400, {
        error: "invalid_provider",
        message: "Vui lòng chọn Gemini hoặc Groq.",
      });
      return;
    }

    if (!question) {
      sendJson(res, 400, {
        error: "missing_question",
        message: "Vui lòng nhập câu hỏi.",
      });
      return;
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      sendJson(res, 400, {
        error: "question_too_long",
        message: `Câu hỏi quá dài. Giới hạn hiện tại là ${MAX_QUESTION_LENGTH} ký tự.`,
      });
      return;
    }

    const apiKey = isAdmin ? getServerApiKey(provider) : body.apiKey?.trim();

    if (!apiKey) {
      sendJson(res, 401, {
        error: "missing_api_key",
        message: isAdmin
          ? "Chưa cấu hình API key phía server cho provider này."
          : "Bạn cần thêm API key trước khi chat.",
      });
      return;
    }

    const chunks = await getAllChunks();
    const retrievedChunks = retrieveRelevantChunks(question, chunks, {
      topK: 5,
      maxContextChars: MAX_CONTEXT_LENGTH,
    });

    if (retrievedChunks.length === 0) {
      sendJson(res, 200, {
        answer: FALLBACK_ANSWER,
        sources: [],
      });
      return;
    }

    const answer = await answerWithProvider(provider, apiKey, question, retrievedChunks);

    sendJson(res, 200, {
      answer,
      sources:
        answer === FALLBACK_ANSWER
          ? []
          : retrievedChunks.map((chunk) => ({
              file_name: chunk.file_name,
              chunk_id: chunk.chunk_id,
            })),
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      sendJson(res, errorStatus(error), {
        error: error.kind,
        message: error.message,
      });
      return;
    }

    sendJson(res, 500, {
      error: "chat_failed",
      message: "Không thể tạo câu trả lời lúc này. Vui lòng thử lại.",
    });
  }
}
