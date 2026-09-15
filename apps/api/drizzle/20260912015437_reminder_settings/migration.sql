ALTER TABLE "accounting_firm" ADD COLUMN "reminder_max" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_firm" ADD COLUMN "reminder_due_soon_days" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_firm" ADD COLUMN "reminder_gap_days" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_firm" ADD CONSTRAINT "accounting_firm_reminder_chk" CHECK ("reminder_max" between 0 and 10
        and "reminder_due_soon_days" between 0 and 31
        and "reminder_gap_days" between 1 and 31);