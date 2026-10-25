CREATE TABLE "cron_lease" (
	"name" text PRIMARY KEY,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cron_lease" ENABLE ROW LEVEL SECURITY;