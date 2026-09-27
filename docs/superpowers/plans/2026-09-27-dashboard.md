# Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 19-line `app/pages/index.vue` stub with the real dashboard: income partition donut, four KPI cards, envelope grid, recent movements, savings and reserves.

**Architecture:** All arithmetic lives in one pure, unit-tested domain module. A single query module composes the payload from three new Supabase Data API reads plus three existing pool-backed helpers, and one endpoint serves it. A minimal savings endpoint fills the one slice of the donut the product cannot currently write.

**Tech Stack:** Nuxt 4, Vue 3.5 `<script setup>`, `@supabase/ssr` (Data API reads), Drizzle (existing helpers only), Zod (validation), Vitest (unit), Playwright (E2E). No chart library — the donut is hand-rolled SVG.

**Spec:** `docs/superpowers/specs/2026-09-27-dashboard-design.md`

## Global Constraints

- The donut is a partition of income: every expense lands in exactly one of `fixed`, `envelope`, `variable`, and the five slices plus `unspent` sum to income received. Verified against the Figma: `861 + 424 + 318 + 345 + 368 = 2 316`.
- Partition precedence, in order: `financedBy === 'gift_received'` is **excluded entirely**; then `envelopeId !== null` → `envelope`; then `categoryIsFixed` → `fixed`; else `variable`.
- `received` (the donut base) excludes income carrying a `targetEnvelopeId` — that is a reimbursement, not new money.
- Salary is **derived**: an income entry counts as salary when `expectedAmount !== null`. Never match on an income type name, never add an `is_salary` column.
- 50/30/20 actuals are percentages **of income received, savings included**. This supersedes parent spec §7. Targets are the constants 50 / 30 / 20.
- **Zero income must never produce `NaN` or a division by zero.** Every percentage is 0, and the page shows a prompt instead of the chart.
- `daysRemainingInMonth` counts today as remaining and never returns less than 1.
- New server reads go through the Supabase Data API (`createSupabaseServerClient`) with `AbortSignal.timeout(10000)`; a failed request throws naming the table and never degrades to partial data. Existing pool-backed helpers (`listBudgetEnvelopeLedgers`, `listReserveEnvelopeBalances`, `fetchMovements`) are reused unchanged except for the one additive field in Task 1.
- `numeric` columns arrive from PostgREST as strings — wrap every one in `Number()`.
- Pages use `useFetch` with an **explicit `key`** and render a visible error branch distinct from an empty state.
- All money renders through `formatEuro` / `formatEuroShort` from `app/utils/currency.ts` (auto-imported). No new formatter.
- Use project design tokens only (`--color-*` in `app/assets/css/main.css`: `primary`, `primary-ink`, `ink`, `ink-muted`, `ink-faint`, `divider`, `app-bg`, `toggle-track`, `mint-bar`, `warn-bar`, `warn-bg`, `warn-ink`, `accent-bar`, `violet-bar`, `azure-bar`, `mint`). No stock Tailwind colours.
- Out of scope, and no UI may hint at it: month navigation arrows, `Clôturer le mois`, `/epargne`, `/compte-rendu`, editing or deleting savings entries.

---

## File Structure

**Created:**
- `server/utils/domain/dashboard.ts` — all dashboard arithmetic, pure
- `server/utils/savingsQuery.ts` — savings read/write helpers
- `server/utils/dashboardQuery.ts` — composes the payload
- `shared/schemas/savings.ts` — Zod schemas
- `server/api/savings/index.get.ts`, `server/api/savings/index.post.ts`
- `server/api/dashboard.get.ts`
- Tests mirroring each of the above

**Modified:**
- `server/utils/envelopeCeilingsQuery.ts` — expose `incomeCreditsTotal` (additive)
- `tests/unit/server/utils/envelopeCeilingsQuery.test.ts` — assert the new field
- `app/pages/index.vue` — replace the stub

---

### Task 1: Expose `incomeCreditsTotal` on the envelope ledger

**Files:**
- Modify: `server/utils/envelopeCeilingsQuery.ts:7-16` (interface) and `:74-85` (return)
- Test: `tests/unit/server/utils/envelopeCeilingsQuery.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BudgetEnvelopeLedger` gains `incomeCreditsTotal: number`.

The dashboard's envelope cards show `82 € sur 130 € · +20 € reçus`. The credits figure is already computed at `envelopeCeilingsQuery.ts:57` but is not returned. This is purely additive — `/enveloppes` and `/comptes` must keep working untouched.

- [ ] **Step 1: Write the failing test**

Append a new case inside the existing `describe('listBudgetEnvelopeLedgers', ...)` block in `tests/unit/server/utils/envelopeCeilingsQuery.test.ts`:

```ts
  it('reports income credited to the envelope so the dashboard can show "+X € reçus"', async () => {
    mocks.rowsByTable.envelopes = [
      { id: 'e9', name: 'Restaurants', emoji: '🍽️', showOnHome: true, defaultCeiling: '130.00' },
    ]
    mocks.rowsByTable.expenseEntries = [
      { envelopeId: 'e9', amount: '102.00' },
    ]
    mocks.rowsByTable.incomeEntries = [
      { targetEnvelopeId: 'e9', amount: '20.00' },
    ]

    const result = await listBudgetEnvelopeLedgers(2026, 9)

    // netSpent is expenses minus credits: 102 - 20 = 82, leaving 130 - 82 = 48.
    // incomeCreditsTotal is the 20 itself, which netSpent alone cannot recover.
    expect(result[0]).toMatchObject({
      ceiling: 130,
      netSpent: 82,
      remaining: 48,
      incomeCreditsTotal: 20,
    })
  })
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/server/utils/envelopeCeilingsQuery.test.ts`
Expected: FAIL — the returned object has no `incomeCreditsTotal`, so `toMatchObject` reports it as undefined.

- [ ] **Step 3: Add the field to the interface**

In `server/utils/envelopeCeilingsQuery.ts`, add one line to `BudgetEnvelopeLedger`:

```ts
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
}
```

- [ ] **Step 4: Return it**

In the same file, add `incomeCreditsTotal` to the returned object — the local variable already exists at line 57:

```ts
    return {
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      showOnHome: envelope.showOnHome,
      ...ledger,
      incomeCreditsTotal,
      subtitle: deriveEnvelopeSubtitle({
        carriedOverAmount,
        netTransfer: transfersInTotal - transfersOutTotal,
        incomeCreditsTotal,
      }),
    }
```

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: PASS. The existing `envelopeCeilingsQuery`, `/enveloppes` and `/comptes` tests must be unaffected — the change is additive.

- [ ] **Step 6: Commit**

```bash
git add server/utils/envelopeCeilingsQuery.ts tests/unit/server/utils/envelopeCeilingsQuery.test.ts
git commit -m "feat: expose envelope income credits for the dashboard"
```

---

### Task 2: Dashboard domain logic

