import { z } from "zod";

export const listTenantsQuerySchema = z.object({
  status: z.enum(["active", "suspended"]).optional().catch(undefined),
  q: z.string().trim().max(200).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});
export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;

export const setTenantStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});
export type SetTenantStatusBody = z.infer<typeof setTenantStatusSchema>;

export const seriesRangeQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(90).optional().catch(undefined),
});
export type SeriesRangeQuery = z.infer<typeof seriesRangeQuerySchema>;
