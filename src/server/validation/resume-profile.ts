import { z } from "zod";

/**
 * The extractor's output is validated against this before anything is saved —
 * a malformed/partial extraction (or a malicious résumé that tried to change
 * the shape) is rejected, not persisted (AI-02, AI-06). fullName is required,
 * so junk documents with no real content fail (AI-04).
 */
export const resumeProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  emails: z.array(z.string().max(320)).max(20).optional(),
  currentTitle: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  skills: z.array(z.string().max(80)).max(200).optional(),
  summary: z.string().max(10000).optional(),
});

export type ResumeProfile = z.infer<typeof resumeProfileSchema>;
