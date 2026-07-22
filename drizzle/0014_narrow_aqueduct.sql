ALTER TYPE "public"."outreach_lead_status" ADD VALUE 'replied';--> statement-breakpoint
ALTER TABLE "automated_sends" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outreach_sends" ADD COLUMN "opened_at" timestamp with time zone;