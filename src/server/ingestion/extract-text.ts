import { mimeFamily } from "./file-type";

/**
 * Extract plain text from a résumé file before sending it to the LLM.
 * Real PDFs/DOCX are binary — feeding their raw bytes as UTF-8 produces
 * gibberish, which is why extraction was failing. We parse them properly:
 *   - PDF  → unpdf (pdf.js under the hood, no native deps)
 *   - DOCX → mammoth
 *   - else → UTF-8 text
 * Falls back to UTF-8 if a parser throws or yields nothing (also keeps plain
 * text + test fixtures working).
 */
export async function extractResumeText(
  bytes: Buffer,
  mime: string,
): Promise<string> {
  const fam = mimeFamily(mime);
  try {
    if (fam === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(pdf, { mergePages: true });
      const joined = Array.isArray(text) ? text.join("\n") : text;
      if (joined && joined.trim().length > 0) return joined;
    } else if (fam === "docx") {
      const mammoth = (await import("mammoth")).default;
      const { value } = await mammoth.extractRawText({ buffer: bytes });
      if (value && value.trim().length > 0) return value;
    }
  } catch {
    // fall through to UTF-8 (plain text + non-binary test fixtures)
  }
  return bytes.toString("utf8");
}
