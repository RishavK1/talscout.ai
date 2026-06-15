-- Richer parsed profile: projects + languages (work_history/education/
-- certifications/years_experience already exist).
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS projects jsonb;--> statement-breakpoint
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS languages text[];