**Files:**
- Create: `server/utils/domain/dashboard.ts`
- Test: `tests/unit/server/utils/domain/dashboard.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `partitionExpenses(expenses: PartitionExpense[]): { fixed: number, envelope: number, variable: number }`
  - `summariseIncome(incomes: PartitionIncome[]): { received: number, salaryReceived: number, salaryExpected: number, salaryVariance: number }`
  - `computeMonthSummary(input): { unspent: number, perDay: number, allocatedPercent: number, slices: DashboardSlice[] }`
  - `compute503020(input): { targets, actuals, untagged }`
  - `daysRemainingInMonth(today: Date): number`
  - types `PartitionExpense`, `PartitionIncome`, `Bucket5030`, `DashboardSlice`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/utils/domain/dashboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  partitionExpenses,
  summariseIncome,
  computeMonthSummary,
  compute503020,
  daysRemainingInMonth,
} from '../../../../../server/utils/domain/dashboard'

describe('partitionExpenses', () => {
  it('sends an expense with an envelope to the envelope bucket even when its category is fixed', () => {
    // The envelope is the more specific intent, so it wins over is_fixed.
    const result = partitionExpenses([
      { amount: 50, envelopeId: 'e1', categoryIsFixed: true, financedBy: 'budget' },
    ])
    expect(result).toEqual({ fixed: 0, envelope: 50, variable: 0 })
  })

  it('sends a fixed-category expense with no envelope to the fixed bucket', () => {
    const result = partitionExpenses([
      { amount: 620, envelopeId: null, categoryIsFixed: true, financedBy: 'budget' },
    ])
    expect(result).toEqual({ fixed: 620, envelope: 0, variable: 0 })
  })

  it('sends everything else to the variable bucket', () => {
    const result = partitionExpenses([
      { amount: 30, envelopeId: null, categoryIsFixed: false, financedBy: 'budget' },
    ])
    expect(result).toEqual({ fixed: 0, envelope: 0, variable: 30 })
  })

  it('excludes gift-financed expenses from every bucket', () => {
    // Gift-funded spend sits outside the month's budget and outside 50/30/20.
    // Counting it anywhere would make the slices exceed income.
    const result = partitionExpenses([
      { amount: 62, envelopeId: 'e1', categoryIsFixed: false, financedBy: 'gift_received' },
      { amount: 40, envelopeId: null, categoryIsFixed: true, financedBy: 'gift_received' },
      { amount: 10, envelopeId: null, categoryIsFixed: false, financedBy: 'budget' },
    ])
    expect(result).toEqual({ fixed: 0, envelope: 0, variable: 10 })
  })

  it('still counts gift_given expenses, which are the user\'s own money', () => {
    const result = partitionExpenses([
      { amount: 25, envelopeId: null, categoryIsFixed: false, financedBy: 'gift_given' },
    ])
    expect(result).toEqual({ fixed: 0, envelope: 0, variable: 25 })
  })

  it('returns zeroes for an empty month', () => {
    expect(partitionExpenses([])).toEqual({ fixed: 0, envelope: 0, variable: 0 })
  })
})

describe('summariseIncome', () => {
  it('excludes envelope-targeted income from the base', () => {
    // A reimbursement replaces money already spent; counting it would inflate the
    // donut base and shrink every percentage.
    const result = summariseIncome([
      { amount: 2316, expectedAmount: 2300, targetEnvelopeId: null },
      { amount: 20, expectedAmount: null, targetEnvelopeId: 'e1' },
    ])
    expect(result.received).toBe(2316)
  })

  it('identifies salary by the presence of an expected amount and reports the variance', () => {
    const result = summariseIncome([
      { amount: 2316, expectedAmount: 2300, targetEnvelopeId: null },
      { amount: 150, expectedAmount: null, targetEnvelopeId: null },
    ])
    expect(result.salaryReceived).toBe(2316)
    expect(result.salaryExpected).toBe(2300)
    expect(result.salaryVariance).toBe(16)
    // The 150 € of non-salary income still counts towards the base.
    expect(result.received).toBe(2466)
  })

  it('reports a negative variance when salary underpays', () => {
    const result = summariseIncome([
      { amount: 2250, expectedAmount: 2300, targetEnvelopeId: null },
    ])
    expect(result.salaryVariance).toBe(-50)
  })

  it('returns zeroes when no income exists', () => {
    expect(summariseIncome([])).toEqual({
      received: 0, salaryReceived: 0, salaryExpected: 0, salaryVariance: 0,
    })
  })
})

describe('computeMonthSummary', () => {
  it('reproduces the figures from the design', () => {
    // Figma: 2 316 income; 861 fixes, 424 enveloppes, 318 variables, 345 épargne;
    // 368 non dépensé; 84 % du revenu affecté.
    const result = computeMonthSummary({
      incomeReceived: 2316,
      fixed: 861,
      envelope: 424,
      variable: 318,
      savings: 345,
      daysRemaining: 11,
    })
    expect(result.unspent).toBe(368)
    expect(result.allocatedPercent).toBe(84)
    expect(Math.round(result.perDay)).toBe(33)
    expect(result.slices.map((s) => [s.key, s.amount, s.percent])).toEqual([
      ['fixed', 861, 37],
      ['envelope', 424, 18],
      ['variable', 318, 14],
      ['savings', 345, 15],
      ['unspent', 368, 16],
    ])
  })

  it('reports a negative unspent when spending exceeds income', () => {
    const result = computeMonthSummary({
      incomeReceived: 1000, fixed: 900, envelope: 200, variable: 0, savings: 0, daysRemaining: 5,
    })
    expect(result.unspent).toBe(-100)
    expect(result.perDay).toBe(-20)
  })

  it('produces zeroes rather than NaN when no income is recorded', () => {
    // Percentages are amount/income; with income 0 this must not divide by zero.
    const result = computeMonthSummary({
      incomeReceived: 0, fixed: 100, envelope: 0, variable: 0, savings: 0, daysRemaining: 10,
    })
    expect(result.allocatedPercent).toBe(0)
    for (const slice of result.slices) {
      expect(Number.isNaN(slice.percent)).toBe(false)
      expect(slice.percent).toBe(0)
    }
  })

  it('does not divide by zero when no days remain', () => {
    const result = computeMonthSummary({
      incomeReceived: 100, fixed: 0, envelope: 0, variable: 0, savings: 0, daysRemaining: 0,
    })
    expect(Number.isFinite(result.perDay)).toBe(true)
  })
})

describe('compute503020', () => {
  it('reproduces the design\'s actuals as percentages of income', () => {
    // Figma: 51 / 18 / 15 against targets 50 / 30 / 20.
    const result = compute503020({
      incomeReceived: 2316,
      taggedSpend: [
        { bucket: 'besoins', amount: 861 },
        { bucket: 'besoins', amount: 318 },
        { bucket: 'envies', amount: 424 },
      ],
      savings: 345,
    })
    expect(result.targets).toEqual({ besoins: 50, envies: 30, epargne: 20 })
    expect(result.actuals).toEqual({ besoins: 51, envies: 18, epargne: 15 })
  })

  it('reports untagged spend separately and keeps it out of the actuals', () => {
    const result = compute503020({
      incomeReceived: 1000,
      taggedSpend: [
        { bucket: 'besoins', amount: 500 },
        { bucket: null, amount: 200 },
      ],
      savings: 0,
    })
    expect(result.actuals.besoins).toBe(50)
    expect(result.untagged).toBe(200)
  })

  it('counts savings towards the epargne bucket', () => {
    const result = compute503020({ incomeReceived: 1000, taggedSpend: [], savings: 200 })
    expect(result.actuals.epargne).toBe(20)
  })

  it('produces zero actuals rather than NaN when no income is recorded', () => {
    const result = compute503020({
      incomeReceived: 0,
      taggedSpend: [{ bucket: 'besoins', amount: 50 }],
      savings: 10,
    })
    expect(result.actuals).toEqual({ besoins: 0, envies: 0, epargne: 0 })
  })
})

describe('daysRemainingInMonth', () => {
  it('counts today as remaining, so the last day of the month returns 1', () => {
    expect(daysRemainingInMonth(new Date(2026, 8, 30))).toBe(1)  // 30 September
  })

  it('matches the design: 11 days remain on 20 September', () => {
    expect(daysRemainingInMonth(new Date(2026, 8, 20))).toBe(11)
  })

  it('handles a 31-day month', () => {
    expect(daysRemainingInMonth(new Date(2026, 0, 1))).toBe(31)  // 1 January
  })

  it('handles February in a leap year', () => {
    expect(daysRemainingInMonth(new Date(2024, 1, 1))).toBe(29)
  })

  it('never returns less than 1', () => {
    expect(daysRemainingInMonth(new Date(2026, 1, 28))).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/server/utils/domain/dashboard.test.ts`
