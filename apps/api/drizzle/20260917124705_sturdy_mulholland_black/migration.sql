ALTER TABLE "upload_link" ADD COLUMN "previous_token_hash" text;--> statement-breakpoint
ALTER TABLE "upload_link" ADD COLUMN "previous_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "upload_link_previous_token_idx" ON "upload_link" ("previous_token_hash");