ALTER TYPE "public"."automated_lead_email_source" ADD VALUE 'perplexity' BEFORE 'none';--> statement-breakpoint
ALTER TABLE "automated_campaigns" ADD COLUMN "ai_discovery_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "automated_leads" ADD COLUMN "enrichment_attempts" integer DEFAULT 0 NOT NULL;