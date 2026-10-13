# Navigation Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every client-side navigation costs one API round trip, renders its page before the data arrives, and never re-checks the session; cold starts get lighter.

**Architecture:** Envelope ledgers and reference lists move from the Postgres pool to the Supabase Data API, so they can be combined freely. Five new `/api/pages/*` endpoints each compose a page's reads in parallel behind one `requireUser`. Pages switch to `useLazyFetch` with a shared skeleton; the auth middleware checks the session once per visit and a 401 interceptor covers expiry. `pdfkit` loads only inside the PDF route.

**Tech Stack:** Nuxt 4 / Nitro, Vue 3.5 `<script setup>`, `@supabase/ssr` (Data API), Drizzle (pool, untouched paths), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-navigation-perf-design.md`

## Global Constraints

- **New and rewritten server reads use the Supabase Data API only**, never `server/utils/db`, except the dashboard's existing query and `listReserveEnvelopeBalances`, which stay on the pool. No page endpoint combines two pool-heavy reads.
- Every Data API request carries `AbortSignal.timeout(10000)`; a failure is logged with the table name, then thrown as a 500 — never partial data.
- `numeric` columns arrive from PostgREST as strings: wrap in `Number()` where the code computes; keep nullable values `null`.
- Page endpoints return **exactly the shapes the pages consume today** (same field names, same row shapes as the endpoints they replace).
- No client-side cache between pages: every visit refetches its single call.
- Page data keys: `page-dashboard`, `page-mouvements`, `page-enveloppes`, `page-envies`, `page-parametres`; unchanged single-call keys `epargne`, `accounts-overview`, `closure`; shared sidebar key `envelope-ceilings`.
- Forms keep their `isHydrated` + `isSubmitting` guards. Money renders only through `formatEuro` / `formatEuroShort`. Project design tokens only.
- Never `drizzle-kit push`. No database writes in tests except what existing E2E specs already do. Never push to `main` without the human partner's go.

## Review Focus

1. **Session expiry mid-visit** — a page call answering 401 must reset the session flag and bounce through the auth check instead of leaving an endless skeleton. → Task 4 unit test + Task 8 E2E (401 triggers a `/api/health` re-check).
2. **Log out, then log back in** — the "session verified" flag must not survive a logout, or a signed-out visitor would skip the check. → Task 4 test on the logout path.
3. **A failing page call** — the skeleton must disappear and the existing error banner show. → Task 8 E2E with a mocked 500.
4. **Typing into a form before its data arrives** — on Mouvements the entry forms must not render until the reference lists are loaded. → Task 5 (forms behind `v-if` on the data) + Task 8 E2E with a delayed response.
5. **Ledger regression** — moving envelope ledgers to the Data API must not change a single figure. → Task 1 ports every existing hand-computed case unchanged.

---

## File Structure

**Created:**
- `server/utils/referenceQuery.ts` — Data API reads of reference tables, camelCased like Drizzle rows
- `server/utils/pageData.ts` — one composer per page endpoint
- `server/api/pages/{dashboard,mouvements,enveloppes,envies,parametres}.get.ts`
- `app/utils/sessionGate.ts` — pure session-check decisions
- `app/plugins/api-unauthorized.client.ts` — 401 interceptor
- `app/components/PageSkeleton.vue`
- `tests/e2e/perf.spec.ts`
- Unit tests mirroring each

**Modified:**
- `server/utils/envelopeCeilingsQuery.ts` (rewritten on the Data API) and its 4 callers: `server/api/envelopes/ceilings.get.ts`, `server/utils/dashboardQuery.ts`, `server/utils/wishlistQuery.ts`, `server/utils/accountsOverviewQuery.ts`
- `app/middleware/auth.global.ts`, `app/components/AppSidebar.vue`, `app/app.vue`
- `app/components/SidebarCeilingsWidget.vue`, `app/components/entry/EntryPanel.vue`
- `app/pages/{index,mouvements,enveloppes,envies,parametres,epargne,comptes,compte-rendu}.vue`
- `server/api/reports/[year]/[month].get.ts`
- `playwright.config.ts`, `docs/HANDOFF.md`

---

### Task 1: Envelope ledgers on the Data API

**Files:**
- Modify (rewrite): `server/utils/envelopeCeilingsQuery.ts`
- Modify: `server/api/envelopes/ceilings.get.ts`, `server/utils/dashboardQuery.ts:83`, `server/utils/wishlistQuery.ts:44`, `server/utils/accountsOverviewQuery.ts:54`
- Test (rewrite): `tests/unit/server/utils/envelopeCeilingsQuery.test.ts`

**Interfaces:**
- Consumes: `computeEnvelopeLedger` (`server/utils/domain/envelopeLedger.ts`), `deriveEnvelopeSubtitle` (`server/utils/domain/envelopeSubtitle.ts`), `createSupabaseServerClient`.
- Produces: `listBudgetEnvelopeLedgers(event: H3Event, year: number, month: number): Promise<BudgetEnvelopeLedger[]>` — same `BudgetEnvelopeLedger` interface as today (`id, name, emoji, showOnHome, ceiling, netSpent, remaining, subtitle, incomeCreditsTotal, defaultCeiling`). **The new first parameter is `event`.**

- [ ] **Step 1: Rewrite the test on a Data API mock, porting every existing case unchanged**

Replace the Drizzle mock harness at the top of `tests/unit/server/utils/envelopeCeilingsQuery.test.ts` (everything before `describe(`) with:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rowsByTable: Record<string, any[]> = {}
  const errors: Record<string, { message: string } | null> = {}
  const calls: Record<string, unknown[][]> = {}
  const makeClient = () => ({
    from(table: string) {
      const record = (name: string) => (...args: unknown[]) => { (calls[table] ??= []).push([name, ...args]); return builder }
      const builder: any = {
        select: record('select'), eq: record('eq'), is: record('is'), not: record('not'), order: record('order'),
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve({ data: errors[table] ? null : (rowsByTable[table] ?? []), error: errors[table] ?? null }).then(ok, err),
      }
      return builder
    },
  })
  return { rowsByTable, errors, calls, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({ createSupabaseServerClient: () => mocks.makeClient() }))
// The point of this rewrite: ledgers must no longer hold pool slots.
vi.mock('../../../../server/utils/db', () => { throw new Error('envelope ledgers must not touch the connection pool') })

import { listBudgetEnvelopeLedgers } from '../../../../server/utils/envelopeCeilingsQuery'

const event = { context: {} } as any

function resetRows() {
  for (const key of Object.keys(mocks.rowsByTable)) delete mocks.rowsByTable[key]
  for (const key of Object.keys(mocks.errors)) delete mocks.errors[key]
  for (const key of Object.keys(mocks.calls)) delete mocks.calls[key]
}
```
Then port **every** existing case, keeping each test name, each comment and **every expected value byte for byte**. Only three things change per case:
1. `mocks.rowsByTable.<drizzleName>` → the PostgREST table name: `envelopes`, `monthly_envelope_allocations`, `expense_entries`, `income_entries`, `transfers`.
2. Row keys become snake_case: `showOnHome`→`show_on_home`, `defaultCeiling`→`default_ceiling`, `envelopeId`→`envelope_id`, `baseCeiling`→`base_ceiling`, `carriedOverAmount`→`carried_over_amount`, `overspendDeduction`→`overspend_deduction`, `targetEnvelopeId`→`target_envelope_id`, `fromEnvelopeId`→`from_envelope_id`, `toEnvelopeId`→`to_envelope_id`. Values stay strings (`'150.00'`), as PostgREST sends them.
3. `listBudgetEnvelopeLedgers(2026, 9)` → `listBudgetEnvelopeLedgers(event, 2026, 9)`.

For example case 1 becomes:
```ts
    mocks.rowsByTable.envelopes = [
      { id: 'e1', name: 'Loisirs', emoji: '🎉', show_on_home: true, default_ceiling: '150.00' },
    ]
    mocks.rowsByTable.expense_entries = [
      { envelope_id: 'e1', amount: '42.50' },
    ]

    const result = await listBudgetEnvelopeLedgers(event, 2026, 9)
```
Append two new cases inside the `describe`:
```ts
  it('scopes every month-bound read to the requested month and keeps only active budget envelopes', async () => {
    await listBudgetEnvelopeLedgers(event, 2026, 9)
    expect(mocks.calls.envelopes).toContainEqual(['eq', 'kind', 'budget'])
    expect(mocks.calls.envelopes).toContainEqual(['is', 'archived_at', null])
    for (const table of ['expense_entries', 'income_entries', 'transfers']) {
      expect(mocks.calls[table]).toContainEqual(['eq', 'year_assigned', 2026])
      expect(mocks.calls[table]).toContainEqual(['eq', 'month_assigned', 9])
    }
    expect(mocks.calls.monthly_envelope_allocations).toContainEqual(['eq', 'year', 2026])
    expect(mocks.calls.monthly_envelope_allocations).toContainEqual(['eq', 'month', 9])
  })

  it('throws a 500 naming the table rather than returning partial ledgers', async () => {
    mocks.errors.transfers = { message: 'boom' }
    await expect(listBudgetEnvelopeLedgers(event, 2026, 9)).rejects.toMatchObject({
      statusCode: 500, message: expect.stringContaining('transfers'),
    })
  })
```
Add `beforeEach(() => resetRows())` if the existing `describe` does not already call `resetRows`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/server/utils/envelopeCeilingsQuery.test.ts`
Expected: FAIL — the suite cannot load because the current module imports `./db` (the mock throws).

- [ ] **Step 3: Rewrite the module**

`server/utils/envelopeCeilingsQuery.ts`:
```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { computeEnvelopeLedger } from './domain/envelopeLedger'
import { deriveEnvelopeSubtitle } from './domain/envelopeSubtitle'

export interface BudgetEnvelopeLedger {
  id: string
  name: string
  emoji: string
  showOnHome: boolean
  ceiling: number
  netSpent: number
  remaining: number
  subtitle: string | null
  // Expenses minus credits gives netSpent, which cannot be un-mixed afterwards. The
  // dashboard needs the credits separately to render "+20 € reçus".
  incomeCreditsTotal: number
  // `ceiling` above is computed (base + carry-over - overspend + transfers) and so is not
  // editable. The envelope edit form needs the stored defaultCeiling, which is the field
  // PATCH /api/envelopes/[id] actually writes.
  defaultCeiling: number
}

// Data API only. This used to hold five pool slots per call, from the sidebar on every
// render, the dashboard, Comptes and Envies; on the Data API it can be combined with other
// reads in one page request without exhausting the pool.
const REQUEST_TIMEOUT_MS = 10000

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  console.error(`[envelopeCeilingsQuery] ${table} request failed: ${error.message}`)
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load envelopes',
    message: `envelope ledgers: ${table} request failed: ${error.message}`,
  })
}

