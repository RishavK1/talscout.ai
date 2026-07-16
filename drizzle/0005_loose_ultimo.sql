CREATE TYPE "public"."outreach_channel" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."outreach_delivery_status" AS ENUM('sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_template_category" AS ENUM('marketing', 'utility', 'authentication');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_template_status" AS ENUM('pending', 'approved', 'rejected', 'disabled');--> statement-breakpoint
ALTER TYPE "public"."sender_account_type" ADD VALUE 'whatsapp';--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sender_account_id" uuid NOT NULL,
	"meta_template_name" text NOT NULL,
	"category" "whatsapp_template_category" NOT NULL,
	"language" text DEFAULT 'en_US' NOT NULL,
	"body_text" text NOT NULL,
	"placeholder_count" integer DEFAULT 0 NOT NULL,
	"status" "whatsapp_template_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"meta_template_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "channel" "outreach_channel" DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_sends" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "outreach_sends" ADD COLUMN "delivery_status" "outreach_delivery_status";--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN "whatsapp_phone_number_id" text;--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN "whatsapp_waba_id" text;--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN "whatsapp_access_token_enc" text;--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN "whatsapp_display_name" text;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_sender_account_id_sender_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."sender_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_templates_tenant_idx" ON "whatsapp_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "whatsapp_templates_meta_template_id_idx" ON "whatsapp_templates" USING btree ("meta_template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_tenant_sender_name_lang_uq" ON "whatsapp_templates" USING btree ("tenant_id","sender_account_id","meta_template_name","language");--> statement-breakpoint
CREATE INDEX "outreach_sends_provider_message_id_idx" ON "outreach_sends" USING btree ("provider_message_id");