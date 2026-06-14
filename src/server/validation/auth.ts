import { z } from "zod";

export const signupSchema = z.object({
  workspaceName: z.string().trim().min(2, "Workspace name is too short").max(100),
});

export type SignupInput = z.infer<typeof signupSchema>;
