import { z } from "zod";

const workItem = z.object({
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  startDate: z.string().max(40).optional(),
  endDate: z.string().max(40).optional(),
  description: z.string().max(4000).optional(),
  highlights: z.array(z.string().max(600)).max(20).optional(),
});

const eduItem = z.object({
  institution: z.string().max(200).optional(),
  degree: z.string().max(200).optional(),
  field: z.string().max(200).optional(),
  startYear: z.string().max(20).optional(),
  endYear: z.string().max(20).optional(),
});

const projectItem = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  technologies: z.array(z.string().max(80)).max(40).optional(),
});

/**
 * The extractor's output is validated against this before anything is saved.
 * fullName is the only hard requirement (junk docs fail, AI-04). Everything
 * else is optional so résumés with different sections/formats all parse.
 */
export const resumeProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  emails: z.array(z.string().max(320)).max(20).optional(),
  phones: z.array(z.string().max(60)).max(10).optional(),
  currentTitle: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  yearsExperience: z.coerce.number().min(0).max(80).optional().catch(undefined),
  summary: z.string().max(10000).optional(),
  skills: z.array(z.string().max(80)).max(200).optional(),
  languages: z.array(z.string().max(80)).max(50).optional(),
  certifications: z.array(z.string().max(300)).max(100).optional(),
  workHistory: z.array(workItem).max(50).optional(),
  education: z.array(eduItem).max(30).optional(),
  projects: z.array(projectItem).max(50).optional(),
});

export type ResumeProfile = z.infer<typeof resumeProfileSchema>;
