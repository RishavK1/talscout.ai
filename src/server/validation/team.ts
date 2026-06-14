import { z } from "zod";

export const inviteSchema = z.object({
  email: z.email().max(320),
  role: z.enum(["admin", "recruiter", "viewer"]),
});
export type InviteBody = z.infer<typeof inviteSchema>;