Expected: FAIL — cannot resolve `../../../../../server/utils/domain/dashboard`.

- [ ] **Step 3: Write the implementation**

Create `server/utils/domain/dashboard.ts`:

```ts
export type Bucket5030 = 'besoins' | 'envies' | 'epargne'
export type SliceKey = 'fixed' | 'envelope' | 'variable' | 'savings' | 'unspent'

export interface DashboardSlice {
  key: SliceKey
  amount: number
  percent: number
}

export interface PartitionExpense {
  amount: number
  envelopeId: string | null
  categoryIsFixed: boolean
  financedBy: 'budget' | 'gift_given' | 'gift_received'
}

/**
 * Splits the month's expenses into the three spending slices of the donut.
 *
 * The slices must partition income exactly, so every expense lands in one bucket and
 * no expense lands in two.
 */
export function partitionExpenses(expenses: PartitionExpense[]): {
  fixed: number
  envelope: number
  variable: number
} {
  const totals = { fixed: 0, envelope: 0, variable: 0 }

  for (const expense of expenses) {
    // Gift-funded spend is somebody else's money: it sits outside the month's budget
    // and outside 50/30/20. Counting it would push the slices past income received.
    if (expense.financedBy === 'gift_received') continue

    // The envelope is the more specific intent, so it outranks the category's flag.
    if (expense.envelopeId !== null) totals.envelope += expense.amount
    else if (expense.categoryIsFixed) totals.fixed += expense.amount
    else totals.variable += expense.amount
  }

  return totals
}

export interface PartitionIncome {
  amount: number
  expectedAmount: number | null
  targetEnvelopeId: string | null
}

export function summariseIncome(incomes: PartitionIncome[]): {
  received: number
  salaryReceived: number
  salaryExpected: number
  salaryVariance: number
} {
  let received = 0
  let salaryReceived = 0
  let salaryExpected = 0

  for (const income of incomes) {
    // Income aimed at an envelope is a reimbursement for money already spent, not new
    // money. Including it would inflate the donut base and shrink every percentage.
    if (income.targetEnvelopeId === null) received += income.amount

    // Salary is whatever was forecast: an expected amount is what makes a variance
    // meaningful. This avoids matching on a renameable income-type name and avoids a
    // new column that nothing in the product could set.
    if (income.expectedAmount !== null) {
      salaryReceived += income.amount
      salaryExpected += income.expectedAmount
    }
  }

  return { received, salaryReceived, salaryExpected, salaryVariance: salaryReceived - salaryExpected }
}

/** Percentage of `total`, rounded, and 0 rather than NaN when `total` is 0. */
function share(amount: number, total: number): number {
  return total > 0 ? Math.round((amount / total) * 100) : 0
}

export function computeMonthSummary(input: {
  incomeReceived: number
  fixed: number
  envelope: number
  variable: number
  savings: number
  daysRemaining: number
}): {
  unspent: number
  perDay: number
  allocatedPercent: number
  slices: DashboardSlice[]
} {
  const { incomeReceived, fixed, envelope, variable, savings, daysRemaining } = input

  // May be negative, and is shown as such — overspending is information, not an error.
  const unspent = incomeReceived - fixed - envelope - variable - savings

  const slices: DashboardSlice[] = [
    { key: 'fixed', amount: fixed, percent: share(fixed, incomeReceived) },
    { key: 'envelope', amount: envelope, percent: share(envelope, incomeReceived) },
    { key: 'variable', amount: variable, percent: share(variable, incomeReceived) },
    { key: 'savings', amount: savings, percent: share(savings, incomeReceived) },
    { key: 'unspent', amount: unspent, percent: share(unspent, incomeReceived) },
  ]

  return {
    unspent,
    // Callers floor daysRemaining at 1, so this guard is defensive only.
    perDay: daysRemaining > 0 ? unspent / daysRemaining : unspent,
    allocatedPercent: incomeReceived > 0 ? 100 - share(unspent, incomeReceived) : 0,
    slices,
  }
}

export function compute503020(input: {
  incomeReceived: number
  taggedSpend: { bucket: Bucket5030 | null, amount: number }[]
  savings: number
}): {
  targets: { besoins: 50, envies: 30, epargne: 20 }
  actuals: { besoins: number, envies: number, epargne: number }
  untagged: number
} {
  const amounts = { besoins: 0, envies: 0, epargne: input.savings }
  let untagged = 0

  for (const entry of input.taggedSpend) {
    // Spend with no bucket tag is reported on its own rather than silently folded into
    // one of the three, which is why the actuals need not sum to 100.
    if (entry.bucket === null) untagged += entry.amount
    else amounts[entry.bucket] += entry.amount
  }

  return {
    targets: { besoins: 50, envies: 30, epargne: 20 },
    actuals: {
      besoins: share(amounts.besoins, input.incomeReceived),
      envies: share(amounts.envies, input.incomeReceived),
      epargne: share(amounts.epargne, input.incomeReceived),
    },
    untagged,
  }
}

/** Days left in the month, counting today. Never less than 1. */
export function daysRemainingInMonth(today: Date): number {
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return Math.max(1, daysInMonth - today.getDate() + 1)
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/server/utils/domain/dashboard.test.ts`
Expected: PASS, 23 tests.

- [ ] **Step 5: Commit**

```bash
git add server/utils/domain/dashboard.ts tests/unit/server/utils/domain/dashboard.test.ts
git commit -m "feat: add dashboard partition, summary and 50/30/20 logic"
```

---

### Task 3: Savings endpoints

**Files:**
- Create: `shared/schemas/savings.ts`, `server/utils/savingsQuery.ts`
- Create: `server/api/savings/index.get.ts`, `server/api/savings/index.post.ts`
- Test: `tests/unit/server/utils/savingsQuery.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient` from `server/utils/supabase`.
- Produces: `fetchSavings(event, year, month): Promise<SavingsEntryView[]>`, the `SavingsEntryView` interface, `savingsInputSchema`.

`savings_entries` has **no unique index**, so nothing in the database prevents two rows for the same goal and month. The POST enforces one figure per goal per month itself, and the GET sums per goal so a duplicate cannot corrupt the displayed total.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/utils/savingsQuery.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  let response: { data: any[] | null, error: any } = { data: [], error: null }
  const calls = { select: '', eq: [] as [string, unknown][], abortSignals: [] as AbortSignal[] }

  const makeClient = () => ({
    from: () => {
      const builder: any = {
        select: (columns: string) => { calls.select = columns; return builder },
        eq: (column: string, value: unknown) => { calls.eq.push([column, value]); return builder },
        abortSignal: (signal: AbortSignal) => { calls.abortSignals.push(signal); return builder },
        then: (ok: any, err: any) => Promise.resolve(response).then(ok, err),
      }
      return builder
    },
  })

  return { makeClient, calls, setResponse: (r: typeof response) => { response = r } }
})

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => mocks.makeClient(),
}))

