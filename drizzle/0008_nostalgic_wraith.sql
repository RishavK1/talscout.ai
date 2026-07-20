CREATE TYPE "public"."blueprint_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"website_url" text,
	"status" "blueprint_status" DEFAULT 'draft' NOT NULL,
	"sections" jsonb,
	"intake_answers" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blueprints_tenant_idx" ON "blueprints" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blueprints_tenant_name_uq" ON "blueprints" USING btree ("tenant_id","name");