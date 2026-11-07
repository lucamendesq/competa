ALTER TABLE "subscription" ADD COLUMN "upgrade_payment_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "pre_upgrade_plan_name" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "pre_upgrade_cycle" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "pre_upgrade_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "pre_upgrade_period_end" timestamp with time zone;