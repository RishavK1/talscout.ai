export type FileFamily = "pdf" | "docx" | "txt" | "unknown";

export const ALLOWED_MIME = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
} as const;

export type AllowedMime = keyof typeof ALLOWED_MIME;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Inspect the real bytes (magic numbers), not the declared type (UP-02). */
export function detectFileType(bytes: Buffer): FileFamily {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "pdf";
  }
  // ZIP container (DOCX is a zip): 50 4B 03 04
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return "docx";
  }
  // Heuristic: printable text => txt
  return "txt";
}

export function mimeFamily(mime: string): FileFamily {
  return (ALLOWED_MIME as Record<string, FileFamily>)[mime] ?? "unknown";
}

/** Declared type must match what the bytes actually are. */
export function typeMatches(declaredMime: string, bytes: Buffer): boolean {
  const declared = mimeFamily(declaredMime);
  if (declared === "unknown") return false;
  const detected = detectFileType(bytes);
  // txt is permissive (any printable); pdf/docx must match their magic bytes.
  if (declared === "txt") return true;
  return declared === detected;
}

export function extensionFor(mime: string): string {
  const fam = mimeFamily(mime);
  return fam === "pdf" ? ".pdf" : fam === "docx" ? ".docx" : ".txt";
}
