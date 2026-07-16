ALTER TABLE "outreach_campaigns" ADD COLUMN "scheduled_fire_cascade" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_sends" ADD COLUMN "rfc822_message_id" text;--> statement-breakpoint
ALTER TABLE "outreach_sends" ADD COLUMN "gmail_thread_id" text;--> statement-breakpoint
ALTER TABLE "outreach_sends" ADD COLUMN "sent_subject" text;--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN "gmail_has_read_scope" boolean DEFAULT false NOT NULL;