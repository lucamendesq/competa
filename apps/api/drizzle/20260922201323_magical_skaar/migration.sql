ALTER TABLE "upload_link" ADD CONSTRAINT "upload_link_request_uidx" UNIQUE("request_id");--> statement-breakpoint
CREATE INDEX "accountant_firm_idx" ON "accountant" ("accounting_firm_id");--> statement-breakpoint
CREATE INDEX "checklist_template_firm_idx" ON "checklist_template" ("accounting_firm_id");--> statement-breakpoint
CREATE INDEX "checklist_template_item_doc_type_idx" ON "checklist_template_item" ("document_type_id");--> statement-breakpoint
CREATE INDEX "company_firm_active_idx" ON "company" ("accounting_firm_id","active");--> statement-breakpoint
CREATE INDEX "document_type_firm_idx" ON "document_type" ("accounting_firm_id");--> statement-breakpoint
CREATE INDEX "invite_firm_idx" ON "invite" ("accounting_firm_id");--> statement-breakpoint
CREATE INDEX "invite_company_idx" ON "invite" ("company_id");--> statement-breakpoint
CREATE INDEX "document_reviewed_by_idx" ON "document" ("reviewed_by");--> statement-breakpoint
CREATE INDEX "document_uploaded_by_contact_idx" ON "document" ("uploaded_by_contact_id");--> statement-breakpoint
CREATE INDEX "request_company_idx" ON "request" ("company_id");--> statement-breakpoint
CREATE INDEX "upload_link_contact_idx" ON "upload_link" ("contact_id");