const sum = (rows: { amount: unknown }[]) => rows.reduce((total, row) => total + Number(row.amount), 0)

export async function listBudgetEnvelopeLedgers(event: H3Event, year: number, month: number): Promise<BudgetEnvelopeLedger[]> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  const [envelopesRes, allocationsRes, expensesRes, incomesRes, transfersRes] = await Promise.all([
    supabase.from('envelopes').select('id,name,emoji,show_on_home,default_ceiling')
      .eq('kind', 'budget').is('archived_at', null).order('sort_order').abortSignal(signal),
    supabase.from('monthly_envelope_allocations').select('envelope_id,base_ceiling,carried_over_amount,overspend_deduction')
      .eq('year', year).eq('month', month).abortSignal(signal),
    supabase.from('expense_entries').select('envelope_id,amount')
      .eq('year_assigned', year).eq('month_assigned', month).not('envelope_id', 'is', null).abortSignal(signal),
    supabase.from('income_entries').select('target_envelope_id,amount')
      .eq('year_assigned', year).eq('month_assigned', month).not('target_envelope_id', 'is', null).abortSignal(signal),
    supabase.from('transfers').select('from_envelope_id,to_envelope_id,amount')
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
  ])

  assertOk('envelopes', envelopesRes.error)
  assertOk('monthly_envelope_allocations', allocationsRes.error)
  assertOk('expense_entries', expensesRes.error)
  assertOk('income_entries', incomesRes.error)
  assertOk('transfers', transfersRes.error)

  const allocations = (allocationsRes.data ?? []) as any[]
  const expenses = (expensesRes.data ?? []) as any[]
  const incomes = (incomesRes.data ?? []) as any[]
  const transfers = (transfersRes.data ?? []) as any[]
  const allocationByEnvelopeId = new Map(allocations.map((row) => [row.envelope_id, row]))

  return ((envelopesRes.data ?? []) as any[]).map((envelope) => {
    const allocation = allocationByEnvelopeId.get(envelope.id)
    const carriedOverAmount = allocation ? Number(allocation.carried_over_amount) : 0
    const transfersInTotal = sum(transfers.filter((row) => row.to_envelope_id === envelope.id))
    const transfersOutTotal = sum(transfers.filter((row) => row.from_envelope_id === envelope.id))
    const incomeCreditsTotal = sum(incomes.filter((row) => row.target_envelope_id === envelope.id))
    const defaultCeiling = Number(envelope.default_ceiling ?? 0)

    const ledger = computeEnvelopeLedger({
      defaultCeiling,
      allocation: allocation
        ? {
            baseCeiling: Number(allocation.base_ceiling),
            carriedOverAmount,
            overspendDeduction: Number(allocation.overspend_deduction),
          }
        : null,
      transfersIn: transfersInTotal,
      transfersOut: transfersOutTotal,
      expensesTotal: sum(expenses.filter((row) => row.envelope_id === envelope.id)),
      incomeCreditsTotal,
    })

    return {
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      showOnHome: Boolean(envelope.show_on_home),
      ...ledger,
      incomeCreditsTotal,
      defaultCeiling,
      subtitle: deriveEnvelopeSubtitle({
        carriedOverAmount,
        netTransfer: transfersInTotal - transfersOutTotal,
        incomeCreditsTotal,
      }),
    }
  })
}
```

- [ ] **Step 4: Update the four callers to pass `event`**

- `server/api/envelopes/ceilings.get.ts`: `return listBudgetEnvelopeLedgers(event, now.getFullYear(), now.getMonth() + 1)`
- `server/utils/dashboardQuery.ts:83`: `const ledgers = await listBudgetEnvelopeLedgers(event, year, month)` and update the comment above it: ledgers are now Data API; only `listReserveEnvelopeBalances` still holds pool slots.
- `server/utils/wishlistQuery.ts:44`: `listBudgetEnvelopeLedgers(event, year, month),`
- `server/utils/accountsOverviewQuery.ts:54`: `const ledgers = await listBudgetEnvelopeLedgers(event, year, month)` (the function already receives `event`; check its signature and use that name).
In each of `tests/unit/server/utils/{dashboardQuery,wishlistQuery,accountsOverviewQuery}.test.ts`, if any assertion checks the arguments `ledgerMock` was called with, update it to include the event first; add none otherwise. `epargneQuery.test.ts` must still assert the ledger is never called.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/server/utils/envelopeCeilingsQuery.test.ts` → PASS (all ported cases + 2 new).
Run: `npm test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add server/utils/envelopeCeilingsQuery.ts server/api/envelopes/ceilings.get.ts server/utils/dashboardQuery.ts server/utils/wishlistQuery.ts server/utils/accountsOverviewQuery.ts tests/unit/server/utils
git commit -m "perf: compute envelope ledgers through the Data API instead of the pool"
```