import { fetchSavings } from '../../../../server/utils/savingsQuery'

function fakeEvent() {
  return { context: {} } as any
}

describe('fetchSavings', () => {
  beforeEach(() => {
    mocks.setResponse({ data: [], error: null })
    mocks.calls.select = ''
    mocks.calls.eq = []
    mocks.calls.abortSignals = []
  })

  it('returns one entry per goal with the goal name resolved', async () => {
    mocks.setResponse({
      data: [
        { savings_goal_id: 'g1', amount: '216.00', savings_goals: { name: 'Long terme' } },
        { savings_goal_id: 'g2', amount: '80.00', savings_goals: { name: 'Sécurité' } },
      ],
      error: null,
    })

    const result = await fetchSavings(fakeEvent(), 2026, 9)

    expect(result).toEqual([
      { goalId: 'g1', goalName: 'Long terme', amount: 216 },
      { goalId: 'g2', goalName: 'Sécurité', amount: 80 },
    ])
  })

  it('sums duplicate rows for the same goal instead of showing one of them', async () => {
    // savings_entries has no unique index, so two rows for one goal and month are
    // possible. Taking the first would understate the total.
    mocks.setResponse({
      data: [
        { savings_goal_id: 'g1', amount: '100.00', savings_goals: { name: 'Long terme' } },
        { savings_goal_id: 'g1', amount: '116.00', savings_goals: { name: 'Long terme' } },
      ],
      error: null,
    })

    const result = await fetchSavings(fakeEvent(), 2026, 9)

    expect(result).toEqual([{ goalId: 'g1', goalName: 'Long terme', amount: 216 }])
  })

  it('scopes the lookup to the requested year and month', async () => {
    await fetchSavings(fakeEvent(), 2026, 9)
    expect(mocks.calls.eq).toEqual([['year', 2026], ['month', 9]])
  })

  it('bounds the request with an abort signal', async () => {
    await fetchSavings(fakeEvent(), 2026, 9)
    expect(mocks.calls.abortSignals).toHaveLength(1)
  })

  it('throws rather than returning an empty list when the request fails', async () => {
    mocks.setResponse({ data: null, error: { message: 'permission denied for table savings_entries' } })
    await expect(fetchSavings(fakeEvent(), 2026, 9)).rejects.toThrow(/savings_entries/)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/server/utils/savingsQuery.test.ts`
Expected: FAIL — cannot resolve `../../../../server/utils/savingsQuery`.

- [ ] **Step 3: Write the query module**

Create `server/utils/savingsQuery.ts`:

```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'

const SAVINGS_SELECT = 'savings_goal_id,amount,savings_goals(name)'
const REQUEST_TIMEOUT_MS = 10000

export interface SavingsEntryView {
  goalId: string
  goalName: string
  amount: number
}

interface EmbeddedGoal { name: string }

function unwrap(embed: EmbeddedGoal | EmbeddedGoal[] | null | undefined): EmbeddedGoal | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

export async function fetchSavings(event: H3Event, year: number, month: number): Promise<SavingsEntryView[]> {
  const supabase = createSupabaseServerClient(event)

  const result = await supabase
    .from('savings_entries')
    .select(SAVINGS_SELECT)
    .eq('year', year)
    .eq('month', month)
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))

  if (result.error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load savings',
      message: `savings: savings_entries request failed: ${result.error.message}`,
    })
  }

  // savings_entries has no unique index on (savings_goal_id, year, month), so two rows
  // for one goal are possible. Summing keeps the displayed total correct either way.
  const byGoal = new Map<string, SavingsEntryView>()
  for (const row of result.data ?? []) {
    const goalId = (row as any).savings_goal_id
    const existing = byGoal.get(goalId)
    const amount = Number((row as any).amount)
    if (existing) existing.amount += amount
    else byGoal.set(goalId, { goalId, goalName: unwrap((row as any).savings_goals)?.name ?? '', amount })
  }

  return [...byGoal.values()]
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/server/utils/savingsQuery.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the validation schema**

Create `shared/schemas/savings.ts`:

```ts
import { z } from 'zod'

export const savingsInputSchema = z.object({
  savingsGoalId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  amount: z.coerce.number().min(0),
})

export type SavingsInput = z.infer<typeof savingsInputSchema>
```

- [ ] **Step 6: Add the two endpoints**

Create `server/api/savings/index.get.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { fetchSavings } from '../../utils/savingsQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const query = getQuery(event)
  const now = new Date()
  const year = Number(query.year ?? now.getFullYear())
  const month = Number(query.month ?? now.getMonth() + 1)
  return fetchSavings(event, year, month)
})
```

Create `server/api/savings/index.post.ts`. This replaces an existing figure for the goal
and month rather than adding a second row:

```ts
import { and, eq } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { db } from '../../utils/db'
import { savingsEntries } from '../../../drizzle/schema'
import { savingsInputSchema } from '../../../shared/schemas/savings'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, savingsInputSchema)

  // savings_entries has no unique index, so uniqueness is enforced here: look for the
  // goal's existing figure for this month and update it, inserting only when absent.
  // This is a read-then-write, which is acceptable for a single-writer household app.
  const [existing] = await db
    .select()
    .from(savingsEntries)
    .where(and(
      eq(savingsEntries.savingsGoalId, input.savingsGoalId),
      eq(savingsEntries.year, input.year),
      eq(savingsEntries.month, input.month),
    ))

  if (existing) {
    const [row] = await db
      .update(savingsEntries)
      .set({ amount: String(input.amount) })
      .where(eq(savingsEntries.id, existing.id))
      .returning()
    return row
  }

  const [row] = await db
    .insert(savingsEntries)
    .values({
      savingsGoalId: input.savingsGoalId,
      year: input.year,
      month: input.month,
      amount: String(input.amount),
    })
    .returning()
  return row
})
```

- [ ] **Step 7: Run the whole suite and build**

Run: `npx vitest run && npm run build`
Expected: all tests pass; build completes.

- [ ] **Step 8: Commit**

```bash
git add shared/schemas/savings.ts server/utils/savingsQuery.ts server/api/savings/ tests/unit/server/utils/savingsQuery.test.ts
git commit -m "feat: add savings read and write endpoints"
```

---

### Task 4: Dashboard query module and endpoint

**Files:**
- Create: `server/utils/dashboardQuery.ts`, `server/api/dashboard.get.ts`
- Test: `tests/unit/server/utils/dashboardQuery.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3, plus `listBudgetEnvelopeLedgers(year, month)`, `listReserveEnvelopeBalances()` from `server/utils/reserveEnvelopeQuery`, and `fetchMovements(event, year, month)` from `server/utils/movementsQuery`.
- Produces: `fetchDashboard(event, year, month, today): Promise<DashboardPayload>` and the `DashboardPayload` interface.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/utils/dashboardQuery.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const responseByTable: Record<string, { data: any[] | null, error: any }> = {
    expense_entries: { data: [], error: null },
    income_entries: { data: [], error: null },
  }
  const eqCalls: Record<string, [string, unknown][]> = {}

  const makeClient = () => ({
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          (eqCalls[table] ??= []).push([column, value])
          return builder
        },
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve(responseByTable[table]).then(ok, err),
      }
      return builder
    },
  })

  return { responseByTable, eqCalls, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => mocks.makeClient(),
}))

const ledgerMock = vi.hoisted(() => vi.fn())
const reserveMock = vi.hoisted(() => vi.fn())
const movementsMock = vi.hoisted(() => vi.fn())
const savingsMock = vi.hoisted(() => vi.fn())

vi.mock('../../../../server/utils/envelopeCeilingsQuery', () => ({ listBudgetEnvelopeLedgers: ledgerMock }))
vi.mock('../../../../server/utils/reserveEnvelopeQuery', () => ({ listReserveEnvelopeBalances: reserveMock }))
vi.mock('../../../../server/utils/movementsQuery', () => ({ fetchMovements: movementsMock }))
vi.mock('../../../../server/utils/savingsQuery', () => ({ fetchSavings: savingsMock }))

import { fetchDashboard } from '../../../../server/utils/dashboardQuery'

function fakeEvent() {
  return { context: {} } as any
}

describe('fetchDashboard', () => {
  beforeEach(() => {
    mocks.responseByTable.expense_entries = { data: [], error: null }
    mocks.responseByTable.income_entries = { data: [], error: null }
    for (const key of Object.keys(mocks.eqCalls)) delete mocks.eqCalls[key]
    ledgerMock.mockReset().mockResolvedValue([])
    reserveMock.mockReset().mockResolvedValue([])
    movementsMock.mockReset().mockResolvedValue([])
    savingsMock.mockReset().mockResolvedValue([])
  })

  it('composes the month summary from the partitioned expenses and income', async () => {
    mocks.responseByTable.income_entries = {
      data: [{ amount: '2316.00', expected_amount: '2300.00', target_envelope_id: null }],
      error: null,
    }
    mocks.responseByTable.expense_entries = {
      data: [
        { amount: '861.00', envelope_id: null, financed_by: 'budget', categories: { is_fixed: true, fifty_thirty_twenty_bucket: 'besoins' }, envelopes: null },
        { amount: '424.00', envelope_id: 'e1', financed_by: 'budget', categories: { is_fixed: false, fifty_thirty_twenty_bucket: 'besoins' }, envelopes: { fifty_thirty_twenty_bucket: 'envies' } },
        { amount: '318.00', envelope_id: null, financed_by: 'budget', categories: { is_fixed: false, fifty_thirty_twenty_bucket: 'besoins' }, envelopes: null },
      ],
      error: null,
    }
    savingsMock.mockResolvedValue([{ goalId: 'g1', goalName: 'Long terme', amount: 345 }])

    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))

    expect(payload.income.received).toBe(2316)
    expect(payload.income.salaryVariance).toBe(16)
    expect(payload.savings.total).toBe(345)
    expect(payload.summary.unspent).toBe(368)
    expect(payload.summary.allocatedPercent).toBe(84)
    expect(payload.month.daysRemaining).toBe(11)
  })

  it('takes an envelope\'s bucket over its category\'s for 50/30/20', async () => {
    // The envelope is the more specific tag; using the category would score this as
    // besoins instead of envies.
    mocks.responseByTable.income_entries = {
      data: [{ amount: '1000.00', expected_amount: null, target_envelope_id: null }],
      error: null,
    }
    mocks.responseByTable.expense_entries = {
      data: [
        { amount: '300.00', envelope_id: 'e1', financed_by: 'budget', categories: { is_fixed: false, fifty_thirty_twenty_bucket: 'besoins' }, envelopes: { fifty_thirty_twenty_bucket: 'envies' } },
      ],
      error: null,
    }

    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))

    expect(payload.ruleOfThumb.actuals.envies).toBe(30)
    expect(payload.ruleOfThumb.actuals.besoins).toBe(0)
  })

  it('summarises the envelope totals and counts overspends', async () => {
    ledgerMock.mockResolvedValue([
      { id: 'e1', name: 'Restaurants', emoji: '🍽️', showOnHome: true, ceiling: 130, netSpent: 82, remaining: 48, subtitle: null, incomeCreditsTotal: 20 },
      { id: 'e2', name: 'Mode', emoji: '👗', showOnHome: true, ceiling: 40, netSpent: 71, remaining: -31, subtitle: null, incomeCreditsTotal: 0 },
    ])

    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))

    expect(payload.envelopes.totalCeiling).toBe(170)
    expect(payload.envelopes.totalNetSpent).toBe(153)
    expect(payload.envelopes.totalRemaining).toBe(17)
    expect(payload.envelopes.overspentCount).toBe(1)
    expect(payload.envelopes.cards[0].incomeCreditsTotal).toBe(20)
  })

  it('keeps only the five most recent movements', async () => {
    movementsMock.mockResolvedValue(Array.from({ length: 9 }, (_, i) => ({ id: `m${i}` })))
    const payload = await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))
    expect(payload.recentMovements).toHaveLength(5)
    expect(payload.recentMovements[0].id).toBe('m0')
  })

  it('scopes both new reads to the requested month', async () => {
    await fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))
    expect(mocks.eqCalls.expense_entries).toEqual([['year_assigned', 2026], ['month_assigned', 9]])
    expect(mocks.eqCalls.income_entries).toEqual([['year_assigned', 2026], ['month_assigned', 9]])
  })

  it('throws rather than returning a partial payload when a request fails', async () => {
    mocks.responseByTable.expense_entries = { data: null, error: { message: 'permission denied for table expense_entries' } }
    await expect(fetchDashboard(fakeEvent(), 2026, 9, new Date(2026, 8, 20))).rejects.toThrow(/expense_entries/)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/server/utils/dashboardQuery.test.ts`
Expected: FAIL — cannot resolve `../../../../server/utils/dashboardQuery`.

- [ ] **Step 3: Write the query module**

Create `server/utils/dashboardQuery.ts`:

```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { listReserveEnvelopeBalances } from './reserveEnvelopeQuery'
import { fetchMovements } from './movementsQuery'
import { fetchSavings } from './savingsQuery'
import {
  partitionExpenses,
  summariseIncome,
  computeMonthSummary,
  compute503020,
  daysRemainingInMonth,
} from './domain/dashboard'
import type { Bucket5030, DashboardSlice } from './domain/dashboard'
import type { Movement } from './domain/movementsFeed'

const EXPENSE_SELECT
  = 'amount,envelope_id,financed_by,'
  + 'categories(is_fixed,fifty_thirty_twenty_bucket),'
  + 'envelopes(fifty_thirty_twenty_bucket)'

const INCOME_SELECT = 'amount,expected_amount,target_envelope_id'

const REQUEST_TIMEOUT_MS = 10000
const RECENT_MOVEMENT_COUNT = 5

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export interface DashboardPayload {
  month: { year: number, month: number, label: string, daysRemaining: number }
  income: { received: number, salaryReceived: number, salaryExpected: number, salaryVariance: number }
  savings: { total: number, byGoal: { goalId: string, goalName: string, amount: number }[] }
  envelopes: {
    totalCeiling: number
    totalNetSpent: number
    totalRemaining: number
    overspentCount: number
    cards: { id: string, name: string, emoji: string, ceiling: number, netSpent: number, remaining: number, incomeCreditsTotal: number }[]
  }
  reserves: { id: string, name: string, emoji: string, balance: number, incomeCreditsTotal: number, expensesTotal: number }[]
  summary: { unspent: number, perDay: number, allocatedPercent: number, slices: DashboardSlice[] }
  ruleOfThumb: {
    targets: { besoins: number, envies: number, epargne: number }
    actuals: { besoins: number, envies: number, epargne: number }
    untagged: number
  }
  recentMovements: Movement[]
}

function unwrap<T>(embed: T | T[] | null | undefined): T | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load dashboard',
    message: `dashboard: ${table} request failed: ${error.message}`,
  })
}

export async function fetchDashboard(
  event: H3Event,
  year: number,
  month: number,
  today: Date,
): Promise<DashboardPayload> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  const [expenseRes, incomeRes, ledgers, reserves, movements, savingsEntries] = await Promise.all([
    supabase.from('expense_entries').select(EXPENSE_SELECT)
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
    supabase.from('income_entries').select(INCOME_SELECT)
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
    listBudgetEnvelopeLedgers(year, month),
    listReserveEnvelopeBalances(),
    fetchMovements(event, year, month),
    fetchSavings(event, year, month),
  ])

  assertOk('expense_entries', expenseRes.error)
  assertOk('income_entries', incomeRes.error)

  const expenseRows = (expenseRes.data ?? []) as any[]

  const partition = partitionExpenses(expenseRows.map((row) => ({
    amount: Number(row.amount),
    envelopeId: row.envelope_id ?? null,
    categoryIsFixed: Boolean(unwrap<any>(row.categories)?.is_fixed),
    financedBy: row.financed_by,
  })))

  const income = summariseIncome((incomeRes.data ?? []).map((row: any) => ({
    amount: Number(row.amount),
    expectedAmount: row.expected_amount === null ? null : Number(row.expected_amount),
    targetEnvelopeId: row.target_envelope_id ?? null,
  })))

  const savingsTotal = savingsEntries.reduce((sum, entry) => sum + entry.amount, 0)

  const summary = computeMonthSummary({
    incomeReceived: income.received,
    fixed: partition.fixed,
    envelope: partition.envelope,
    variable: partition.variable,
    savings: savingsTotal,
    daysRemaining: daysRemainingInMonth(today),
  })

  // The envelope's own bucket wins over its category's: it is the more specific tag.
  // gift_received spend is dropped here too, matching partitionExpenses.
  const taggedSpend = expenseRows
    .filter((row) => row.financed_by !== 'gift_received')
    .map((row) => ({
      bucket: (unwrap<any>(row.envelopes)?.fifty_thirty_twenty_bucket
        ?? unwrap<any>(row.categories)?.fifty_thirty_twenty_bucket
        ?? null) as Bucket5030 | null,
      amount: Number(row.amount),
    }))

  const ruleOfThumb = compute503020({
    incomeReceived: income.received,
    taggedSpend,
    savings: savingsTotal,
  })

  return {
    month: {
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      daysRemaining: daysRemainingInMonth(today),
    },
    income,
    savings: { total: savingsTotal, byGoal: savingsEntries },
    envelopes: {
      totalCeiling: ledgers.reduce((sum, l) => sum + l.ceiling, 0),
      totalNetSpent: ledgers.reduce((sum, l) => sum + l.netSpent, 0),
      totalRemaining: ledgers.reduce((sum, l) => sum + l.remaining, 0),
      overspentCount: ledgers.filter((l) => l.remaining < 0).length,
      cards: ledgers.map((l) => ({
        id: l.id,
        name: l.name,
        emoji: l.emoji,
        ceiling: l.ceiling,
        netSpent: l.netSpent,
        remaining: l.remaining,
        incomeCreditsTotal: l.incomeCreditsTotal,
      })),
    },
    reserves,
    summary,
    ruleOfThumb,
    recentMovements: movements.slice(0, RECENT_MOVEMENT_COUNT),
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/server/utils/dashboardQuery.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the endpoint**

Create `server/api/dashboard.get.ts`:

```ts
import { requireUser } from '../utils/auth'
import { fetchDashboard } from '../utils/dashboardQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return fetchDashboard(event, now.getFullYear(), now.getMonth() + 1, now)
})
```

- [ ] **Step 6: Run the whole suite and build**

Run: `npx vitest run && npm run build`
Expected: all tests pass; build completes.

- [ ] **Step 7: Commit**

```bash
git add server/utils/dashboardQuery.ts server/api/dashboard.get.ts tests/unit/server/utils/dashboardQuery.test.ts
git commit -m "feat: add the dashboard endpoint"
```

---

### Task 5: The dashboard page

**Files:**
- Modify: `app/pages/index.vue` (replace the whole file)
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `GET /api/dashboard` returning `DashboardPayload`; `GET /api/savings`; `POST /api/savings`; `PageHeader` (`title` prop, `context` and `actions` slots); `formatEuro`/`formatEuroShort` (auto-imported).
- Produces: the dashboard at `/`.

- [ ] **Step 1: Write the failing E2E test**

Create `tests/e2e/dashboard.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const email = process.env.SEED_USER_EMAIL
const password = process.env.SEED_USER_PASSWORD
const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(async ({ page }) => {
  test.skip(!email || !password || !hasRealSupabaseConfig, 'Requires a real Supabase project and seed user')
  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')
})

