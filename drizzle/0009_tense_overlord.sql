CREATE TYPE "public"."automated_campaign_status" AS ENUM('draft', 'active', 'paused', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."automated_lead_email_source" AS ENUM('site_scrape', 'hunter', 'apollo', 'google_places', 'none');--> statement-breakpoint
CREATE TYPE "public"."automated_lead_status" AS ENUM('discovered', 'no_email', 'ready', 'queued', 'sent', 'replied', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."automated_reply_draft_status" AS ENUM('pending', 'approved', 'rejected', 'sent');--> statement-breakpoint
CREATE TYPE "public"."automated_send_status" AS ENUM('scheduled', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "automated_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"blueprint_id" uuid NOT NULL,
	"sender_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "automated_campaign_status" DEFAULT 'draft' NOT NULL,
	"discovery_query" jsonb NOT NULL,
	"max_leads_per_run" integer DEFAULT 25 NOT NULL,
	"signature_name" text NOT NULL,
	"signature_title" text,
	"signature_closing" text DEFAULT 'Best regards' NOT NULL,
	"style_examples" jsonb,
	"reply_polling_enabled" boolean DEFAULT true NOT NULL,
	"last_discovery_run_at" timestamp with time zone,
	"last_reply_poll_at" timestamp with time zone,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automated_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source_place_id" text NOT NULL,
	"business_name" text NOT NULL,
	"category" text,
	"address_text" text,
	"phone" text,
	"website" text,
	"lat" numeric,
	"lon" numeric,
	"status" "automated_lead_status" DEFAULT 'discovered' NOT NULL,
	"email" text,
	"email_source" "automated_lead_email_source" DEFAULT 'none' NOT NULL,
	"email_confidence" integer,
	"notes" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automated_reply_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"send_id" uuid NOT NULL,
	"inbound_subject" text,
	"inbound_body" text NOT NULL,
	"draft_body" text NOT NULL,
	"reasoning" text,
	"confidence" numeric,
	"status" "automated_reply_draft_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automated_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"sender_account_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "automated_send_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"rfc822_message_id" text,
	"gmail_thread_id" text,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automated_campaigns" ADD CONSTRAINT "automated_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_campaigns" ADD CONSTRAINT "automated_campaigns_blueprint_id_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_campaigns" ADD CONSTRAINT "automated_campaigns_sender_account_id_sender_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_leads" ADD CONSTRAINT "automated_leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_leads" ADD CONSTRAINT "automated_leads_campaign_id_automated_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."automated_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_reply_drafts" ADD CONSTRAINT "automated_reply_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_reply_drafts" ADD CONSTRAINT "automated_reply_drafts_campaign_id_automated_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."automated_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_reply_drafts" ADD CONSTRAINT "automated_reply_drafts_lead_id_automated_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."automated_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_reply_drafts" ADD CONSTRAINT "automated_reply_drafts_send_id_automated_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."automated_sends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_sends" ADD CONSTRAINT "automated_sends_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_sends" ADD CONSTRAINT "automated_sends_campaign_id_automated_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."automated_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_sends" ADD CONSTRAINT "automated_sends_lead_id_automated_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."automated_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_sends" ADD CONSTRAINT "automated_sends_sender_account_id_sender_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automated_campaigns_tenant_idx" ON "automated_campaigns" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "automated_campaigns_status_idx" ON "automated_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "automated_leads_tenant_idx" ON "automated_leads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "automated_leads_campaign_status_idx" ON "automated_leads" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "automated_leads_campaign_source_uq" ON "automated_leads" USING btree ("campaign_id","source_place_id");--> statement-breakpoint
CREATE INDEX "automated_reply_drafts_tenant_idx" ON "automated_reply_drafts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "automated_reply_drafts_campaign_idx" ON "automated_reply_drafts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "automated_reply_drafts_tenant_status_idx" ON "automated_reply_drafts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "automated_reply_drafts_send_uq" ON "automated_reply_drafts" USING btree ("send_id");--> statement-breakpoint
CREATE INDEX "automated_sends_tenant_idx" ON "automated_sends" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "automated_sends_campaign_idx" ON "automated_sends" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automated_sends_campaign_lead_uq" ON "automated_sends" USING btree ("campaign_id","lead_id");--> statement-breakpoint
CREATE INDEX "automated_sends_gmail_thread_idx" ON "automated_sends" USING btree ("gmail_thread_id");--> statement-breakpoint
CREATE INDEX "automated_sends_tenant_status_scheduled_idx" ON "automated_sends" USING btree ("tenant_id","status","scheduled_at");