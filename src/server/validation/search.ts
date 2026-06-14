import { z } from "zod";

/** Search input. Everything optional — an empty query falls back to recent
 *  candidates. The query is length-bounded (SRCH-06) and treated as data. */
export const searchSchema = z.object({
  q: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  minExperience: z.number().min(0).max(80).optional(),
  skills: z.array(z.string().max(80)).max(20).optional(),
  limit: z.coerce.number().int().optional().catch(undefined),
});

export type SearchInput = z.infer<typeof searchSchema>;
