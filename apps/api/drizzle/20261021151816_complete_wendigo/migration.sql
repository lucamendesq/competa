ALTER TABLE "subscription" ADD COLUMN "price_override" jsonb;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "price_override_reason" text;