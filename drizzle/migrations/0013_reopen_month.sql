-- reopen_month: the inverse of close_month (0012_close_month_accounts.sql), spec §7.2.
--
-- Reopens (p_year, p_month) and every closed month after it, in one transaction (the
-- function body). For each such month M it removes what close_month wrote:
--   - the monthly_reports row and the closure_envelope_decisions rows;
--   - the savings_entries and transfers with source 'closure' dated M (manual ones stay);
--   - on month M+1's allocations, the carried_over_amount and overspend_deduction (the only
--     columns close_month writes there; base_ceiling stays in line with the default);
--   - the month_closures row, so close_month's INSERT works again (unique (year, month)).
-- The freeze allocation rows of M are kept: a reopened month keeps the ceilings it was
-- lived with (§7.2, builder's call).
-- Returns the number of months reopened. Hand-written: Drizzle does not manage functions.

CREATE OR REPLACE FUNCTION public.reopen_month(p_year int, p_month int)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  closure record;
  reopened int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM month_closures WHERE year = p_year AND month = p_month AND status = 'closed') THEN
    RAISE EXCEPTION 'MONTH_NOT_CLOSED';
  END IF;

  FOR closure IN
    SELECT id, year, month FROM month_closures
    WHERE status = 'closed' AND (year, month) >= (p_year, p_month)
    ORDER BY year DESC, month DESC
  LOOP
    DELETE FROM monthly_reports WHERE month_closure_id = closure.id;
    DELETE FROM closure_envelope_decisions WHERE month_closure_id = closure.id;

    DELETE FROM savings_entries
    WHERE source = 'closure' AND year = closure.year AND month = closure.month;

    DELETE FROM transfers
    WHERE source = 'closure' AND year_assigned = closure.year AND month_assigned = closure.month;

    UPDATE monthly_envelope_allocations
    SET carried_over_amount = 0, overspend_deduction = 0
    WHERE year = CASE WHEN closure.month = 12 THEN closure.year + 1 ELSE closure.year END
      AND month = CASE WHEN closure.month = 12 THEN 1 ELSE closure.month + 1 END;

    DELETE FROM month_closures WHERE id = closure.id;
    reopened := reopened + 1;
  END LOOP;

  RETURN reopened;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reopen_month(int, int) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reopen_month(int, int) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
