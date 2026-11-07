CREATE TABLE "throttle_counter" (
	"key" text PRIMARY KEY,
	"hits" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "throttle_counter" ENABLE ROW LEVEL SECURITY;