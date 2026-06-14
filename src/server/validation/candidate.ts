import { z } from "zod";

/**
 * Manual candidate create/update. Note what's NOT here: `id`, `tenantId`,
 * `status`, `embedding`, `createdBy`. Those are server-controlled; zod objects
 * strip unknown keys, so a client sending them is silently ignored
 * (mass-assignment defense, VAL-03).
 */
const editableFields = {
  fullName: z.string().trim().min(1).max(200).optional(),
  emails: z.array(z.email().max(320)).max(20).optional(),
  phones: z.array(z.string().max(40)).max(20).optional(),
  location: z.string().max(200).optional(),
  currentTitle: z.string().max(200).optional(),
  yearsExperience: z.number().min(0).max(80).optional(), // VAL-06: no negatives
  skills: z.array(z.string().max(80)).max(200).optional(),
  certifications: z.array(z.string().max(120)).max(100).optional(),
  summary: z.string().max(10000).optional(), // VAL-04: bounded
};

export const createCandidateSchema = z.object(editableFields);
export type CreateCandidateBody = z.infer<typeof createCandidateSchema>;

export const updateCandidateSchema = z.object(editableFields);
export type UpdateCandidateBody = z.infer<typeof updateCandidateSchema>;

/**
 * List query. Bad values are coerced/caught and fall back to repo defaults
 * (PAGE-02 clamp, PAGE-03 default) rather than erroring.
 */
export const listCandidatesQuerySchema = z.object({
  limit: z.coerce.number().int().optional().catch(undefined),
  offset: z.coerce.number().int().optional().catch(undefined),
  status: z.enum(["processing", "ready", "error"]).optional().catch(undefined),
  q: z.string().max(200).optional().catch(undefined),
});
export type ListCandidatesQuery = z.infer<typeof listCandidatesQuerySchema>;
