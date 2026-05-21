import { extname } from "node:path";

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".pdf", ".docx"]);

export function getFileExtension(fileName: string): string {
  return extname(fileName).toLowerCase();
}

export function isSupportedFile(fileName: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getFileExtension(fileName));
}

export function supportedFileTypesLabel(): string {
  return ".txt, .md, .pdf, .docx";
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractTextFromFile(buffer: Buffer, fileName: string): Promise<string> {
  const extension = getFileExtension(fileName);
  let text: string;

  if (extension === ".txt" || extension === ".md") {
    text = buffer.toString("utf8");
  } else if (extension === ".docx") {
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (extension === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
  } else {
    throw new Error(`Unsupported file type. Supported types: ${supportedFileTypesLabel()}.`);
  }

  const normalized = normalizeExtractedText(text);

  if (!normalized) {
    throw new Error("Failed text extraction: the file did not contain readable text.");
  }

  return normalized;
}
