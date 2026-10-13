-- Performs every write of a month closure in one transaction.
--
-- Hand-written, like 0002_enable_rls.sql: Drizzle does not manage functions, so a later
-- `db:generate` neither recreates nor drops it. SECURITY INVOKER keeps RLS in force — the
-- caller is the signed-in household through the Data API, never the table owner.
--
-- The server computes the plan (server/utils/domain/closure.ts); this function re-checks
-- the three ordering rules the server already checked, because a second tab or a double
-- click can arrive after the first closure has committed.

CREATE OR REPLACE FUNCTION public.close_month(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p_year int := (payload->>'year')::int;
  p_month int := (payload->>'month')::int;
  next_year int := CASE WHEN (payload->>'month')::int = 12 THEN (payload->>'year')::int + 1 ELSE (payload->>'year')::int END;
  next_month int := CASE WHEN (payload->>'month')::int = 12 THEN 1 ELSE (payload->>'month')::int + 1 END;
  closure_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM month_closures WHERE year = p_year AND month = p_month AND status = 'closed') THEN
    RAISE EXCEPTION 'MONTH_ALREADY_CLOSED';
  END IF;

  -- Closing a month writes the next month's allocations: it must never run behind a month
  -- that is already closed, or it would rewrite that month's figures.
  IF EXISTS (SELECT 1 FROM month_closures WHERE status = 'closed' AND (year, month) > (p_year, p_month)) THEN
    RAISE EXCEPTION 'LATER_MONTH_CLOSED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT year_assigned AS y, month_assigned AS m FROM expense_entries
      UNION SELECT year_assigned, month_assigned FROM income_entries
      UNION SELECT year_assigned, month_assigned FROM transfers
      UNION SELECT year, month FROM savings_entries
    ) AS data_months
    WHERE (data_months.y, data_months.m) < (p_year, p_month)
      AND NOT EXISTS (
        SELECT 1 FROM month_closures c
        WHERE c.year = data_months.y AND c.month = data_months.m AND c.status = 'closed'
      )
  ) THEN
    RAISE EXCEPTION 'PREVIOUS_MONTH_OPEN';
  END IF;

  INSERT INTO month_closures (year, month, status, closed_at)
  VALUES (p_year, p_month, 'closed', now())
  RETURNING id INTO closure_id;

  INSERT INTO closure_envelope_decisions
    (month_closure_id, envelope_id, leftover_amount, destination, destination_savings_goal_id, destination_envelope_id)
  SELECT closure_id,
         (d->>'envelopeId')::uuid,
         (d->>'leftoverAmount')::numeric,
         (d->>'destination')::closure_destination,
         (d->>'savingsGoalId')::uuid,
         (d->>'targetEnvelopeId')::uuid
  FROM jsonb_array_elements(payload->'decisions') AS d;

  INSERT INTO monthly_envelope_allocations (envelope_id, year, month, base_ceiling, carried_over_amount, overspend_deduction)
  SELECT (a->>'envelopeId')::uuid, p_year, p_month, (a->>'baseCeiling')::numeric, 0, 0
  FROM jsonb_array_elements(payload->'freezeAllocations') AS a
  ON CONFLICT (envelope_id, year, month) DO NOTHING;

  INSERT INTO monthly_envelope_allocations (envelope_id, year, month, base_ceiling, carried_over_amount, overspend_deduction)
  SELECT (a->>'envelopeId')::uuid, next_year, next_month,
         (a->>'baseCeiling')::numeric, (a->>'carriedOverAmount')::numeric, (a->>'overspendDeduction')::numeric
  FROM jsonb_array_elements(payload->'nextAllocations') AS a
  ON CONFLICT (envelope_id, year, month) DO UPDATE
    SET carried_over_amount = EXCLUDED.carried_over_amount,
        overspend_deduction = EXCLUDED.overspend_deduction;

  INSERT INTO savings_entries (savings_goal_id, year, month, amount, source)
  SELECT (s->>'savingsGoalId')::uuid, p_year, p_month, (s->>'amount')::numeric, 'closure'
  FROM jsonb_array_elements(payload->'savingsEntries') AS s;

  INSERT INTO monthly_reports (month_closure_id, snapshot)
  VALUES (closure_id, payload->'snapshot');

  RETURN closure_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.close_month(jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.close_month(jsonb) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
