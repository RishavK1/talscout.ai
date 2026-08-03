CREATE TYPE "public"."automated_reply_intent" AS ENUM('interested', 'not_interested', 'referral', 'unclear');--> statement-breakpoint
ALTER TYPE "public"."automated_lead_status" ADD VALUE 'bounced';--> statement-breakpoint
ALTER TYPE "public"."automated_lead_status" ADD VALUE 'suppressed';--> statement-breakpoint
CREATE TABLE "suppressed_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automated_reply_drafts" ADD COLUMN "intent" "automated_reply_intent";--> statement-breakpoint
ALTER TABLE "suppressed_emails" ADD CONSTRAINT "suppressed_emails_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suppressed_emails_tenant_email_uq" ON "suppressed_emails" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "suppressed_emails_tenant_idx" ON "suppressed_emails" USING btree ("tenant_id");