DROP INDEX "automated_sends_campaign_lead_uq";--> statement-breakpoint
ALTER TABLE "automated_sends" ADD COLUMN "step_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "automated_sends" ADD COLUMN "sent_subject" text;--> statement-breakpoint
CREATE UNIQUE INDEX "automated_sends_campaign_lead_step_uq" ON "automated_sends" USING btree ("campaign_id","lead_id","step_index");