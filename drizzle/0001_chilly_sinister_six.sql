ALTER TABLE "users" ALTER COLUMN "auth_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar" text;