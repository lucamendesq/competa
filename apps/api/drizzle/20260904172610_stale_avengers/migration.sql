ALTER TABLE "document" ADD COLUMN "upload_status" text DEFAULT 'awaiting_upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "uploaded_by_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "uploaded_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "uploaded_at" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "document_pending_upload_idx" ON "document" ("upload_status","created_at");--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_uploaded_by_contact_id_contact_id_fkey" FOREIGN KEY ("uploaded_by_contact_id") REFERENCES "contact"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_upload_status_chk" CHECK ("upload_status" in ('awaiting_upload', 'uploaded'));