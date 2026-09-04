CREATE TABLE "account" (
	"id" uuid PRIMARY KEY,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accountant" (
	"id" uuid PRIMARY KEY,
	"accounting_firm_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_firm" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_template" (
	"id" uuid PRIMARY KEY,
	"accounting_firm_id" uuid,
	"name" text NOT NULL,
	"derived_from" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_template_item" (
	"id" uuid PRIMARY KEY,
	"checklist_template_id" uuid NOT NULL,
	"document_type_id" uuid NOT NULL,
	"periodicity" text DEFAULT 'monthly' NOT NULL,
	"annual_month" smallint,
	"due_day" smallint,
	"due_month_offset" smallint DEFAULT 1 NOT NULL,
	"condition_flag" text,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_template_item_uidx" UNIQUE("checklist_template_id","document_type_id"),
	CONSTRAINT "checklist_template_item_periodicity_chk" CHECK ("periodicity" in ('monthly', 'annual', 'on_demand'))
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY,
	"accounting_firm_id" uuid NOT NULL,
	"checklist_template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cnpj" text,
	"flags" jsonb DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_checklist_override" (
	"id" uuid PRIMARY KEY,
	"company_id" uuid NOT NULL,
	"document_type_id" uuid NOT NULL,
	"action" text NOT NULL,
	"periodicity" text,
	"annual_month" smallint,
	"due_day" smallint,
	"due_month_offset" smallint,
	"condition_flag" text,
	"required" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_checklist_override_uidx" UNIQUE("company_id","document_type_id"),
	CONSTRAINT "company_checklist_override_action_chk" CHECK ("action" in ('add', 'remove')),
	CONSTRAINT "company_checklist_override_periodicity_chk" CHECK ("periodicity" is null or "periodicity" in ('monthly', 'annual', 'on_demand'))
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"auth_user_id" uuid UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_type" (
	"id" uuid PRIMARY KEY,
	"accounting_firm_id" uuid,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"accepted_formats" text[] DEFAULT '{pdf}'::text[] NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_type_category_chk" CHECK ("category" in ('fiscal', 'financial', 'expense', 'payroll', 'tax', 'corporate'))
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" uuid PRIMARY KEY,
	"token_hash" text NOT NULL UNIQUE,
	"email" text NOT NULL,
	"accounting_firm_id" uuid,
	"company_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_has_one_origin" CHECK (num_nonnulls("accounting_firm_id", "company_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY,
	"request_id" uuid NOT NULL,
	"request_item_id" uuid,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_review_status_chk" CHECK ("review_status" in ('pending', 'accepted', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "period" (
	"id" uuid PRIMARY KEY,
	"accounting_firm_id" uuid NOT NULL,
	"reference_month" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_firm_month_uidx" UNIQUE("accounting_firm_id","reference_month"),
	CONSTRAINT "period_status_chk" CHECK ("status" in ('open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "request" (
	"id" uuid PRIMARY KEY,
	"period_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_period_company_uidx" UNIQUE("period_id","company_id"),
	CONSTRAINT "request_status_chk" CHECK ("status" in ('open', 'complete', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "request_item" (
	"id" uuid PRIMARY KEY,
	"request_id" uuid NOT NULL,
	"document_type_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"accepted_formats" text[] NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"deadline_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_item_status_chk" CHECK ("status" in ('pending', 'submitted', 'accepted', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "upload_link" (
	"id" uuid PRIMARY KEY,
	"request_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY,
	"request_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"purpose" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_channel_chk" CHECK ("channel" in ('email', 'whatsapp', 'push')),
	CONSTRAINT "message_purpose_chk" CHECK ("purpose" in ('link_delivery', 'reminder', 'rejection', 'deadline_missed', 'completion')),
	CONSTRAINT "message_status_chk" CHECK ("status" in ('queued', 'sent', 'delivered', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "request_item_pending_idx" ON "request_item" ("request_id","status");--> statement-breakpoint
CREATE INDEX "message_reminder_idx" ON "message" ("request_id","purpose");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "accountant" ADD CONSTRAINT "accountant_accounting_firm_id_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "accountant" ADD CONSTRAINT "accountant_auth_user_id_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "checklist_template" ADD CONSTRAINT "checklist_template_accounting_firm_id_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firm"("id");--> statement-breakpoint
ALTER TABLE "checklist_template" ADD CONSTRAINT "checklist_template_derived_from_checklist_template_id_fkey" FOREIGN KEY ("derived_from") REFERENCES "checklist_template"("id");--> statement-breakpoint
ALTER TABLE "checklist_template_item" ADD CONSTRAINT "checklist_template_item_JAJU1ueEVhqZ_fkey" FOREIGN KEY ("checklist_template_id") REFERENCES "checklist_template"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "checklist_template_item" ADD CONSTRAINT "checklist_template_item_document_type_id_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_type"("id");--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_accounting_firm_id_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firm"("id");--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_checklist_template_id_checklist_template_id_fkey" FOREIGN KEY ("checklist_template_id") REFERENCES "checklist_template"("id");--> statement-breakpoint
ALTER TABLE "company_checklist_override" ADD CONSTRAINT "company_checklist_override_company_id_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "company_checklist_override" ADD CONSTRAINT "company_checklist_override_YKVf5jOKobjp_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_type"("id");--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_company_id_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_auth_user_id_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document_type" ADD CONSTRAINT "document_type_accounting_firm_id_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firm"("id");--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_accounting_firm_id_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_company_id_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_request_id_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request"("id");--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_request_item_id_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "request_item"("id");--> statement-breakpoint
ALTER TABLE "period" ADD CONSTRAINT "period_accounting_firm_id_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firm"("id");--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_period_id_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "period"("id");--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_company_id_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id");--> statement-breakpoint
ALTER TABLE "request_item" ADD CONSTRAINT "request_item_request_id_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "request_item" ADD CONSTRAINT "request_item_document_type_id_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_type"("id");--> statement-breakpoint
ALTER TABLE "upload_link" ADD CONSTRAINT "upload_link_request_id_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "upload_link" ADD CONSTRAINT "upload_link_contact_id_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id");--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_request_id_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request"("id") ON DELETE CASCADE;