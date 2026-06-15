import { z } from "zod";

export const signupSchema = z.object({
  workspaceName: z.string().trim().min(2, "Workspace name is too short").max(100),
});

export type SignupInput = z.infer<typeof signupSchema>;

/** Browser registration → server creates a confirmed Supabase user. */
export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.email().max(320),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;