test('renders the four KPI cards and survives a reload', async ({ page }) => {
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Épargne versée')).toBeVisible()
  await expect(page.getByText('Reste à dépenser')).toBeVisible()

  // The reload is the regression guard: it is where pool exhaustion used to surface.
  await page.reload()
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })
})

test('serves a coherent dashboard payload to a signed-in session', async ({ page }) => {
  const response = await page.request.get('/api/dashboard')
  expect(response.status()).toBe(200)

  const payload = await response.json()
  const { summary, income, savings, envelopes } = payload

  // The donut must partition income exactly: the five slices sum back to what came in.
  const sliceTotal = summary.slices.reduce((sum: number, s: any) => sum + s.amount, 0)
  expect(sliceTotal).toBeCloseTo(income.received, 2)

  expect(savings.total).toBeCloseTo(
    savings.byGoal.reduce((sum: number, g: any) => sum + g.amount, 0), 2)
  expect(envelopes.overspentCount).toBeLessThanOrEqual(envelopes.cards.length)

  // No percentage may be NaN, whatever the data.
  for (const slice of summary.slices) expect(Number.isNaN(slice.percent)).toBe(false)
})

test('does not reach the dashboard endpoint without a session', async ({ browser }) => {
  const fresh = await browser.newContext()
  const response = await fresh.request.get('http://localhost:3000/api/dashboard')
  expect(response.status()).toBe(401)
  await fresh.close()
})

