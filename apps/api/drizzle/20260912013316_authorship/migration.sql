ALTER TABLE "invite" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_accountant_id_fkey" FOREIGN KEY ("created_by") REFERENCES "accountant"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_reviewed_by_accountant_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "accountant"("id") ON DELETE SET NULL;