---

### Task 2: Reference lists and savings goals on the Data API

**Files:**
- Create: `server/utils/referenceQuery.ts`
- Test: `tests/unit/server/utils/referenceQuery.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient`.
- Produces:
  - `type ReferenceTable = 'categories' | 'envelopes' | 'income_types' | 'accounts'`
  - `camelizeRow(row: Record<string, unknown>): Record<string, unknown>` — snake_case keys → camelCase, values untouched
  - `fetchActiveRows(event: H3Event, table: ReferenceTable): Promise<Record<string, unknown>[]>` — rows with `archived_at IS NULL`, ordered by `sort_order`, camelCased (the same shape `listActiveRows` returns over the wire)
  - `fetchSavingsGoals(event: H3Event): Promise<Record<string, unknown>[]>` — all goals ordered by `sort_order`, camelCased (`savings_goals` has no `archived_at`)

- [ ] **Step 1: Write the failing test**

`tests/unit/server/utils/referenceQuery.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const responses: Record<string, { data: any, error: any }> = {}
  const calls: Record<string, unknown[][]> = {}
  const makeClient = () => ({
    from(table: string) {
      const record = (name: string) => (...args: unknown[]) => { (calls[table] ??= []).push([name, ...args]); return builder }
      const builder: any = {
        select: record('select'), is: record('is'), order: record('order'),
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve(responses[table] ?? { data: [], error: null }).then(ok, err),
      }
      return builder
    },
  })
  return { responses, calls, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({ createSupabaseServerClient: () => mocks.makeClient() }))
vi.mock('../../../../server/utils/db', () => { throw new Error('referenceQuery must not touch the connection pool') })

import { camelizeRow, fetchActiveRows, fetchSavingsGoals } from '../../../../server/utils/referenceQuery'

const event = { context: {} } as any

describe('referenceQuery', () => {
  beforeEach(() => {
    for (const key of Object.keys(mocks.responses)) delete mocks.responses[key]
    for (const key of Object.keys(mocks.calls)) delete mocks.calls[key]
  })

  it('camelCases keys exactly like Drizzle column names, leaving values alone', () => {
    expect(camelizeRow({ id: 'a', default_ceiling: '90.00', fifty_thirty_twenty_bucket: 'envies', show_on_home: false, archived_at: null }))
      .toEqual({ id: 'a', defaultCeiling: '90.00', fiftyThirtyTwentyBucket: 'envies', showOnHome: false, archivedAt: null })
  })

  it('reads only active rows of a reference table, in display order', async () => {
    mocks.responses.income_types = { data: [{ id: 't1', name: 'Salaire', emoji: '💼', requires_details_text: false, default_target_envelope_id: null, sort_order: 0, archived_at: null }], error: null }

    const rows = await fetchActiveRows(event, 'income_types')

    expect(rows).toEqual([{ id: 't1', name: 'Salaire', emoji: '💼', requiresDetailsText: false, defaultTargetEnvelopeId: null, sortOrder: 0, archivedAt: null }])
    expect(mocks.calls.income_types).toEqual([['select', '*'], ['is', 'archived_at', null], ['order', 'sort_order']])
  })

  it('reads every savings goal in display order', async () => {
    mocks.responses.savings_goals = { data: [{ id: 'g1', name: 'Long terme', receives_salary_variance: true, sort_order: 0 }], error: null }
    expect(await fetchSavingsGoals(event)).toEqual([{ id: 'g1', name: 'Long terme', receivesSalaryVariance: true, sortOrder: 0 }])
    expect(mocks.calls.savings_goals).toEqual([['select', '*'], ['order', 'sort_order']])
  })

  it('throws a 500 naming the table on failure', async () => {
    mocks.responses.accounts = { data: null, error: { message: 'boom' } }
    await expect(fetchActiveRows(event, 'accounts')).rejects.toMatchObject({ statusCode: 500, message: expect.stringContaining('accounts') })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/server/utils/referenceQuery.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

`server/utils/referenceQuery.ts`:
```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'

// Data API twin of referenceCrud.listActiveRows, for page endpoints that combine several
// lists in one request: on the pool, Paramètres alone would hold four slots at once.
// Rows are camelCased so the JSON a page receives is the same shape as before.
const REQUEST_TIMEOUT_MS = 10000

export type ReferenceTable = 'categories' | 'envelopes' | 'income_types' | 'accounts'

export function camelizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()),
    value,
  ]))
}

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  console.error(`[referenceQuery] ${table} request failed: ${error.message}`)
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load reference data',
    message: `reference: ${table} request failed: ${error.message}`,
  })
}

export async function fetchActiveRows(event: H3Event, table: ReferenceTable): Promise<Record<string, unknown>[]> {
  const { data, error } = await createSupabaseServerClient(event)
    .from(table).select('*').is('archived_at', null).order('sort_order')
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  assertOk(table, error)
  return (data ?? []).map((row: any) => camelizeRow(row))
}

export async function fetchSavingsGoals(event: H3Event): Promise<Record<string, unknown>[]> {
  // savings_goals has no archived_at column, so every row is live.
  const { data, error } = await createSupabaseServerClient(event)
    .from('savings_goals').select('*').order('sort_order')
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  assertOk('savings_goals', error)
  return (data ?? []).map((row: any) => camelizeRow(row))
}
```

- [ ] **Step 4: Run the test** → PASS. Then `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/referenceQuery.ts tests/unit/server/utils/referenceQuery.test.ts
git commit -m "perf: read reference lists and savings goals through the Data API"
```

---

### Task 3: One endpoint per page

**Files:**
- Create: `server/utils/pageData.ts`, `server/api/pages/dashboard.get.ts`, `server/api/pages/mouvements.get.ts`, `server/api/pages/enveloppes.get.ts`, `server/api/pages/envies.get.ts`, `server/api/pages/parametres.get.ts`
- Test: `tests/unit/server/utils/pageData.test.ts`

**Interfaces:**
- Consumes: `fetchDashboard(event, year, month, today)` (`dashboardQuery.ts`), `fetchMovements(event, year, month)` (`movementsQuery.ts`), `fetchWishlist(event, year, month)` (`wishlistQuery.ts`), `listBudgetEnvelopeLedgers(event, year, month)` (Task 1), `listReserveEnvelopeBalances()` (`reserveEnvelopeQuery.ts`, pool), `fetchActiveRows`, `fetchSavingsGoals` (Task 2), `getClosureStatus(event, now)` (`closureService.ts`).
- Produces (each takes `(event: H3Event, now: Date)`):
  - `getDashboardPage` → `{ dashboard: DashboardPayload, goals: Record<string, unknown>[], closureStatus: ClosureStatusPayload }`
  - `getMouvementsPage` → `{ movements: Movement[], reference: { categories, accounts, envelopes, incomeTypes } }`
  - `getEnveloppesPage` → `{ envelopes: BudgetEnvelopeLedger[], reserves: ReserveEnvelopeBalance[] }`
  - `getEnviesPage` → `{ items: WishlistItemView[], envelopes: Record<string, unknown>[] }`
  - `getParametresPage` → `{ categories, envelopes, incomeTypes, accounts }`
  - Routes `GET /api/pages/{dashboard,mouvements,enveloppes,envies,parametres}`.

- [ ] **Step 1: Write the failing test**

`tests/unit/server/utils/pageData.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Each source resolves only when the test says so, which proves the composers start every
// read before awaiting any of them.
const deferred = vi.hoisted(() => {
  const pending: { name: string, args: unknown[], resolve: (value: unknown) => void }[] = []
  const make = (name: string) => vi.fn((...args: unknown[]) => new Promise((resolve) => { pending.push({ name, args, resolve }) }))
  return { pending, make }
})

