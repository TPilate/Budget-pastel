ALTER TABLE "savings_goals" ADD COLUMN "target_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "monthly_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "note" text;