test('shows no month navigation or closure action', async ({ page }) => {
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })
  // Both are explicitly out of scope; a visible dead control reads as broken.
  await expect(page.getByText('Clôturer le mois')).toHaveCount(0)
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `lsof -ti:3000 | xargs kill -9 2>/dev/null; set -a && . ./.env && set +a && npx playwright test tests/e2e/dashboard.spec.ts --reporter=line`
Expected: FAIL — the stub page renders "Connecté 🎉" and none of the KPI labels exist.

- [ ] **Step 3: Add the savings-goals endpoint the form needs**

The form's goal selector needs the list of goals, and no endpoint serves it yet. Create
`server/api/savings-goals/index.get.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { savingsGoals } from '../../../drizzle/schema'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  // savings_goals has no archivedAt column, so every row is live.
  return db.select().from(savingsGoals).orderBy(asc(savingsGoals.sortOrder))
})
```

- [ ] **Step 4: Write the page**

Replace `app/pages/index.vue` entirely:

```vue
<script setup lang="ts">
type SliceKey = 'fixed' | 'envelope' | 'variable' | 'savings' | 'unspent'

interface DashboardPayload {
  month: { year: number, month: number, label: string, daysRemaining: number }
  income: { received: number, salaryReceived: number, salaryExpected: number, salaryVariance: number }
  savings: { total: number, byGoal: { goalId: string, goalName: string, amount: number }[] }
  envelopes: {
    totalCeiling: number
    totalNetSpent: number
    totalRemaining: number
    overspentCount: number
    cards: { id: string, name: string, emoji: string, ceiling: number, netSpent: number, remaining: number, incomeCreditsTotal: number }[]
  }
  reserves: { id: string, name: string, emoji: string, balance: number, incomeCreditsTotal: number, expensesTotal: number }[]
  summary: { unspent: number, perDay: number, allocatedPercent: number, slices: { key: SliceKey, amount: number, percent: number }[] }
  ruleOfThumb: {
    targets: { besoins: number, envies: number, epargne: number }
    actuals: { besoins: number, envies: number, epargne: number }
    untagged: number
  }
  recentMovements: { id: string, type: string, date: string, label: string, envelopeLabel: string, origin: string, amount: number, sign: string }[]
}

const { data: dashboard, error, refresh } = await useFetch<DashboardPayload>('/api/dashboard', {
  key: 'dashboard',
})

interface SavingsGoal { id: string, name: string }
const { data: goals } = await useFetch<SavingsGoal[]>('/api/savings-goals', {
  key: 'savings-goals-for-dashboard',
  default: () => [],
})

// With no income recorded, every percentage is meaningless and the donut would be a
// flat ring. The page shows a prompt instead — the same lesson as /comptes, where a
// permanently negative figure was worse than showing nothing.
const hasIncome = computed(() => (dashboard.value?.income.received ?? 0) > 0)

const SLICE_LABEL: Record<SliceKey, string> = {
  fixed: 'Charges fixes',
  envelope: 'Enveloppes',
  variable: 'Variables',
  savings: 'Épargne',
  unspent: 'Non dépensé',
}

const SLICE_COLOR: Record<SliceKey, string> = {
  fixed: 'var(--color-violet-bar)',
  envelope: 'var(--color-warn-bar)',
  variable: 'var(--color-azure-bar)',
  savings: 'var(--color-mint-bar)',
  unspent: 'var(--color-toggle-track)',
}

// Hand-rolled donut: one <circle> per slice, each drawn as a dash of its own length and
// pushed round the ring by the slices before it. Five slices do not justify a chart
// dependency.
const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const donutSegments = computed(() => {
  const slices = dashboard.value?.summary.slices ?? []
  let offset = 0
  return slices.map((slice) => {
    const length = (Math.max(0, slice.percent) / 100) * CIRCUMFERENCE
    const segment = {
      key: slice.key,
      color: SLICE_COLOR[slice.key],
      dash: `${length} ${CIRCUMFERENCE - length}`,
      offset: -offset,
    }
    offset += length
    return segment
  })
})

function percentOfCeiling(spent: number, ceiling: number) {
  return ceiling > 0 ? Math.min(100, Math.max(0, Math.round((spent / ceiling) * 100))) : 0
}

function signedAmount(movement: { amount: number, sign: string }) {
  const formatted = formatEuro(Math.abs(movement.amount))
  if (movement.sign === 'negative') return `-${formatted}`
  if (movement.sign === 'positive') return `+${formatted}`
  return formatted
}

function shortDate(isoDate: string) {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}

// --- savings entry -------------------------------------------------------------
const savingsGoalId = ref('')
const savingsAmount = ref('')
const savingsError = ref('')
const isSavingSavings = ref(false)

async function recordSavings() {
  savingsError.value = ''
  isSavingSavings.value = true
  try {
    await $fetch('/api/savings', {
      method: 'POST',
      body: {
        savingsGoalId: savingsGoalId.value,
        year: dashboard.value!.month.year,
        month: dashboard.value!.month.month,
        // Accept a French decimal comma, as app/pages/envies.vue does.
        amount: savingsAmount.value.trim().replace(',', '.'),
      },
    })
    savingsAmount.value = ''
    await refresh()
  }
  catch {
    savingsError.value = "Impossible d'enregistrer ce montant."
  }
  finally {
    isSavingSavings.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader :title="dashboard?.month.label ?? 'Tableau de bord'">
      <template #context>
        <span v-if="dashboard" class="text-[12.5px] font-semibold text-ink-muted">
          {{ dashboard.month.daysRemaining }} jours restants
        </span>
      </template>
      <template #actions>
        <NuxtLink to="/mouvements" class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink">
          + Nouvelle saisie
        </NuxtLink>
      </template>
    </PageHeader>

    <p v-if="error" class="rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink">
      Impossible de charger le tableau de bord. Réessayez dans un instant.
    </p>

    <div v-else-if="dashboard" class="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div class="rounded-[18px] border border-divider bg-white p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Salaire reçu</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(dashboard.income.salaryReceived) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">
              <span v-if="dashboard.income.salaryExpected > 0">
                {{ dashboard.income.salaryVariance >= 0 ? '+' : '' }}{{ formatEuroShort(dashboard.income.salaryVariance) }} vs prévu
              </span>
              <span v-else>aucun salaire prévu</span>
            </p>
          </div>
          <div class="rounded-[18px] border border-divider bg-white p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Épargne versée</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(dashboard.savings.total) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">ce mois</p>
          </div>
          <div class="rounded-[18px] border border-divider bg-white p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Enveloppes</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(dashboard.envelopes.totalNetSpent) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">sur {{ formatEuroShort(dashboard.envelopes.totalCeiling) }} de plafonds</p>
          </div>
          <div class="rounded-[18px] border border-divider bg-app-bg p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Reste à dépenser</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(dashboard.summary.unspent) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">soit {{ formatEuroShort(dashboard.summary.perDay) }} / jour</p>
          </div>
        </div>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between">
            <h2 class="text-[13.5px] font-extrabold text-ink">Utilisation du revenu</h2>
            <span v-if="hasIncome" class="text-[11.5px] font-semibold text-ink-faint">
              {{ formatEuroShort(dashboard.income.received) }} reçus
            </span>
          </header>

          <p v-if="!hasIncome" class="pt-4 text-[12.5px] text-ink-faint">
            Aucun revenu enregistré ce mois-ci. Ajoutez une entrée pour voir la répartition.
            <NuxtLink to="/mouvements" class="font-bold text-ink underline">Saisir un revenu</NuxtLink>
          </p>

          <div v-else class="flex flex-col items-center gap-6 pt-4 sm:flex-row sm:items-center">
            <div class="relative shrink-0">
              <svg width="140" height="140" viewBox="0 0 140 140" class="-rotate-90">
                <circle cx="70" cy="70" :r="RADIUS" fill="none" stroke="var(--color-toggle-track)" stroke-width="18" />
                <circle
                  v-for="segment in donutSegments"
                  :key="segment.key"
                  cx="70" cy="70" :r="RADIUS" fill="none"
                  :stroke="segment.color"
                  stroke-width="18"
                  :stroke-dasharray="segment.dash"
                  :stroke-dashoffset="segment.offset"
                />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-xl font-extrabold text-ink">{{ dashboard.summary.allocatedPercent }} %</span>
                <span class="text-[10px] font-semibold text-ink-faint">du revenu affecté</span>
              </div>
            </div>

            <div class="grid w-full grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <div v-for="slice in dashboard.summary.slices" :key="slice.key" class="flex items-center justify-between text-[12.5px]">
                <span class="flex items-center gap-2 font-semibold text-ink">
                  <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: SLICE_COLOR[slice.key] }" />
                  {{ SLICE_LABEL[slice.key] }}
                </span>
                <span class="font-semibold text-ink-faint">
                  {{ formatEuroShort(slice.amount) }} · {{ slice.percent }} %
                </span>
              </div>
              <div class="col-span-full flex items-center justify-between border-t border-divider pt-2 text-[12.5px]">
                <span class="font-semibold text-ink-faint">50 / 30 / 20</span>
                <span class="font-bold text-ink">
                  {{ dashboard.ruleOfThumb.actuals.besoins }} / {{ dashboard.ruleOfThumb.actuals.envies }} / {{ dashboard.ruleOfThumb.actuals.epargne }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between">
            <h2 class="text-[13.5px] font-extrabold text-ink">Enveloppes du mois</h2>
            <span class="text-[11.5px] font-semibold text-ink-faint">
              {{ formatEuroShort(dashboard.envelopes.totalRemaining) }} encore disponibles · {{ dashboard.envelopes.overspentCount }} dépassements
            </span>
          </header>

          <p v-if="!dashboard.envelopes.cards.length" class="pt-3 text-[12.5px] text-ink-faint">
            Aucune enveloppe de budget ce mois-ci.
          </p>

          <div v-else class="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <article
              v-for="card in dashboard.envelopes.cards"
              :key="card.id"
              class="rounded-[14px] border p-4"
              :class="card.remaining < 0 ? 'border-warn-bg bg-warn-bg' : 'border-divider bg-white'"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-[12.5px] font-bold text-ink">{{ card.emoji }} {{ card.name }}</span>
                <span class="text-[12.5px] font-bold" :class="card.remaining < 0 ? 'text-warn-ink' : 'text-ink'">
                  {{ formatEuroShort(card.remaining) }}
                </span>
              </div>
              <div class="mt-2 h-[6px] w-full rounded-full bg-toggle-track">
                <div
                  class="h-full rounded-full"
                  :class="card.remaining < 0 ? 'bg-warn-bar' : 'bg-mint-bar'"
                  :style="{ width: `${percentOfCeiling(card.netSpent, card.ceiling)}%` }"
                />
              </div>
              <p class="mt-1.5 text-[11px] font-semibold text-ink-faint">
                {{ formatEuroShort(card.netSpent) }} sur {{ formatEuroShort(card.ceiling) }}
                <span v-if="card.incomeCreditsTotal > 0">· +{{ formatEuroShort(card.incomeCreditsTotal) }} reçus</span>
              </p>
            </article>
          </div>
        </section>
      </div>

      <div class="flex flex-col gap-4">
        <section class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between">
            <h2 class="text-[13.5px] font-extrabold text-ink">Derniers mouvements</h2>
            <NuxtLink to="/mouvements" class="text-[11.5px] font-bold text-ink-muted">Tout voir</NuxtLink>
          </header>
          <p v-if="!dashboard.recentMovements.length" class="pt-3 text-[12.5px] text-ink-faint">
            Aucun mouvement ce mois-ci.
          </p>
          <ul v-else class="flex flex-col pt-2">
            <li v-for="movement in dashboard.recentMovements" :key="movement.id" class="flex items-center justify-between gap-2 border-b border-divider py-2.5 last:border-0">
              <span class="min-w-0">
                <span class="block truncate text-[12.5px] font-bold text-ink">{{ movement.label }}</span>
                <span class="block truncate text-[11px] text-ink-faint">{{ shortDate(movement.date) }} · {{ movement.envelopeLabel }}</span>
              </span>
              <span class="shrink-0 text-[12.5px] font-bold text-ink">{{ signedAmount(movement) }}</span>
            </li>
          </ul>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Épargne</h2>
          <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(dashboard.savings.total) }}
            <span class="text-[11.5px] font-semibold text-ink-faint">versés ce mois</span>
          </p>

          <ul v-if="dashboard.savings.byGoal.length" class="flex flex-col pt-3">
            <li v-for="goal in dashboard.savings.byGoal" :key="goal.goalId" class="flex items-center justify-between py-1.5 text-[12.5px]">
              <span class="font-semibold text-ink">{{ goal.goalName }}</span>
              <span class="font-bold text-ink">{{ formatEuro(goal.amount) }}</span>
            </li>
          </ul>

          <form class="mt-3 flex flex-wrap items-end gap-2 border-t border-divider pt-3" @submit.prevent="recordSavings">
            <label class="flex flex-1 flex-col gap-1 text-[11px] font-semibold text-ink-faint">
              Objectif
              <select v-model="savingsGoalId" required class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink">
                <option value="">Choisir…</option>
                <option v-for="goal in goals" :key="goal.id" :value="goal.id">{{ goal.name }}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
              Montant
              <input v-model="savingsAmount" required inputmode="decimal" class="w-24 rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink">
            </label>
            <button type="submit" :disabled="isSavingSavings" class="rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-ink disabled:opacity-50">
              {{ isSavingSavings ? 'Ajout…' : 'Enregistrer' }}
            </button>
            <p v-if="savingsError" class="w-full text-[11.5px] font-semibold text-warn-ink">{{ savingsError }}</p>
          </form>
        </section>

        <section v-for="reserve in dashboard.reserves" :key="reserve.id" class="rounded-[18px] border border-divider bg-app-bg p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">{{ reserve.emoji }} {{ reserve.name }}</h2>
          <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(reserve.balance) }}
            <span class="text-[11.5px] font-semibold text-ink-faint">disponibles</span>
          </p>
          <p class="pt-1 text-[11.5px] text-ink-faint">
            {{ formatEuroShort(reserve.incomeCreditsTotal) }} reçus, {{ formatEuroShort(reserve.expensesTotal) }} dépensés.
            Hors budget du mois et hors règle 50/30/20 : le solde est reporté.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Run the E2E test and watch it pass**

Run: `lsof -ti:3000 | xargs kill -9 2>/dev/null; set -a && . ./.env && set +a && npx playwright test tests/e2e/dashboard.spec.ts --reporter=line`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npm run build && (lsof -ti:3000 | xargs kill -9 2>/dev/null; set -a && . ./.env && set +a && npx playwright test --reporter=line)`
Expected: unit tests pass, build completes, the full E2E suite passes.

