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

## 6. Livrets remain unbuilt and undesigned

`livrets`, `livret_contributions` and `livret_yearly_history` exist in the schema with 0
rows, no endpoints and no UI. The parent spec's milestone 4 says "+ Livrets", but the Figma
Épargne frame has no livrets section and the file has no livret screen, so building one
would mean inventing it with nothing to check against. Their fate is a deliberate decision
to make, not an oversight.