const src = vi.hoisted(() => ({
  fetchDashboard: deferred.make('fetchDashboard'),
  fetchMovements: deferred.make('fetchMovements'),
  fetchWishlist: deferred.make('fetchWishlist'),
  listBudgetEnvelopeLedgers: deferred.make('listBudgetEnvelopeLedgers'),
  listReserveEnvelopeBalances: deferred.make('listReserveEnvelopeBalances'),
  fetchActiveRows: deferred.make('fetchActiveRows'),
  fetchSavingsGoals: deferred.make('fetchSavingsGoals'),
  getClosureStatus: deferred.make('getClosureStatus'),
}))

vi.mock('../../../../server/utils/dashboardQuery', () => ({ fetchDashboard: src.fetchDashboard }))
vi.mock('../../../../server/utils/movementsQuery', () => ({ fetchMovements: src.fetchMovements }))
vi.mock('../../../../server/utils/wishlistQuery', () => ({ fetchWishlist: src.fetchWishlist }))
vi.mock('../../../../server/utils/envelopeCeilingsQuery', () => ({ listBudgetEnvelopeLedgers: src.listBudgetEnvelopeLedgers }))
vi.mock('../../../../server/utils/reserveEnvelopeQuery', () => ({ listReserveEnvelopeBalances: src.listReserveEnvelopeBalances }))
vi.mock('../../../../server/utils/referenceQuery', () => ({ fetchActiveRows: src.fetchActiveRows, fetchSavingsGoals: src.fetchSavingsGoals }))
vi.mock('../../../../server/utils/closureService', () => ({ getClosureStatus: src.getClosureStatus }))
vi.mock('../../../../server/utils/db', () => { throw new Error('pageData must not import the pool directly') })

import { getDashboardPage, getMouvementsPage, getEnveloppesPage, getEnviesPage, getParametresPage } from '../../../../server/utils/pageData'

const event = { context: {} } as any
const NOW = new Date('2026-10-13T08:00:00Z')

async function settle<T>(promise: Promise<T>, values: Record<string, (args: unknown[]) => unknown>): Promise<T> {
  // Let every synchronous call inside the composer happen, then resolve them all.
  await Promise.resolve()
  const started = deferred.pending.splice(0)
  for (const call of started) call.resolve(values[call.name](call.args))
  return promise
}

describe('page composers', () => {
  beforeEach(() => {
    deferred.pending.length = 0
    for (const fn of Object.values(src)) fn.mockClear()
  })

  it('Mouvements: the feed and the four reference lists start together, for the current month', async () => {
    const result = getMouvementsPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(
      ['fetchActiveRows', 'fetchActiveRows', 'fetchActiveRows', 'fetchActiveRows', 'fetchMovements'],
    )
    expect(src.fetchMovements).toHaveBeenCalledWith(event, 2026, 10)
    expect(src.fetchActiveRows.mock.calls.map((call) => call[1]).sort()).toEqual(['accounts', 'categories', 'envelopes', 'income_types'])

    const page = await settle(result, {
      fetchMovements: () => [{ id: 'm1' }],
      fetchActiveRows: (args) => [{ table: args[1] }],
    })
    expect(page).toEqual({
      movements: [{ id: 'm1' }],
      reference: {
        categories: [{ table: 'categories' }],
        accounts: [{ table: 'accounts' }],
        envelopes: [{ table: 'envelopes' }],
        incomeTypes: [{ table: 'income_types' }],
      },
    })
  })

  it('Paramètres: four lists in parallel, keyed as the page reads them', async () => {
    const result = getParametresPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending).toHaveLength(4)
    const page = await settle(result, { fetchActiveRows: (args) => [{ table: args[1] }] })
    expect(page).toEqual({
      categories: [{ table: 'categories' }],
      envelopes: [{ table: 'envelopes' }],
      incomeTypes: [{ table: 'income_types' }],
      accounts: [{ table: 'accounts' }],
    })
  })

  it('Envies: wishlist and envelope options together', async () => {
    const result = getEnviesPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(['fetchActiveRows', 'fetchWishlist'])
    expect(src.fetchWishlist).toHaveBeenCalledWith(event, 2026, 10)
    const page = await settle(result, { fetchWishlist: () => [{ id: 'w1' }], fetchActiveRows: () => [{ id: 'e1' }] })
    expect(page).toEqual({ items: [{ id: 'w1' }], envelopes: [{ id: 'e1' }] })
  })

  it('Enveloppes: ledgers and reserves together', async () => {
    const result = getEnveloppesPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(['listBudgetEnvelopeLedgers', 'listReserveEnvelopeBalances'])
    expect(src.listBudgetEnvelopeLedgers).toHaveBeenCalledWith(event, 2026, 10)
    const page = await settle(result, { listBudgetEnvelopeLedgers: () => [{ id: 'l1' }], listReserveEnvelopeBalances: () => [{ id: 'r1' }] })
    expect(page).toEqual({ envelopes: [{ id: 'l1' }], reserves: [{ id: 'r1' }] })
  })

  it('Tableau de bord: dashboard, goals and closure status together', async () => {
    const result = getDashboardPage(event, NOW)
    await Promise.resolve()
    expect(deferred.pending.map((call) => call.name).sort()).toEqual(['fetchDashboard', 'fetchSavingsGoals', 'getClosureStatus'])
    expect(src.fetchDashboard).toHaveBeenCalledWith(event, 2026, 10, NOW)
    expect(src.getClosureStatus).toHaveBeenCalledWith(event, NOW)
    const page = await settle(result, {
      fetchDashboard: () => ({ month: 'x' }),
      fetchSavingsGoals: () => [{ id: 'g1' }],
      getClosureStatus: () => ({ closableMonth: null }),
    })
    expect(page).toEqual({ dashboard: { month: 'x' }, goals: [{ id: 'g1' }], closureStatus: { closableMonth: null } })
  })

  it('fails the whole page when one read fails, never returning part of it', async () => {
    const result = getParametresPage(event, NOW)
    await Promise.resolve()
    deferred.pending.splice(0).forEach((call, index) => call.resolve(index === 2 ? Promise.reject(new Error('boom')) : []))
    await expect(result).rejects.toThrow('boom')
  })
})
```

- [ ] **Step 2: Run it to verify it fails** → FAIL (module missing).

- [ ] **Step 3: Implement the composers**

`server/utils/pageData.ts`:
```ts
import type { H3Event } from 'h3'
import { fetchDashboard } from './dashboardQuery'
import { fetchMovements } from './movementsQuery'
import { fetchWishlist } from './wishlistQuery'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { listReserveEnvelopeBalances } from './reserveEnvelopeQuery'
import { fetchActiveRows, fetchSavingsGoals } from './referenceQuery'
import { getClosureStatus } from './closureService'