- [ ] **Step 7: Commit**

```bash
git add app/pages/index.vue server/api/savings-goals/ tests/e2e/dashboard.spec.ts
git commit -m "feat: build the dashboard"
```

---

## Notes for the executor

- **The donut must partition income exactly.** Task 5's E2E asserts the five slice amounts sum back to `income.received`. If that fails, the bug is in `partitionExpenses` or `summariseIncome`, not in the page.
- **Zero income is the default state right now.** `income_entries` is empty, so on first run the page renders the "Aucun revenu enregistré" prompt rather than the donut. That is correct, not a failure. To see the chart, record an income entry through `/mouvements` first.
- **`savings_entries` starts empty too**, so the Épargne card shows `0 €` until the form is used. The E2E does not depend on any savings existing.
- **`/epargne` and `/compte-rendu` still 404** and will keep logging Vue Router warnings. They are later milestones, not a defect introduced here.
- **`numeric` columns arrive as strings from PostgREST** (`amount`, `expected_amount`, `default_target`) but as numbers from the pool-backed helpers, which already convert. Keep every `Number()` wrapper in the Data API mapping and do not add redundant ones to the ledger values.
- **Do not reuse the `envelope-ceilings` fetch key** on this page. It is already shared by `enveloppes.vue`, `SidebarCeilingsWidget.vue` and `EntryPanel.vue` with two different TypeScript shapes; adding a third consumer would make that worse. The dashboard has its own `dashboard` key.
