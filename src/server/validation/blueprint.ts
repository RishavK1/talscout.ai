import { z } from "zod";

/** A confirmed intake answer: single string (single-select/edited) or a list
 *  of strings (multi-select fields like proof/objections). */
const answerValue = z.union([
  z.string().max(2_000),
  z.array(z.string().max(2_000)).max(20),
]);

export const intakeAnswersSchema = z.object({
  businessName: z.string().max(200).optional(),
  websiteUrl: z.string().max(2_000).optional(),
  answers: z.record(z.string().max(100), answerValue).default({}),
});
export type IntakeAnswersBody = z.infer<typeof intakeAnswersSchema>;

export const createBlueprintSchema = z.object({
  name: z.string().min(1).max(200),
  websiteUrl: z.string().max(2_000).optional(),
  /** Optional at create — the wizard can create the shell first, then run
   *  suggest/generate and PATCH the answers + sections in. */
  intakeAnswers: intakeAnswersSchema.optional(),
});
export type CreateBlueprintBody = z.infer<typeof createBlueprintSchema>;

export const updateBlueprintSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    websiteUrl: z.string().max(2_000).optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
    intakeAnswers: intakeAnswersSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });
export type UpdateBlueprintBody = z.infer<typeof updateBlueprintSchema>;

/** Step 2 of the wizard: research a website for suggested intake options. */
export const suggestBlueprintSchema = z.object({
  name: z.string().min(1).max(200),
  websiteUrl: z.string().min(1).max(2_000),
});
export type SuggestBlueprintBody = z.infer<typeof suggestBlueprintSchema>;

/** Step 3 / regenerate: (re)generate the sections. Optional inline answers
 *  override what's stored (lets the wizard generate before the first PATCH). */
export const generateBlueprintSchema = z
  .object({
    intakeAnswers: intakeAnswersSchema.optional(),
  })
  .optional();
export type GenerateBlueprintBody = z.infer<typeof generateBlueprintSchema>;
