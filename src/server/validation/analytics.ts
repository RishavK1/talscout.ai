import { z } from "zod";

/** Bad/missing values fall back to the service's default window rather than
 *  erroring, same convention as listAuditLogsQuerySchema. */
export const analyticsOverviewQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional().catch(undefined),
});
export type AnalyticsOverviewQuery = z.infer<typeof analyticsOverviewQuerySchema>;
