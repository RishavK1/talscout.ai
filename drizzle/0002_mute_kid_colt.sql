CREATE TYPE "public"."outreach_campaign_status" AS ENUM('draft', 'importing', 'ready', 'running', 'paused', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."outreach_lead_status" AS ENUM('pending', 'scheduled', 'sent', 'bounced', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."outreach_send_status" AS ENUM('scheduled', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."sender_account_type" AS ENUM('gmail', 'smtp');--> statement-breakpoint
CREATE TABLE "outreach_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"status" "outreach_campaign_status" DEFAULT 'draft' NOT NULL,
	"sequence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"block_minutes" integer DEFAULT 5 NOT NULL,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"niche" text,
	"location" text,
	"decision_maker" text,
	"email" text,
	"phone" text,
	"notes" text,
	"status" "outreach_lead_status" DEFAULT 'pending' NOT NULL,
	"last_action_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"sender_account_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"status" "outreach_send_status" DEFAULT 'scheduled' NOT NULL,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sender_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"type" "sender_account_type" NOT NULL,
	"label" text NOT NULL,
	"email" text NOT NULL,
	"from_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"daily_limit" integer DEFAULT 40 NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_secure" boolean,
	"smtp_username" text,
	"smtp_password_enc" text,
	"gmail_refresh_token_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "projects" jsonb;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "languages" text[];--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_leads" ADD CONSTRAINT "outreach_leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_leads" ADD CONSTRAINT "outreach_leads_campaign_id_outreach_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outreach_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sends" ADD CONSTRAINT "outreach_sends_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sends" ADD CONSTRAINT "outreach_sends_campaign_id_outreach_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outreach_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sends" ADD CONSTRAINT "outreach_sends_lead_id_outreach_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."outreach_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sends" ADD CONSTRAINT "outreach_sends_sender_account_id_sender_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD CONSTRAINT "sender_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_campaigns_tenant_idx" ON "outreach_campaigns" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outreach_leads_tenant_idx" ON "outreach_leads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outreach_leads_campaign_idx" ON "outreach_leads" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "outreach_sends_tenant_idx" ON "outreach_sends" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outreach_sends_campaign_idx" ON "outreach_sends" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_sends_lead_step_uq" ON "outreach_sends" USING btree ("campaign_id","lead_id","step_index");--> statement-breakpoint
CREATE INDEX "sender_accounts_tenant_idx" ON "sender_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sender_accounts_tenant_email_uq" ON "sender_accounts" USING btree ("tenant_id","email");