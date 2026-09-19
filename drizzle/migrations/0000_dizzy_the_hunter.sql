CREATE TYPE "public"."closure_destination" AS ENUM('carry_over', 'savings', 'envelope');--> statement-breakpoint
CREATE TYPE "public"."closure_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."envelope_kind" AS ENUM('budget', 'reserve');--> statement-breakpoint
CREATE TYPE "public"."fifty_thirty_twenty_bucket" AS ENUM('besoins', 'envies', 'epargne');--> statement-breakpoint
CREATE TYPE "public"."financed_by" AS ENUM('budget', 'gift_given', 'gift_received');--> statement-breakpoint
CREATE TYPE "public"."wishlist_priority" AS ENUM('haute', 'moyenne', 'basse');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"current_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"is_fixed" boolean DEFAULT false NOT NULL,
	"default_target" numeric(10, 2),
	"fifty_thirty_twenty_bucket" "fifty_thirty_twenty_bucket",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"kind" "envelope_kind" NOT NULL,
	"default_ceiling" numeric(10, 2),
	"fifty_thirty_twenty_bucket" "fifty_thirty_twenty_bucket",
	"carry_over_default" boolean DEFAULT false NOT NULL,
	"show_on_home" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "income_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"requires_details_text" boolean DEFAULT false NOT NULL,
	"default_target_envelope_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"receives_salary_variance" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"category_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"account_id" uuid,
	"envelope_id" uuid,
	"financed_by" "financed_by" DEFAULT 'budget' NOT NULL,
	"month_assigned" integer NOT NULL,
	"year_assigned" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "income_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"income_type_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"date_received" date NOT NULL,
	"month_assigned" integer NOT NULL,
	"year_assigned" integer NOT NULL,
	"details_text" text,
	"target_envelope_id" uuid,
	"expected_amount" numeric(10, 2),
	"expected_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monthly_envelope_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"envelope_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"base_ceiling" numeric(10, 2) NOT NULL,
	"carried_over_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"overspend_deduction" numeric(10, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"from_envelope_id" uuid NOT NULL,
	"to_envelope_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"month_assigned" integer NOT NULL,
	"year_assigned" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "livret_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"livret_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "livret_yearly_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"livret_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"closing_balance" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "livrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"opening_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "savings_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"savings_goal_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "closure_envelope_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_closure_id" uuid NOT NULL,
	"envelope_id" uuid NOT NULL,
	"leftover_amount" numeric(10, 2) NOT NULL,
	"destination" "closure_destination" NOT NULL,
	"destination_savings_goal_id" uuid,
	"destination_envelope_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "month_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" "closure_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monthly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_closure_id" uuid NOT NULL,
	"pdf_path" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emailed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wishlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"product_url" text,
	"priority" "wishlist_priority" NOT NULL,
	"note" text,
	"purchased_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "income_types" ADD CONSTRAINT "income_types_default_target_envelope_id_envelopes_id_fk" FOREIGN KEY ("default_target_envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "income_entries" ADD CONSTRAINT "income_entries_income_type_id_income_types_id_fk" FOREIGN KEY ("income_type_id") REFERENCES "public"."income_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "income_entries" ADD CONSTRAINT "income_entries_target_envelope_id_envelopes_id_fk" FOREIGN KEY ("target_envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monthly_envelope_allocations" ADD CONSTRAINT "monthly_envelope_allocations_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_envelope_id_envelopes_id_fk" FOREIGN KEY ("from_envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_envelope_id_envelopes_id_fk" FOREIGN KEY ("to_envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "livret_contributions" ADD CONSTRAINT "livret_contributions_livret_id_livrets_id_fk" FOREIGN KEY ("livret_id") REFERENCES "public"."livrets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "livret_yearly_history" ADD CONSTRAINT "livret_yearly_history_livret_id_livrets_id_fk" FOREIGN KEY ("livret_id") REFERENCES "public"."livrets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_savings_goal_id_savings_goals_id_fk" FOREIGN KEY ("savings_goal_id") REFERENCES "public"."savings_goals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "closure_envelope_decisions" ADD CONSTRAINT "closure_envelope_decisions_month_closure_id_month_closures_id_fk" FOREIGN KEY ("month_closure_id") REFERENCES "public"."month_closures"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "closure_envelope_decisions" ADD CONSTRAINT "closure_envelope_decisions_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "closure_envelope_decisions" ADD CONSTRAINT "closure_envelope_decisions_destination_savings_goal_id_savings_goals_id_fk" FOREIGN KEY ("destination_savings_goal_id") REFERENCES "public"."savings_goals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "closure_envelope_decisions" ADD CONSTRAINT "closure_envelope_decisions_destination_envelope_id_envelopes_id_fk" FOREIGN KEY ("destination_envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_month_closure_id_month_closures_id_fk" FOREIGN KEY ("month_closure_id") REFERENCES "public"."month_closures"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
