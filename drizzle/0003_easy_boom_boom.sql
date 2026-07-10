ALTER TABLE "outreach_campaigns" ADD COLUMN "scheduled_fire_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "scheduled_fire_step_index" integer;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "scheduled_fire_lead_ids" jsonb;