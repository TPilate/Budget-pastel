# Épargne milestone — follow-ups

Found while building `/epargne`, deliberately left out of that plan's scope. Each one is
recorded with enough detail to act on without re-deriving it.

## 1. An empty PATCH body returns a 500 instead of a 400 — three endpoints, one cause

`PATCH /api/savings-goals/[id]` validates against a `.partial()` schema, so a body of `{}`
passes validation, reaches `patchRow`, and hits `db.update().set({})`. Drizzle's
`mapUpdateSet` rejects that with a raw `Error('No values to set')`, which surfaces as a 500
rather than a clean 400.

**This is not specific to savings goals.** The envelope and category PATCH endpoints share
the pattern, so the fix belongs in `server/utils/referenceCrud.ts` — a guard in `patchRow`
that throws `createError({ statusCode: 400 })` when the values object is empty — rather
than in any one endpoint. Fixing it in only the endpoint that surfaced it would leave the
same 500 reachable through the other two.

No data-corruption risk and no form in the app sends an empty patch, which is why it was
parked rather than fixed mid-plan.

## 2. `partitionExpenses` is listed in the spec as an `/api/epargne` dependency, but is not one

Spec §5 of `docs/superpowers/specs/2026-10-03-epargne-design.md` names `partitionExpenses`
among the helpers `/api/epargne` reuses. It does not need it: `compute503020` takes
`taggedSpend`, not a partition, and `EpargnePayload` has no besoins/envies expense
breakdown for a partition to feed — that breakdown belongs to the dashboard. The dead local
it produced was removed during the milestone. The spec line itself is still wrong and will
mislead the next reader of §5.

## 3. `fetchSavings` is likewise listed but unusable for this page

Same spec section. `fetchSavings(event, year, month)` is month-scoped, while §3.1 requires
each poche's balance to sum **all** entries for all time — the design's 5 184 € is a
running total, not a month's contribution. `/api/epargne` reads `savings_entries`
unfiltered and derives the month's rows in memory instead. Correct as built; the spec line
is the inaccurate one.

## 4. The connection pool still has no spare capacity

Unchanged by this milestone, and worth restating because `/epargne` was deliberately kept
off the pool. `/api/dashboard` and `/api/accounts/overview` each hold up to 5 of the pool's
12 slots, and `SidebarCeilingsWidget` costs another 5 on every page render. The pool's wait
queue is untimed, so exhaustion does not error — it hangs the page indefinitely, which is
how the original `/api/movements` bug presented. Any new route should follow `/api/epargne`
and stay entirely on the Supabase Data API.

## 5. Do not run `drizzle-kit push`

The Drizzle schema files do not record row-level security, while the live database has RLS
enabled on all 17 tables via the hand-written `drizzle/migrations/0002_enable_rls.sql`. A
push would compute the live RLS as drift and silently disable it, re-opening the public
Data API hole that was closed earlier. Generate migrations; never push.

## 6. Every E2E run still leaves one visible poche behind

`tests/e2e/epargne.spec.ts` now neutralises what it creates — the savings entry is zeroed,
the poche is set to `monthlyAmount: 0` / `targetAmount: null`, and it is renamed with a
`zz-e2e-` prefix — all in a `finally` so it runs even when an assertion fails. That stops
the figures drifting, but **neutralised is not invisible**: the row still renders on
`/epargne` as a poche, and one accumulates per run.

Two ways to close it properly, neither of which was in this milestone's scope:
- a delete endpoint for a savings goal, which the spec deliberately excluded; or
- an `archived_at` column on `savings_goals` plus a filter in the page's query. Every other
  reference table has one — `listActiveRows` in `server/utils/referenceCrud.ts` filters on
  it — and `savings_goals` is the exception. That asymmetry is probably worth closing on its
  own merits, since it also gives the user a way to retire a poche they no longer want.

Until then, residue has to be deleted by hand. The rows are easy to spot: they are the ones
named `zz-e2e-…`.

## 7. The same missing `sort_order` exists in five other create endpoints

The savings-goal POST now computes `sort_order` as max + 1, because `sort_order` defaults to
0 at the column level and a new row would otherwise tie with the first seeded row and make
list order unstable between renders. The create endpoints for envelopes, categories,
accounts, income types and the wishlist have the identical defect and were left untouched,
since changing ordering behaviour across five more endpoints is a decision worth taking
deliberately rather than folding into an Épargne fix wave. Each needs the same treatment
plus a test.

## 8. Minor items parked from the final review

- `.replace(',', '.')` in the amount forms replaces only the FIRST comma. Pre-existing and
  shared with `EnvelopeEditForm`; a second comma is not valid input anyway.
- The poche creation form omits `note`, although the edit form has it. A feature gap rather
  than a defect — `note` is optional and editable immediately after creating.
- `tests/unit/server/utils/epargneQuery.test.ts`'s pool guard mocks two helpers the module
  never imports, which makes it a weaker regression guard than it looks. The stronger
  version mocks `server/utils/db` itself and asserts it is never touched. Left alone because
  the final review independently traced the import graph and confirmed `/api/epargne` has no
  transitive path to the pool at all, so the hazard is proven absent by other means.

## 9. Livrets remain unbuilt and undesigned

`livrets`, `livret_contributions` and `livret_yearly_history` exist in the schema with 0
rows, no endpoints and no UI. The parent spec's milestone 4 says "+ Livrets", but the Figma
Épargne frame has no livrets section and the file has no livret screen, so building one
would mean inventing it with nothing to check against. Their fate is a deliberate decision
to make, not an oversight.
