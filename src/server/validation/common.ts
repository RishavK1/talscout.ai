import { z } from "zod";
import { NotFound } from "@/server/http/errors";

export const uuidSchema = z.uuid();

/**
 * Validate a path param as a UUID. An invalid id is treated as "not found"
 * (404) rather than a 500 from a bad ::uuid cast, and avoids leaking whether a
 * malformed id could ever exist.
 */
export function uuidOr404(value: string, message = "Not found"): string {
  const r = uuidSchema.safeParse(value);
  if (!r.success) throw new NotFound(message);
  return r.data;
}
