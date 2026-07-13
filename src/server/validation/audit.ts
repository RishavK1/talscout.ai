import { z } from "zod";

/** List query. Bad values fall back to route defaults rather than erroring. */
export const listAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().optional().catch(undefined),
  offset: z.coerce.number().int().optional().catch(undefined),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
