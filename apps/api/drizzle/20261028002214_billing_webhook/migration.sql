ALTER TABLE "subscription" ADD COLUMN "pending_payment_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "pending_invoice_url" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "previous_gateway_subscription_ids" text[] DEFAULT '{}'::text[] NOT NULL;