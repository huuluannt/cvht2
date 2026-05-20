import type { RagChunk, RetrievedChunk } from "./types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "who",
  "why",
  "và",
  "của",
  "cho",
  "các",
  "có",
  "là",
  "trong",
  "với",
  "được",
  "những",
  "này",
  "như",
  "thì",
  "tôi",
  "em",
  "sinh",
  "viên",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(query: string): string[] {
  return Array.from(
    new Set(
      normalize(query)
        .split(" ")
        .filter((term) => term.length > 1 && !STOP_WORDS.has(term)),
    ),
  );
}

function scoreChunk(chunk: RagChunk, terms: string[], normalizedQuery: string): number {
  const normalizedText = normalize(`${chunk.file_name} ${chunk.text}`);
  let score = 0;

  for (const term of terms) {
    const matches = normalizedText.match(new RegExp(`\\b${term}\\b`, "g"));

    if (matches) {
      score += Math.min(matches.length, 5);
    }
  }

  const phrase = normalizedQuery.split(" ").slice(0, 6).join(" ");

  if (phrase.length > 12 && normalizedText.includes(phrase)) {
    score += 8;
  }

  return score;
}

export function retrieveRelevantChunks(
  query: string,
  chunks: RagChunk[],
  options: { topK?: number; maxContextChars?: number } = {},
): RetrievedChunk[] {
  const terms = queryTerms(query);

  if (terms.length === 0) {
    return [];
  }

  const normalizedQuery = normalize(query);
  const topK = options.topK ?? 5;
  const maxContextChars = options.maxContextChars ?? 12000;
  let usedContextChars = 0;

  return chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk, terms, normalizedQuery),
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK * 2)
    .filter((chunk) => {
      if (usedContextChars + chunk.text.length > maxContextChars) {
        return false;
      }

      usedContextChars += chunk.text.length;
      return true;
    })
    .slice(0, topK);
}

