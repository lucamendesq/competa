ALTER TABLE "company" ADD COLUMN "responsible_accountant_id" uuid;--> statement-breakpoint
CREATE INDEX "company_responsible_accountant_idx" ON "company" ("responsible_accountant_id");--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_responsible_accountant_id_accountant_id_fkey" FOREIGN KEY ("responsible_accountant_id") REFERENCES "accountant"("id") ON DELETE SET NULL;