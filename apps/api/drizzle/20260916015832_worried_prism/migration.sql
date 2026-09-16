CREATE TABLE "user_device" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"platform" text NOT NULL,
	"installed" boolean DEFAULT false NOT NULL,
	"user_agent" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_device_platform_chk" CHECK ("platform" in ('ios', 'android', 'desktop', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_device_user_device_uidx" ON "user_device" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "user_device_user_id_idx" ON "user_device" ("user_id");--> statement-breakpoint
ALTER TABLE "user_device" ADD CONSTRAINT "user_device_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;