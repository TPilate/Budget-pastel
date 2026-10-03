# Follow-ups after the dashboard milestone

Recorded 2026-10-03, at the end of `docs/superpowers/plans/2026-09-27-dashboard.md`.
Everything here was found during execution or by the final whole-branch review. None of
it blocked the merge; the Critical and Important findings were all fixed in-branch.

## 1. The connection pool has no spare capacity

`server/utils/db.ts` runs `max: 12`. After this milestone the two heaviest routes —
`/api/dashboard` and `/api/accounts/overview` — each hold **5** pool slots at a time,
down from 8, because `listBudgetEnvelopeLedgers` (5 round-trips) and
`listReserveEnvelopeBalances` (3) are now awaited sequentially rather than concurrently.

But `AppSidebar` renders `SidebarCeilingsWidget` on **every** page with no `ClientOnly`,
so each page load also fires `/api/envelopes/ceilings` for 5 more. One page view is
therefore up to 10 of 12. Two tabs, or the `await refresh()` after saving a savings
figure, can still approach the ceiling.

This matters because of the failure mode, not the arithmetic: postgres.js parks a query
on an **untimed** queue when no slot is free, so an exhausted pool hangs a request
forever rather than erroring. That is the 2026-09-21 incident
(`docs/superpowers/notes/2026-09-21-vercel-dashboard-hang.md`).

Worth doing: make `SidebarCeilingsWidget` lazy or `ClientOnly` so it stops costing every
page render, and consider whether `listReserveEnvelopeBalances` needs 3 round-trips.

## 2. `listReserveEnvelopeBalances` scans two whole tables, unbounded

`server/utils/reserveEnvelopeQuery.ts` runs `db.select().from(expenseEntries)` and
`.from(incomeEntries)` with **no WHERE clause** — every row ever written, loaded into
the Node heap. It is semantically correct, because a reserve's balance is lifetime
rather than monthly, but it is now on the home page's critical path and the cost grows
forever. A running total, or a date-bounded query plus a stored opening balance, would
bound it.

## 3. The donut and the KPI card measure different things on purpose

The donut's `Dépenses enveloppes` slice counts **gross** spend across **all** envelopes
including reserves; the `Enveloppes` KPI card sums **net** spend across **budget**
envelopes only. Both are spec-sanctioned. They were renamed apart so two different
numbers stop sharing one word, and
`tests/unit/server/utils/dashboardQuery.test.ts` now pins the divergence as intentional.
If the two are ever meant to reconcile, that test is the place to start.

## 4. `showOnHome` is orphaned

`envelopes.show_on_home` exists, defaults to **false**, is returned by
`listBudgetEnvelopeLedgers`, and is then dropped by `dashboardQuery.ts`. Nothing sets it
and the home page ignores it. Until this milestone there was no home page to honour it;
now there is. Either use it to filter the envelope grid, or drop the column.

## 5. `GET /api/savings` has no caller

The dashboard uses `fetchSavings` in-process, so the endpoint — along with the Zod query
validation and 400 handling that a whole fix round was spent on — is currently reachable
only from outside the app. Keep it if `/epargne` is genuinely next; otherwise it is dead
weight of exactly the shape that shipped last milestone with the wishlist envelope link.

## 6. Savings goals cannot be created from the app

`parametres.vue` manages categories, envelopes, income types and accounts — not savings
goals. The three seeded goals work, but adding a fourth requires running
`scripts/seed-reference-data.ts`. The dashboard's savings form depends on this list.

## 7. Smaller items

- `server/api/movements/index.get.ts` reuses `savingsQuerySchema` from
  `shared/schemas/savings.ts` for its `year`/`month` validation. The behaviour is right,
  the name is now misleading; a generic `monthQuerySchema` would read better.
- `POST /api/savings` returns `amount` as a string (raw Drizzle row) while
  `GET /api/savings` returns a number. Matches the existing accounts convention, but it
  is a new contract that is internally inconsistent.
- The Playwright suite is flaky under 6 parallel workers, reproducible on a clean tree.
  Unrelated to this milestone's changes; worth pinning down before it masks a real
  failure.
- `allocatedPercent` can legitimately exceed 100 % when spending outruns income, and is
  rendered unclamped. Verified it can never go negative.
