ALTER TABLE "expense_entries" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "income_types" ADD COLUMN "is_salary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "income_types" ADD COLUMN "expected_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "savings_entries" ADD COLUMN "date" date;--> statement-breakpoint
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_category_or_envelope" CHECK ("expense_entries"."category_id" IS NOT NULL OR "expense_entries"."envelope_id" IS NOT NULL);