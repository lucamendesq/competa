CREATE TABLE "whatsapp_integration" (
	"id" uuid PRIMARY KEY,
	"accounting_firm_id" uuid NOT NULL UNIQUE,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_phone_number" text NOT NULL,
	"business_account_id" text,
	"access_token" text NOT NULL,
	"status" text DEFAULT 'pending_phone' NOT NULL,
	"webhook_status" text DEFAULT 'inactive' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_integration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "meta_message_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "template" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "whatsapp_integration_firm_idx" ON "whatsapp_integration" ("accounting_firm_id");--> statement-breakpoint
CREATE INDEX "message_meta_message_idx" ON "message" ("meta_message_id");--> statement-breakpoint
ALTER TABLE "whatsapp_integration" ADD CONSTRAINT "whatsapp_integration_accounting_firm_id_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firm"("id") ON DELETE CASCADE;