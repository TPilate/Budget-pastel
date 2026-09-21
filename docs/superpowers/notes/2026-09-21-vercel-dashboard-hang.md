# Incident notes: Tableau de bord hangs forever on Vercel (2026-09-21)

## Summary

Milestone 4's full scope (Tasks 1-8: movements feed + Mouvements page + the
Tableau de bord dashboard rebuild) was implemented, reviewed, and merged to
`main`. Locally everything worked, including against the real production
Supabase database. On Vercel, the home page (`/`, gated by
`GET /api/dashboard/summary`) hung indefinitely — first for 5 minutes until
Vercel's `FUNCTION_INVOCATION_TIMEOUT` killed it, later (after fixes) it kept
hanging with no timeout ceiling visibly hit at all. `/api/envelopes/ceilings`
(the sidebar widget's endpoint, sharing the heaviest query with the dashboard
route) worked reliably once the fixes below landed. `/api/dashboard/summary`
never did.

**Current state:** reverted `main` to commit `660359a` (Milestone 4 Task 3,
before the dashboard work) via a plain revert-by-new-commit — nothing was
force-pushed or rewritten, every commit below is still in `git log` and
individually re-appliable. The Mouvements page and everything before it works
correctly in production. The Tableau de bord rebuild does not, for reasons
that were narrowed down significantly but never fully root-caused before the
decision was made to stop debugging live and come back to it deliberately.

## Timeline of fixes verified to work (each solved a real, distinct problem)

1. **Transaction pooler → Session pooler.** `DATABASE_URL` used Supabase's
   port-6543 (Supavisor transaction-mode) pooler. Verified directly, outside
   the app: a batch of 61 concurrent queries via `Promise.all` hangs forever
   (no error) against port 6543, and completes in ~280ms against port 5432
   (session-mode). Switched to 5432. This fixed the *local* dev hang
   completely.
2. **Supabase Network Restrictions.** Initially suspected as the Vercel-only
   cause (IP allowlist silently dropping Vercel's dynamic IPs — classic
   silent-hang signature). Checked: restrictions were already off
   ("accessed by all IP addresses"). Ruled out, not the cause.
3. **`idle_timeout` / `max_lifetime` / `connect_timeout` on the postgres.js
   client.** Without them, connections are held open forever
   (postgres.js default) and never returned to the pooler; `connect_timeout`
   bounds how long a connection *attempt* can hang before failing loudly
   instead of silently. Real improvement, didn't fully fix the Vercel hang.
4. **Pool size (`max`) tuning.** Went `1 → 5 → 1 → 5` across the session as
   evidence came in about serverless cold-start connection overhead vs.
   needing real parallelism for `Promise.all`-batched queries. Ultimately
   `max: 5` was correct once combined with fix #6 below.
5. **N+1 query batching.** `listBudgetEnvelopeLedgers` originally ran 5
   queries per envelope in a loop (~46 sequential round trips for 9
   envelopes). Rewritten to fetch each table once for the month and group in
   memory (5 queries total, regardless of envelope count). This is a real,
   worthwhile fix independent of the Vercel mystery — keep this pattern if
   the dashboard work is revisited.
6. **`statement_timeout` (server-enforced, not client-side).** Diagnostic
   evidence showed a `Promise.race`-based client-side timeout
   doesn't actually cancel a stuck query or free its connection — it only
   stops the caller from *waiting*, silently leaking wedged connections into
   the pool across repeated requests. `connection: { statement_timeout: 10000 }`
   makes Postgres itself cancel a stuck query and properly release the
   connection. Real fix for that specific leak mechanism.
7. **Region pinning (`vercel.json`, `"regions": ["fra1"]`).** Every Vercel
   log showed the function routed to Washington D.C. (iad1) while Supabase is
   in Frankfurt (eu-central-1) — a transatlantic hop on every query. Pinning
   to `fra1` was the single biggest win: a bare `select 1` diagnostic query
   went from consistently timing out at 8+ seconds to **5ms**. This is
   almost certainly worth keeping regardless of what else is revisited.

## What was never resolved

Even after #7 (region pinning) made a raw `select 1` reliably fast (5ms),
`/api/dashboard/summary` *still* hung, while `/api/envelopes/ceilings` (which
shares `listBudgetEnvelopeLedgers`, the heaviest single piece of the
dashboard route) worked reliably. The difference between the two routes is
exactly: `summary.get.ts` additionally fires, all via one top-level
`Promise.all`, 6 more direct `db.select()` queries plus
`getPrimaryReserveEnvelopeBalance()` plus `fetchMovements()` — roughly 20
near-simultaneous query requests against a 5-connection pool, vs. `ceilings`'s
~5. `summary.get.ts`'s own post-fetch logic is pure synchronous array
manipulation (`filter`/`reduce`/`map`/`find` over already-resolved arrays) —
reviewed carefully, nothing there can hang.

**Leading unexplored hypothesis:** something about firing ~20 queries
"simultaneously" via nested `Promise.all` (6 direct + 5 from
`listBudgetEnvelopeLedgers` + 3 from `getPrimaryReserveEnvelopeBalance` + 6
from `fetchMovements`) against Supabase's session pooler specifically causes
a hang that a smaller batch (~5, as in `ceilings.get.ts`) doesn't. This was
never confirmed — a diagnostic endpoint that timed each of the 9-10 pieces
individually (`server/api/debug/connectivity.get.ts`, since deleted by this
revert but fully preserved in git history at commit `0e04eeb`) was built and
pushed but its results were never retrieved before the decision was made to
stop and revert.

**Next things to try, in order of promise, if this is picked back up:**

1. Re-deploy `0e04eeb` (or cherry-pick `server/api/debug/connectivity.get.ts`
   from it) and actually get the per-piece timing breakdown this time — that
   was the very next step when debugging stopped.
2. If it confirms "concurrency, not any single query" — reduce
   `summary.get.ts`'s top-level concurrency deliberately: `await` the 6
   direct queries as one `Promise.all`, *then* `await` the three heavier
   functions sequentially (or in a second, smaller `Promise.all`), rather
   than firing all 9-10 things at once. Costs some latency, trades it for
   correctness while the real cause is still unknown.
3. Consider whether Supabase's session pooler has a documented per-client
   concurrent-query or connection limit lower than expected, and whether
   Supabase project tier affects it.
4. Consider bypassing Supavisor's pooler for this one heavy route (session
   pooler is already the "less scalable, more compatible" option — the
   direct database host was ruled out already, see below).

## Dead ends (don't re-try these)

- **Direct (non-pooler) database connection**
  (`db.<project-ref>.supabase.co`): resolves to an IPv6-only address (no A
  record at all). Confirmed via `dig`. This would very likely make things
  worse on a platform with unreliable IPv6 egress, not better — do not
  attempt this without first confirming Vercel's IPv6 egress works reliably
  for the target network path.
- **Supabase Network Restrictions**: confirmed disabled (allow-all) — not
  the cause of the Vercel-specific hang.

## What's preserved in `.env` / Vercel env vars (not reverted by git)

`.env` is gitignored, so the revert above did not touch it. The local
`DATABASE_URL` still points at the session pooler (port 5432) — leave it
there, fix #1 above is real and worth keeping regardless of the dashboard
work. Vercel's `DATABASE_URL` project env var was also updated to port 5432
during this session and was **not** reverted (git revert can't touch Vercel
dashboard settings) — worth double-checking it's still set that way before
resuming this work, since Milestone 3's `ceilings.get.ts` (which is live
again after this revert) depends on it too.
