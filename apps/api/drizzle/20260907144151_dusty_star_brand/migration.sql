ALTER TABLE "accountant" ADD COLUMN "owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Contabilidades que já existem: o dono é o Contador mais antigo, que é quem aceitou o
-- convite inicial do `create-firm`. Sem isto ninguém poderia convidar nas bases atuais.
UPDATE "accountant" a SET "owner" = true
WHERE a."id" = (
  SELECT b."id" FROM "accountant" b
  WHERE b."accounting_firm_id" = a."accounting_firm_id"
  ORDER BY b."created_at", b."id"
  LIMIT 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "accountant_owner_uidx" ON "accountant" ("accounting_firm_id") WHERE "owner";
