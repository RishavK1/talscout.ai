import { z } from "zod";

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

/** UP-01: disallowed types are rejected here (422) before any URL is issued. */
export const requestUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  sizeBytes: z.number().int().positive(),
});
export type RequestUploadBody = z.infer<typeof requestUploadSchema>;

export const completeUploadSchema = z.object({
  candidateId: z.uuid(),
  fileKey: z.string().min(1).max(500),
});
export type CompleteUploadBody = z.infer<typeof completeUploadSchema>;
