CREATE INDEX "contact_email_idx" ON "contact" ("email");--> statement-breakpoint
CREATE INDEX "contact_company_idx" ON "contact" ("company_id");--> statement-breakpoint
CREATE INDEX "document_request_idx" ON "document" ("request_id");--> statement-breakpoint
CREATE INDEX "document_request_item_idx" ON "document" ("request_item_id");--> statement-breakpoint
CREATE INDEX "upload_link_request_idx" ON "upload_link" ("request_id");