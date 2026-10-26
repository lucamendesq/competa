CREATE TABLE "billing_webhook_event" (
	"id" text PRIMARY KEY,
	"event" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_webhook_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_status_chk" CHECK ("status" in ('trialing', 'ACTIVE', 'OVERDUE', 'CANCELED'));