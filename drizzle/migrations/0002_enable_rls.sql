-- Close the Data API to the public.
--
-- Every table below had RLS disabled while SUPABASE_ANON_KEY is served to every
-- visitor through runtimeConfig.public. That combination made the whole database
-- readable AND writable by anyone who loaded the site: a bare anon-key GET on
-- /rest/v1/expense_entries returned rows, and an anon-key POST was rejected only
-- by column validation (PGRST204), never by authorization.
--
-- Enabling RLS denies the `anon` role by default. The single policy per table
-- grants full access to `authenticated`, which matches this app's model: one
-- household shares all the data, and no table carries a per-user column.
--
-- This does NOT affect the current Drizzle/postgres.js data path. That connects
-- as `postgres`, the table owner, which bypasses RLS.

ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "accounts_authenticated_all" ON "accounts";
--> statement-breakpoint
CREATE POLICY "accounts_authenticated_all" ON "accounts"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "categories_authenticated_all" ON "categories";
--> statement-breakpoint
CREATE POLICY "categories_authenticated_all" ON "categories"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "closure_envelope_decisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "closure_envelope_decisions_authenticated_all" ON "closure_envelope_decisions";
--> statement-breakpoint
CREATE POLICY "closure_envelope_decisions_authenticated_all" ON "closure_envelope_decisions"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "envelopes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "envelopes_authenticated_all" ON "envelopes";
--> statement-breakpoint
CREATE POLICY "envelopes_authenticated_all" ON "envelopes"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "expense_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "expense_entries_authenticated_all" ON "expense_entries";
--> statement-breakpoint
CREATE POLICY "expense_entries_authenticated_all" ON "expense_entries"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "income_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "income_entries_authenticated_all" ON "income_entries";
--> statement-breakpoint
CREATE POLICY "income_entries_authenticated_all" ON "income_entries"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "income_types" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "income_types_authenticated_all" ON "income_types";
--> statement-breakpoint
CREATE POLICY "income_types_authenticated_all" ON "income_types"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "livret_contributions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "livret_contributions_authenticated_all" ON "livret_contributions";
--> statement-breakpoint
CREATE POLICY "livret_contributions_authenticated_all" ON "livret_contributions"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "livret_yearly_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "livret_yearly_history_authenticated_all" ON "livret_yearly_history";
--> statement-breakpoint
CREATE POLICY "livret_yearly_history_authenticated_all" ON "livret_yearly_history"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "livrets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "livrets_authenticated_all" ON "livrets";
--> statement-breakpoint
CREATE POLICY "livrets_authenticated_all" ON "livrets"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "month_closures" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "month_closures_authenticated_all" ON "month_closures";
--> statement-breakpoint
CREATE POLICY "month_closures_authenticated_all" ON "month_closures"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "monthly_envelope_allocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "monthly_envelope_allocations_authenticated_all" ON "monthly_envelope_allocations";
--> statement-breakpoint
CREATE POLICY "monthly_envelope_allocations_authenticated_all" ON "monthly_envelope_allocations"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "monthly_reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "monthly_reports_authenticated_all" ON "monthly_reports";
--> statement-breakpoint
CREATE POLICY "monthly_reports_authenticated_all" ON "monthly_reports"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "savings_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "savings_entries_authenticated_all" ON "savings_entries";
--> statement-breakpoint
CREATE POLICY "savings_entries_authenticated_all" ON "savings_entries"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "savings_goals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "savings_goals_authenticated_all" ON "savings_goals";
--> statement-breakpoint
CREATE POLICY "savings_goals_authenticated_all" ON "savings_goals"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "transfers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "transfers_authenticated_all" ON "transfers";
--> statement-breakpoint
CREATE POLICY "transfers_authenticated_all" ON "transfers"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "wishlist_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "wishlist_items_authenticated_all" ON "wishlist_items";
--> statement-breakpoint
CREATE POLICY "wishlist_items_authenticated_all" ON "wishlist_items"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
