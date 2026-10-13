CREATE TYPE "public"."savings_entry_source" AS ENUM('manual', 'closure');--> statement-breakpoint
ALTER TABLE "monthly_reports" ALTER COLUMN "pdf_path" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_entries" ADD COLUMN "source" "savings_entry_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD COLUMN "snapshot" jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_reports_month_closure_idx" ON "monthly_reports" USING btree ("month_closure_id");