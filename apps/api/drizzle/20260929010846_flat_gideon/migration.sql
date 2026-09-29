CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY,
	"accounting_firm_id" uuid NOT NULL UNIQUE,
	"gateway_customer_id" text,
	"gateway_subscription_id" text,
	"plan_name" text DEFAULT 'trial' NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "subscription_firm_idx" ON "subscription" ("accounting_firm_id");--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_accounting_firm_id_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firm"("id") ON DELETE CASCADE;