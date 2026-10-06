ALTER TABLE "request_item" ADD COLUMN "required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "expires_at" timestamp with time zone;