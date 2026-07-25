DROP INDEX "blueprints_tenant_name_uq";--> statement-breakpoint
DROP INDEX "sender_accounts_tenant_email_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "blueprints_tenant_name_uq" ON "blueprints" USING btree ("tenant_id","name") WHERE "blueprints"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sender_accounts_tenant_email_uq" ON "sender_accounts" USING btree ("tenant_id","email") WHERE "sender_accounts"."deleted_at" is null;