// One composer per page endpoint. Each starts every read at once and fails as a whole:
// a client navigation then costs exactly one round trip and one session check, instead of
// a chain of calls each paying its own (see the navigation-perf spec, §2).
//
// The current month uses the server clock, exactly as the endpoints these replace did.

function currentMonth(now: Date) {
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export async function getDashboardPage(event: H3Event, now: Date) {
  const { year, month } = currentMonth(now)
  // fetchDashboard is the only pool-backed read here (reserve balances); the others are
  // Data API, so this never holds more pool slots than /api/dashboard alone did.
  const [dashboard, goals, closureStatus] = await Promise.all([
    fetchDashboard(event, year, month, now),
    fetchSavingsGoals(event),
    getClosureStatus(event, now),
  ])
  return { dashboard, goals, closureStatus }
}

export async function getMouvementsPage(event: H3Event, now: Date) {
  const { year, month } = currentMonth(now)
  const [movements, categories, accounts, envelopes, incomeTypes] = await Promise.all([
    fetchMovements(event, year, month),
    fetchActiveRows(event, 'categories'),
    fetchActiveRows(event, 'accounts'),
    fetchActiveRows(event, 'envelopes'),
    fetchActiveRows(event, 'income_types'),
  ])
  return { movements, reference: { categories, accounts, envelopes, incomeTypes } }
}

export async function getEnveloppesPage(event: H3Event, now: Date) {
  const { year, month } = currentMonth(now)
  const [envelopes, reserves] = await Promise.all([
    listBudgetEnvelopeLedgers(event, year, month),
    listReserveEnvelopeBalances(),
  ])
  return { envelopes, reserves }
}

export async function getEnviesPage(event: H3Event, now: Date) {
  const { year, month } = currentMonth(now)
  const [items, envelopes] = await Promise.all([
    fetchWishlist(event, year, month),
    fetchActiveRows(event, 'envelopes'),
  ])
  return { items, envelopes }
}

export async function getParametresPage(event: H3Event, _now: Date) {
  const [categories, envelopes, incomeTypes, accounts] = await Promise.all([
    fetchActiveRows(event, 'categories'),
    fetchActiveRows(event, 'envelopes'),
    fetchActiveRows(event, 'income_types'),
    fetchActiveRows(event, 'accounts'),
  ])
  return { categories, envelopes, incomeTypes, accounts }
}
```
Check `fetchWishlist`'s real signature in `server/utils/wishlistQuery.ts:38` (`(event, year, month)`) and how `/api/wishlist` calls it; mirror that call exactly.

- [ ] **Step 4: Add the routes**

Each file follows this shape (shown for Mouvements; the other four differ only in the imported composer):
```ts
// server/api/pages/mouvements.get.ts
import { requireUser } from '../../utils/auth'
import { getMouvementsPage } from '../../utils/pageData'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getMouvementsPage(event, new Date())
})
```
`dashboard.get.ts` → `getDashboardPage`, `enveloppes.get.ts` → `getEnveloppesPage`, `envies.get.ts` → `getEnviesPage`, `parametres.get.ts` → `getParametresPage`.

- [ ] **Step 5: Run the tests** → `npx vitest run tests/unit/server/utils/pageData.test.ts` PASS; `npm test` all pass; `npm run build` succeeds.

- [ ] **Step 6: Commit**

```bash
git add server/utils/pageData.ts server/api/pages tests/unit/server/utils/pageData.test.ts
git commit -m "perf: add one endpoint per page that composes its reads in parallel"
```

---

### Task 4: Check the session once per visit

**Files:**
- Create: `app/utils/sessionGate.ts`, `app/plugins/api-unauthorized.client.ts`
- Modify: `app/middleware/auth.global.ts`, `app/components/AppSidebar.vue:16-20`
- Test: `tests/unit/app/sessionGate.test.ts`

**Interfaces:**
- Produces:
  - `SESSION_STATE_KEY = 'session-verified'` (the `useState` key)
  - `needsSessionCheck(input: { isClient: boolean, verified: boolean, toPath: string }): boolean`
  - `isUnauthorizedApiCall(url: string, status: number | undefined): boolean`

- [ ] **Step 1: Write the failing test**

`tests/unit/app/sessionGate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { needsSessionCheck, isUnauthorizedApiCall, SESSION_STATE_KEY } from '../../../app/utils/sessionGate'

describe('needsSessionCheck', () => {
  it('always checks during the server render (the first load)', () => {
    expect(needsSessionCheck({ isClient: false, verified: true, toPath: '/mouvements' })).toBe(true)
  })

  it('skips the check on client navigations once the session was verified', () => {
    expect(needsSessionCheck({ isClient: true, verified: true, toPath: '/mouvements' })).toBe(false)
  })

  it('checks again on the client when nothing was verified yet — e.g. right after logging out', () => {
    expect(needsSessionCheck({ isClient: true, verified: false, toPath: '/mouvements' })).toBe(true)
  })

  it('always checks when going to /login, to bounce a signed-in visitor', () => {
    expect(needsSessionCheck({ isClient: true, verified: true, toPath: '/login' })).toBe(true)
  })

  it('uses a stable state key', () => {
    expect(SESSION_STATE_KEY).toBe('session-verified')
  })
})

