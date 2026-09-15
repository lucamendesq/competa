ALTER TABLE "push_subscription" DROP CONSTRAINT "push_subscription_endpoint_uidx";--> statement-breakpoint
ALTER TABLE "contact" DROP CONSTRAINT "contact_auth_user_id_key";--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_contact_endpoint_uidx" UNIQUE("contact_id","endpoint");--> statement-breakpoint
CREATE INDEX "contact_auth_user_idx" ON "contact" ("auth_user_id");--> statement-breakpoint
-- contas antigas de contato: posse do email já foi provada (link/convite); sem isto o
-- proximo magic link dispara o revokeUnprovenAccountAccess do better-auth e apaga a senha
UPDATE "user" SET "email_verified" = true
WHERE "id" IN (SELECT "auth_user_id" FROM "contact" WHERE "auth_user_id" IS NOT NULL);
