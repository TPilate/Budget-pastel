CREATE INDEX IF NOT EXISTS "expense_entries_year_month_idx" ON "expense_entries" USING btree ("year_assigned","month_assigned");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "income_entries_year_month_idx" ON "income_entries" USING btree ("year_assigned","month_assigned");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_envelope_allocations_envelope_year_month_idx" ON "monthly_envelope_allocations" USING btree ("envelope_id","year","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transfers_year_month_idx" ON "transfers" USING btree ("year_assigned","month_assigned");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "livret_yearly_history_livret_year_idx" ON "livret_yearly_history" USING btree ("livret_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "month_closures_year_month_idx" ON "month_closures" USING btree ("year","month");