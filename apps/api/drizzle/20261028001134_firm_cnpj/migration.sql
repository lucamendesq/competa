ALTER TABLE "accounting_firm" ADD COLUMN "cnpj" text;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_firm_cnpj_uidx" ON "accounting_firm" ("cnpj") WHERE "cnpj" is not null;