import { z } from "zod";

export const listShortlistsQuerySchema = z.object({
  limit: z.coerce.number().int().optional().catch(undefined),
  offset: z.coerce.number().int().optional().catch(undefined),
});
export type ListShortlistsQuery = z.infer<typeof listShortlistsQuerySchema>;