describe('isUnauthorizedApiCall', () => {
  it('flags a 401 from an app API route', () => {
    expect(isUnauthorizedApiCall('/api/pages/mouvements', 401)).toBe(true)
    expect(isUnauthorizedApiCall('http://127.0.0.1:3000/api/epargne?x=1', 401)).toBe(true)
  })

  it('ignores the session probe itself, other statuses and non-API URLs', () => {
    expect(isUnauthorizedApiCall('/api/health', 401)).toBe(false)
    expect(isUnauthorizedApiCall('/api/pages/mouvements', 500)).toBe(false)
    expect(isUnauthorizedApiCall('https://x.supabase.co/auth/v1/token', 401)).toBe(false)
    expect(isUnauthorizedApiCall('/api/epargne', undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails** → FAIL (module missing).

- [ ] **Step 3: Implement the pure gate**

`app/utils/sessionGate.ts`:
```ts
// The session used to be re-checked (a Supabase Auth round trip) before every client
// navigation, ahead of any page data. It is now checked on the first load, after a
// logout, and whenever an API call answers 401 — every endpoint still checks the session
// itself, so this only removes a redundant hop, not a safeguard.

export const SESSION_STATE_KEY = 'session-verified'

export function needsSessionCheck(input: { isClient: boolean, verified: boolean, toPath: string }): boolean {
  if (!input.isClient) return true
  if (input.toPath === '/login') return true
  return !input.verified
}

export function isUnauthorizedApiCall(url: string, status: number | undefined): boolean {
  if (status !== 401) return false
  const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0]
  return path.startsWith('/api/') && path !== '/api/health'
}
```

- [ ] **Step 4: Use it in the middleware**

`app/middleware/auth.global.ts` — keep the header comment and add one paragraph about the once-per-visit check; the body becomes:
```ts
export default defineNuxtRouteMiddleware(async (to) => {
  const verified = useState<boolean>(SESSION_STATE_KEY, () => false)

  if (!needsSessionCheck({ isClient: import.meta.client, verified: verified.value, toPath: to.path })) {
    return
  }

  const request = useRequestFetch()

  let isAuthenticated = false
  try {
    await request('/api/health')
    isAuthenticated = true
  }
  catch {
    // Any failure here — 401, or the auth service being unreachable — is treated as "not
    // signed in". Sending someone to the login page is the recoverable outcome.
    isAuthenticated = false
  }

  verified.value = isAuthenticated

  if (to.path === '/login') {
    return isAuthenticated ? navigateTo('/') : undefined
  }

  return isAuthenticated ? undefined : navigateTo('/login')
})
```

- [ ] **Step 5: Reset on logout, and catch 401s**

`app/components/AppSidebar.vue` `handleLogout`:
```ts
async function handleLogout() {
  if (!confirm('Se déconnecter ?')) return
  await supabase.auth.signOut()
  // Without this the next navigation would trust the session verified before logout.
  useState<boolean>(SESSION_STATE_KEY).value = false
  await navigateTo('/login')
}
```
`app/plugins/api-unauthorized.client.ts`:
```ts
// A session can expire while the app is open. Since client navigations no longer re-check
// it (see app/utils/sessionGate.ts), the first API call that answers 401 resets the flag and
// sends the visitor through the auth check again.
export default defineNuxtPlugin(() => {
  const verified = useState<boolean>(SESSION_STATE_KEY, () => false)

  globalThis.$fetch = $fetch.create({
    onResponseError({ request, response }) {
      if (!isUnauthorizedApiCall(String(request), response?.status)) return
      verified.value = false
      return navigateTo(useRoute().fullPath, { replace: true })
    },
  }) as typeof globalThis.$fetch
})
```
(`SESSION_STATE_KEY`, `needsSessionCheck` and `isUnauthorizedApiCall` are auto-imported from `app/utils`.) Re-navigating to the same route runs the middleware, which now checks `/api/health` and sends a signed-out visitor to `/login`.

- [ ] **Step 6: Verify**

Run: `npx vitest run tests/unit/app/sessionGate.test.ts` → PASS; `npm test` → all pass; `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/utils/sessionGate.ts app/plugins/api-unauthorized.client.ts app/middleware/auth.global.ts app/components/AppSidebar.vue tests/unit/app/sessionGate.test.ts
git commit -m "perf: check the session once per visit instead of before every navigation"
```

---

### Task 5: Render at once — skeleton, loading bar, sidebar, Mouvements

**Files:**
- Create: `app/components/PageSkeleton.vue`
- Modify: `app/app.vue`, `app/components/SidebarCeilingsWidget.vue:11`, `app/components/entry/EntryPanel.vue`, `app/pages/mouvements.vue`

**Interfaces:**
- Consumes: `GET /api/pages/mouvements` → `{ movements: Movement[], reference: EntryReferenceData }` (Task 3); key `envelope-ceilings`.
- Produces: `<PageSkeleton />` (no props; renders `role="status"` with the visually hidden text `Chargement…`); `EntryPanel` props `{ referenceData: EntryReferenceData | null, referenceError: boolean }`, emits `saved`.

- [ ] **Step 1: The skeleton and the loading bar**

`app/components/PageSkeleton.vue`:
```vue
<script setup lang="ts">
// Shown while a page's single data call is in flight, so a click renders the new page
// at once instead of freezing on the old one. Shapes echo the app's cards.
</script>

<template>
  <div role="status" aria-live="polite" class="flex flex-col gap-4">
    <span class="sr-only">Chargement…</span>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <div v-for="index in 4" :key="index" class="h-[96px] animate-pulse rounded-[18px] bg-toggle-track" />
    </div>
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <div class="flex flex-col gap-3 rounded-[18px] border border-divider bg-white p-5">
        <div v-for="index in 6" :key="index" class="h-[18px] animate-pulse rounded-[9px] bg-app-bg" />
      </div>
      <div class="h-[220px] animate-pulse rounded-[18px] bg-toggle-track" />
    </div>
  </div>
</template>
```
`app/app.vue`:
```vue
<template>
  <NuxtLoadingIndicator color="var(--color-primary)" :height="3" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

- [ ] **Step 2: Sidebar widget non-blocking**

`SidebarCeilingsWidget.vue:11` → `const { data, error, pending } = useLazyFetch<EnvelopeCeiling[]>('/api/envelopes/ceilings', { key: 'envelope-ceilings' })` (its template already handles `pending`).

- [ ] **Step 3: EntryPanel takes its data from the page**

In `app/components/entry/EntryPanel.vue`:
- Replace the `Promise.all([...useFetch...])` block with:
```ts
const props = defineProps<{
  referenceData: EntryReferenceData | null
  referenceError: boolean
}>()

// The sidebar widget already loads the ceilings under this key on every page; reading the
// same entry avoids a second request on each visit to Mouvements.
const { data: ceilingsData, error: ceilingsError } = useNuxtData<EnvelopeCeiling[]>('envelope-ceilings')
const referenceData = computed(() => props.referenceData)
const referenceError = computed(() => props.referenceError)
```
(`useNuxtData` exposes `data`; if it has no `error` in this Nuxt version, use `const ceilingsError = computed(() => false)` and keep the template branch.)
- `handleSaved()` refreshes the page's single key and the sidebar's:
```ts
function handleSaved() {
  refreshNuxtData(['page-mouvements', 'envelope-ceilings'])
  draftAmount.value = 0
  draftExpenseEnvelopeId.value = ''
  draftIncomeEnvelopeId.value = ''
  draftTransferFromId.value = ''
  draftTransferToId.value = ''
  emit('saved')
}
```
- In the template, the forms render only once the lists are there (Review Focus 4): change `<template v-else>` (the one after the `referenceError` paragraph) to `<template v-else-if="referenceData">`, and add after it:
```vue
    <p v-else class="rounded-[16px] bg-app-bg p-3 text-[11px] font-semibold text-ink-muted" data-testid="entry-loading">
      Chargement du formulaire…
    </p>
```

- [ ] **Step 4: Mouvements on its single endpoint**

In `app/pages/mouvements.vue`:
```ts
interface EntryReferenceData {
  categories: { id: string, name: string, emoji: string, requiresDetailsText?: boolean }[]
  accounts: { id: string, name: string, emoji: string }[]
  envelopes: { id: string, name: string, emoji: string }[]
  incomeTypes: { id: string, name: string, emoji: string, requiresDetailsText?: boolean }[]
}
interface MouvementsPage { movements: Movement[], reference: EntryReferenceData }

const { data: page, error } = useLazyFetch<MouvementsPage>('/api/pages/mouvements', { key: 'page-mouvements' })
const data = computed(() => page.value?.movements ?? null)
```
(`filteredMovements` keeps reading `data.value ?? []`.) In the template:
- the feed's error paragraph stays `v-if="error"`; the list that renders movements gets `v-else-if="page"`; add `<PageSkeleton v-else />` in its place while loading (inside the feed card is fine — keep the page header outside so the title shows immediately);
- `<EntryPanel />` → `<EntryPanel :reference-data="page?.reference ?? null" :reference-error="Boolean(error)" />`.

- [ ] **Step 5: Verify by hand and by build**

Run `npm test` and `npm run build`. Then with `npm run dev` and a signed-in browser (or the Playwright scripts of Task 8 once written), open `/` then click "Mouvements": the title shows at once, the skeleton appears, then the feed. The dev-tools network panel shows **one** request (`/api/pages/mouvements`) and no `/api/health`.

- [ ] **Step 6: Commit**

```bash
git add app/components/PageSkeleton.vue app/app.vue app/components/SidebarCeilingsWidget.vue app/components/entry/EntryPanel.vue app/pages/mouvements.vue
git commit -m "perf: render Mouvements at once and load it in one call"
```

---

### Task 6: Render at once — the other seven pages

**Files:**
- Modify: `app/pages/index.vue`, `app/pages/enveloppes.vue`, `app/pages/envies.vue`, `app/pages/parametres.vue`, `app/pages/epargne.vue`, `app/pages/comptes.vue`, `app/pages/compte-rendu.vue`

**Interfaces:**
- Consumes: `/api/pages/{dashboard,enveloppes,envies,parametres}` (Task 3), the unchanged `/api/epargne`, `/api/accounts/overview`, `/api/closure`; `<PageSkeleton />` (Task 5).

The pattern for every page: replace `await useFetch` with `useLazyFetch` on the page's single key, derive the variables the template already uses with `computed`, keep the error banner as `v-if="error"`, render content under `v-else-if="<data>"`, and add `<PageSkeleton v-else />`. The `PageHeader` stays **outside** those branches so the title renders immediately. Every `refresh()` after a write keeps working (same key); writes that change envelopes also refresh `envelope-ceilings`.

- [ ] **Step 1: Tableau de bord** (`index.vue`)

```ts
interface DashboardPage {
  dashboard: DashboardPayload
  goals: SavingsGoal[]
  closureStatus: { closableMonth: { year: number, month: number, label: string, name: string } | null }
}
const { data: page, error, refresh } = useLazyFetch<DashboardPage>('/api/pages/dashboard', { key: 'page-dashboard' })
const dashboard = computed(() => page.value?.dashboard ?? null)
const goals = computed(() => page.value?.goals ?? [])
const closureStatus = computed(() => page.value?.closureStatus ?? null)
const goalsError = computed(() => null)
```
Remove the three former fetches (`/api/dashboard`, `/api/closure/status`, `/api/savings-goals`). Move `interface SavingsGoal` above its first use. `recordSavings` keeps `await refresh()` and also calls `refreshNuxtData('envelope-ceilings')` — not needed for savings; leave it out. Template: header stays; the main branch already uses `v-if="error"` / `v-else-if="dashboard"`; add `<PageSkeleton v-else />`. Remove any `goalsError` usage from the template if it only guarded the separate goals fetch.

- [ ] **Step 2: Enveloppes** (`enveloppes.vue`)

```ts
const { data: page, error, refresh } = useLazyFetch<{ envelopes: BudgetEnvelopeLedger[], reserves: ReserveEnvelopeBalance[] }>(
  '/api/pages/enveloppes', { key: 'page-enveloppes' },
)
const envelopes = computed(() => page.value?.envelopes ?? null)
const reserves = computed(() => page.value?.reserves ?? null)
const envelopesError = error
const reservesError = error
async function refreshEnvelopes() {
  await Promise.all([refresh(), refreshNuxtData('envelope-ceilings')])
}
```
`onEnvelopeSaved` keeps its re-selection logic, now reading `envelopes.value`. Add `<PageSkeleton v-else />` after the content branch.

- [ ] **Step 3: Envies** (`envies.vue`)

```ts
const { data: page, error, refresh } = useLazyFetch<{ items: WishlistItemView[], envelopes: EnvelopeOption[] }>(
  '/api/pages/envies', { key: 'page-envies' },
)
const items = computed(() => page.value?.items ?? [])
const envelopeOptions = computed(() => page.value?.envelopes ?? [])
```
Move `interface EnvelopeOption` above. Content branch becomes `v-else-if="page"`, then `<PageSkeleton v-else />`.

- [ ] **Step 4: Paramètres** (`parametres.vue`)

```ts
const { data: page, error, refresh } = useLazyFetch<{
  categories: ReferenceItem[], envelopes: ReferenceItem[], incomeTypes: ReferenceItem[], accounts: ReferenceItem[]
}>('/api/pages/parametres', { key: 'page-parametres' })
const categories = computed(() => page.value?.categories ?? [])
const envelopes = computed(() => page.value?.envelopes ?? [])
const incomeTypes = computed(() => page.value?.incomeTypes ?? [])
const accounts = computed(() => page.value?.accounts ?? [])

async function loadAll() {
  // One call instead of four refetches; envelope edits also move the sidebar's ceilings.
  await Promise.all([refresh(), refreshNuxtData('envelope-ceilings')])
}
```
Wrap the page body (after `PageHeader`) in `<p v-if="error" …>` using the same banner classes as `epargne.vue` ("Impossible de charger les paramètres. Réessayez dans un instant."), `<template v-else-if="page">…existing sections…</template>`, `<PageSkeleton v-else />`.

- [ ] **Step 5: Épargne, Comptes, Compte rendu** (already one call)

In each, `await useFetch<…>(url, { key, … })` → `useLazyFetch<…>(url, { key, … })` with the same options, and add `<PageSkeleton v-else />` after the existing `v-else-if` content branch. In `compte-rendu.vue` the watcher on `closure.value?.envelopes` already handles late data (it is `immediate`).

- [ ] **Step 6: Verify**

`npm test`, `npm run build`. Then run the existing functional E2E specs that cover these pages — they must stay green:
`npx playwright test tests/e2e/dashboard.spec.ts tests/e2e/enveloppes.spec.ts tests/e2e/envies.spec.ts tests/e2e/comptes.spec.ts tests/e2e/comptes-edit.spec.ts tests/e2e/epargne.spec.ts tests/e2e/compte-rendu.spec.ts tests/e2e/movements.spec.ts tests/e2e/entry.spec.ts`
If a spec read data synchronously right after `goto` and now races the skeleton, make it wait for the content it asserts (e.g. `await expect(locator).toBeVisible()`), never weaken what it asserts. Report each spec you touched.

- [ ] **Step 7: Commit**

```bash
git add app/pages tests/e2e
git commit -m "perf: render every page at once and load it in a single call"
```

---

### Task 7: Lighter cold start — load pdfkit only for the PDF

**Files:**
- Modify: `server/api/reports/[year]/[month].get.ts`
- Test: `tests/unit/server/api/reportRoute.test.ts` (existing — must stay green)

- [ ] **Step 1: Measure before**

```bash
NITRO_PRESET=vercel npm run build
du -sh .vercel/output/functions/__fallback.func
grep -rl "PDFDocument" .vercel/output/functions/__fallback.func --include=*.mjs | head
npm run build
node --env-file=.env -e "const t=performance.now(); import('./.output/server/chunks/nitro/nitro.mjs').then(()=>console.log('nitro init ms', Math.round(performance.now()-t)))"
```
Record the function size, which chunk files contain `PDFDocument`, and the init time (run the last command 3 times, keep the median). If the paths differ, find the real ones under `.vercel/output/functions/*.func` and `.output/server/chunks` and report them.

- [ ] **Step 2: Import lazily**

In `server/api/reports/[year]/[month].get.ts`, remove the static imports of `../../../utils/pdfFonts` and `../../../utils/reportPdf`, and load them where they are used:
```ts
  let pdf: Buffer
  try {
    // Loaded on demand: pdfkit and fontkit are heavy, and Nitro bundles every route into
    // one function, so a static import made every route pay for them at cold start.
    const [{ loadReportFonts }, { renderReportPdf }] = await Promise.all([
      import('../../../utils/pdfFonts'),
      import('../../../utils/reportPdf'),
    ])
    pdf = await renderReportPdf(snapshot, await loadReportFonts())
  }
```
(keep the existing `catch`, logging and headers unchanged).

- [ ] **Step 3: Verify**

`npx vitest run tests/unit/server/api/reportRoute.test.ts` → PASS (it already exercises 200/400/404/500). `npm test` → all pass.

- [ ] **Step 4: Measure after**

Repeat Step 1's commands. Expected: `PDFDocument` now lives only in a chunk that the entry chunk loads through `import(`, and the init time drops. Report before/after numbers in the commit body. If nothing changes, report it as is — do not claim a gain.

- [ ] **Step 5: Commit**

```bash
git add "server/api/reports/[year]/[month].get.ts"
git commit -m "perf: load pdfkit only when a report PDF is requested"
```
with the measured before/after numbers in the body.

---

### Task 8: Keep it fast — performance E2E, production comparison, handoff

**Files:**
- Create: `tests/e2e/perf.spec.ts`
- Modify: `playwright.config.ts`, `docs/HANDOFF.md`

- [ ] **Step 1: Let the suite target production read-only**

`playwright.config.ts`: compute `const baseURL = process.env.PERF_BASE_URL ?? 'http://localhost:3000'`; use it for `use.baseURL`; set `webServer` only when `PERF_BASE_URL` is unset (`webServer: process.env.PERF_BASE_URL ? undefined : { …existing… }`). Add a comment: production runs are read-only and must be limited to `perf.spec.ts`.

- [ ] **Step 2: Write the performance spec**

`tests/e2e/perf.spec.ts`:
```ts
import { test, expect, type Page } from '@playwright/test'

// Read-only: navigates and reads, never submits. Safe to run against production with
//   PERF_BASE_URL=https://budget-pastel.vercel.app npx playwright test tests/e2e/perf.spec.ts

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL) && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

test.describe.configure({ mode: 'serial' })
test.beforeEach(() => { test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user') })

const PAGES = [
  { path: '/mouvements', call: '/api/pages/mouvements' },
  { path: '/enveloppes', call: '/api/pages/enveloppes' },
  { path: '/epargne', call: '/api/epargne' },
  { path: '/comptes', call: '/api/accounts/overview' },
  { path: '/envies', call: '/api/pages/envies' },
  { path: '/parametres', call: '/api/pages/parametres' },
  { path: '/compte-rendu', call: '/api/closure' },
]
// Production gets the spec's target; a local dev server compiles on demand, so it gets a
// looser bound that still catches a return of the request chain.
const NAV_BUDGET_MS = process.env.PERF_BASE_URL ? 400 : 1000

async function openHome(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__), undefined, { timeout: 20_000 })
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
}

function apiCallsDuring(page: Page) {
  const calls: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    // The sidebar's ceilings are loaded once per visit, not per navigation.
    if (path.startsWith('/api/') && path !== '/api/envelopes/ceilings') calls.push(path)
  })
  return calls
}

test('warm up every page once (dev compiles on first visit; production warms the function)', async ({ page }) => {
  await openHome(page)
  for (const { path } of PAGES) {
    await page.locator(`a[href="${path}"]`).first().click()
    await page.waitForURL(`**${path}`)
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
  }
})

for (const { path, call } of PAGES) {
  test(`navigating to ${path} costs one call, no session re-check, and shows data within budget`, async ({ page }) => {
    await openHome(page)
    const calls = apiCallsDuring(page)

    const started = Date.now()
    await page.locator(`a[href="${path}"]`).first().click()
    await page.waitForURL(`**${path}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
    const elapsed = Date.now() - started

    expect(calls).toEqual([call])
    expect(calls).not.toContain('/api/health')
    expect(elapsed).toBeLessThan(NAV_BUDGET_MS)
  })
}

test('the page renders before its data arrives', async ({ page }) => {
  await openHome(page)
  // Hold the data call for 2 s: the title and skeleton must show well before it returns.
  await page.route('**/api/pages/parametres', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await route.continue()
  })
  const started = Date.now()
  await page.locator('a[href="/parametres"]').first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible()
  await expect(page.getByRole('status')).toBeVisible()
  expect(Date.now() - started).toBeLessThan(1500)
})

test('entry forms stay hidden until their lists arrive', async ({ page }) => {
  await openHome(page)
  await page.route('**/api/pages/mouvements', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await route.continue()
  })
  await page.locator('a[href="/mouvements"]').first().click()
  await expect(page.getByTestId('entry-loading')).toBeVisible()
  await expect(page.getByTestId('entry-loading')).toBeHidden({ timeout: 15_000 })
})

test('a failing page call shows the error banner instead of an endless skeleton', async ({ page }) => {
  await openHome(page)
  await page.route('**/api/pages/envies', (route) => route.fulfill({ status: 500, body: '{}' }))
  await page.locator('a[href="/envies"]').first().click()
  await expect(page.getByText(/Impossible de charger/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('a 401 on a page call re-checks the session', async ({ page }) => {
  await openHome(page)
  const healthChecks: string[] = []
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/health') healthChecks.push(request.url()) })
  await page.route('**/api/pages/parametres', (route) => route.fulfill({ status: 401, body: '{}' }), { times: 1 })
  await page.locator('a[href="/parametres"]').first().click()
  await expect.poll(() => healthChecks.length, { timeout: 10_000 }).toBeGreaterThan(0)
})
```
Adjust the error-banner regex to the real copy on the Envies page if it differs ("Impossible de charger …").

- [ ] **Step 3: Run it locally**

`npx playwright test tests/e2e/perf.spec.ts` → all pass. Then the whole suite `npm run test:e2e` → all pass (list any `zz-e2e-` rows left by `epargne.spec.ts` for manual cleanup, as usual).

- [ ] **Step 4: Production comparison — ask first**

Deploying means pushing `main`. **Ask the human partner** before pushing. After the deployment is live:
`PERF_BASE_URL=https://budget-pastel.vercel.app npx playwright test tests/e2e/perf.spec.ts` and record each page's navigation time. The "before" numbers are in the spec §2 (Mouvements ≈ 420 ms with 3 hops, Paramètres 450–630 ms with 5 hops; cold TTFB 2.8 s).

- [ ] **Step 5: Handoff**

`docs/HANDOFF.md`:
- §2 commands: add the perf spec and the `PERF_BASE_URL` production run.
- §4 hazards: "One call per page" — new pages get an `/api/pages/*` endpoint composed in `server/utils/pageData.ts`, use `useLazyFetch` + `<PageSkeleton />`; never add a top-level `await useFetch`. "Session check once per visit" — `app/utils/sessionGate.ts`, the logout reset, the 401 plugin. Envelope ledgers are now Data API (`listBudgetEnvelopeLedgers(event, …)`).
- A short **Vercel settings** checklist for the household: enable Fluid compute (*Settings → Functions*); compare the Supabase project region (*Supabase → Project Settings → General*) with `vercel.json`'s `fra1`, and align if different; only then consider a keep-warm ping (spec §6.3).
- The before/after table from Step 4.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/perf.spec.ts playwright.config.ts docs/HANDOFF.md
git commit -m "test: keep navigation fast with performance E2E, and record the before/after"
```

---

## Notes for the executor

- **`listBudgetEnvelopeLedgers` gains an `event` first parameter** (Task 1). Every caller must pass it; TypeScript will not catch a missing one in tests that mock the module.
- **Page endpoints keep response shapes identical** to what each page reads today; the template changes are about *where* data comes from, not its shape.
- **Do not add a top-level `await useFetch`** to any page — that is what this plan removes.
- **E2E runs against the live database.** `perf.spec.ts` is read-only by design; keep it that way.
- **Pushing `main` deploys production.** Task 8 Step 4 needs the human partner's go.
