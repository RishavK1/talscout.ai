CREATE TYPE "public"."toolkit_connection_status" AS ENUM('active', 'pending', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "toolkit_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"toolkit_slug" text NOT NULL,
	"composio_connection_id" text NOT NULL,
	"account_label" text,
	"status" "toolkit_connection_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "toolkit_connections" ADD CONSTRAINT "toolkit_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "toolkit_connections_tenant_idx" ON "toolkit_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "toolkit_connections_tenant_composio_uq" ON "toolkit_connections" USING btree ("tenant_id","composio_connection_id");