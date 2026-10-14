# User feedback, part A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix "Salaire reçu", let movements be edited and deleted, make the category optional when an expense comes out of an envelope, and turn savings into dated, additive versements entered from the entry panel.

**Architecture:** One Drizzle migration adds the salary flag and expected amount on `income_types`, makes `expense_entries.category_id` nullable behind a CHECK, and dates `savings_entries`. The salary fix copies the type's expected amount into `income_entries.expected_amount`, which every reader already uses. Edit/delete is eight thin Nitro handlers over a shared helper that enforces the closed-month lock on both the current and the destination month. The movements feed carries each row's form fields and an `editable` flag, so the Mouvements drawer can reopen the same entry forms prefilled.

**Tech Stack:** Nuxt 4 / Nitro, Vue 3.5, @nuxt/ui 3 (`USlideover` via `DetailDrawer`), Drizzle ORM 0.36 + drizzle-kit 0.28, Supabase (Data API for reads, postgres.js pool for writes), Zod 3, Vitest 2, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-retours-utilisateurs-a-design.md`

## Global Constraints

- **Never run `drizzle-kit push`.** Generate with `npm run db:generate`; it would otherwise disable RLS on all tables (`docs/HANDOFF.md` §4).
- Every write endpoint calls `assertMonthOpen` (directly or through `movementWrite.ts`) before writing; a closed month is frozen.
- Every pool-backed call is wrapped in `withDbTimeout` — the pool-wait queue has no timeout of its own.
- Server reads for pages go through the Supabase Data API (`createSupabaseServerClient`), never the pool.
- User-facing errors use `userError(status, asciiStatusMessage, frenchMessage)` so the French sentence reaches the client.
- All UI copy is French. Exact strings: "C'est un salaire", "Montant prévu", "Épargne", "Enregistrer les modifications", "Supprimer", "Supprimer définitivement ?", "Oui", "Annuler", "Mois clôturé — non modifiable", "Choisissez une catégorie ou une enveloppe.", "Versement de clôture — non modifiable.", "Ce mouvement n'existe plus."
- No browser `confirm()`/`alert()` dialogs.
- **Deviation from spec §3, on purpose:** the CHECK constraint is declared with Drizzle's `check()` (supported since drizzle-orm 0.36 / drizzle-kit 0.28, both installed) instead of being appended by hand to the SQL. Same constraint name, same SQL; it now lives in the schema file and survives the next `db:generate`.
- **Naming deviation from spec §4.5:** the feed's discriminator keeps its existing name `type` (not `kind`), now with a fourth value `'savings'`; renaming it would touch every consumer for no gain.
- Applying the migration to the live Supabase database (`npm run db:migrate`) is an outward, hard-to-reverse action: **ask the user before running it** (Task 10).

## Review Focus

1. **Unchecking "C'est un salaire"** — the type's entries in open months must lose their `expected_amount` (variance disappears), not keep a stale one. → test in Task 2.
2. **No month has ever been closed** — the back-fill must update every entry of the type, not none. → test in Task 2.
3. **A stale drawer deletes or edits a movement that is already gone** (double click, second tab) — a 404 with "Ce mouvement n'existe plus.", shown in the drawer, no crash. → test in Task 5.
4. **Old savings rows with a NULL date** — they still appear in the feed, dated the 1st of their month, and can be edited (the form gets a valid date). → test in Task 6.
5. **An income edited to a salary type (or away from one)** — its expected amount follows the new type. → test in Task 5.

---

## File Structure

**Create**
- `server/utils/salaryExpectation.ts` — read a type's salary expectation; back-fill open months.
- `server/utils/movementValues.ts` — build the DB row from a validated input, shared by POST and PATCH.
- `server/utils/movementWrite.ts` — `requireId`, `loadRowOr404`, `assertMovable`, `deleteRow` for edit/delete handlers.
- `server/api/expenses/[id].patch.ts`, `server/api/expenses/[id].delete.ts`
- `server/api/incomes/[id].patch.ts`, `server/api/incomes/[id].delete.ts`
- `server/api/transfers/[id].patch.ts`, `server/api/transfers/[id].delete.ts`
- `server/api/savings/[id].patch.ts`, `server/api/savings/[id].delete.ts`
- `shared/types/movement.ts` — the `Movement` type shared by server and pages.
- `app/components/entry/SavingsForm.vue` — the Épargne tab.
- `app/components/MovementEditor.vue` — drawer body: prefilled form, delete with inline confirmation, read-only state.
- `app/utils/expenseForm.ts` — `expenseNeedsCategory` (pure, unit-tested).
- Tests: `tests/unit/server/utils/salaryExpectation.test.ts`, `tests/unit/server/api/incomeSalary.test.ts`, `tests/unit/server/api/movementWrite.test.ts`, `tests/unit/app/expenseForm.test.ts`, `tests/e2e/movement-edit.spec.ts`.

**Modify**
- `drizzle/schema/reference.ts`, `drizzle/schema/transactions.ts`, `drizzle/schema/savings.ts`; new generated `drizzle/migrations/0007_*.sql` + snapshot.
- `server/utils/domain/closure.ts` (add `isMonthOpen`), `server/utils/monthLock.ts` (add `fetchLatestClosedMonth`).
- `shared/schemas/incomeType.ts`, `shared/schemas/expenseEntry.ts`, `shared/schemas/savings.ts`.
- `server/api/incomes/index.post.ts`, `server/api/income-types/[id].patch.ts`, `server/api/expenses/index.post.ts`, `server/api/savings/index.post.ts`.
- `server/utils/closureQuery.ts`, `server/utils/domain/accountsOverview.ts`, `server/utils/domain/movementsFeed.ts`, `server/utils/movementsQuery.ts`, `server/utils/pageData.ts`.
- `app/composables/useAmountInput.ts`, `app/components/entry/ExpenseForm.vue`, `IncomeForm.vue`, `TransferForm.vue`, `EntryPanel.vue`.
- `app/pages/mouvements.vue`, `app/pages/parametres.vue`, `app/pages/index.vue`.
- Existing tests: `tests/unit/drizzle-schema.test.ts`, `monthLock.test.ts`, `entryLock.test.ts`, `savingsPost.test.ts`, `expenseEntry.test.ts`, `movementsFeed.test.ts`, `movementsQuery.test.ts`, `closureQuery.test.ts`, `pageData.test.ts`, `useAmountInput.test.ts`.

Commands: run one test file with `npx vitest run <path>`; all unit tests with `npm test`; build with `npm run build`.

---

### Task 1: Schema and migration

**Files:**
- Modify: `drizzle/schema/reference.ts` (`incomeTypes`), `drizzle/schema/transactions.ts` (`expenseEntries`), `drizzle/schema/savings.ts` (`savingsEntries`)
- Create: `drizzle/migrations/0007_<generated>.sql`, `drizzle/migrations/meta/0007_snapshot.json` (generated)
- Test: `tests/unit/drizzle-schema.test.ts`

**Interfaces:**
- Produces: `incomeTypes.isSalary` (boolean, not null, default false), `incomeTypes.expectedAmount` (numeric, nullable), `expenseEntries.categoryId` (nullable), CHECK `expense_entries_category_or_envelope`, `savingsEntries.date` (date, nullable).

- [ ] **Step 1: Write the failing test** — append to `tests/unit/drizzle-schema.test.ts`:

```ts
import { getTableConfig } from 'drizzle-orm/pg-core'
import { incomeTypes, expenseEntries } from '../../drizzle/schema'

describe('user feedback A schema', () => {
  it('flags salary income types and carries their expected amount', () => {
    expect(incomeTypes.isSalary.notNull).toBe(true)
    expect(incomeTypes.isSalary.hasDefault).toBe(true)
    expect(incomeTypes.expectedAmount.notNull).toBe(false)
  })

  it('lets an expense have no category', () => {
    expect(expenseEntries.categoryId.notNull).toBe(false)
  })

  it('still requires a category or an envelope on every expense', () => {
    const { checks } = getTableConfig(expenseEntries)
    expect(checks.map((check) => check.name)).toContain('expense_entries_category_or_envelope')
  })

  it('dates each savings versement, leaving closure rows undated', () => {
    expect(savingsEntries.date).toBeDefined()
    expect(savingsEntries.date.notNull).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/drizzle-schema.test.ts`
Expected: FAIL — `isSalary` undefined.

- [ ] **Step 3: Implement**

`drizzle/schema/reference.ts`, in `incomeTypes` after `defaultTargetEnvelopeId`:

```ts
  // A salary type carries the amount expected each month. POST /api/incomes copies it onto
  // the entry, which is what makes "Salaire reçu" and its variance non-zero.
  isSalary: boolean('is_salary').notNull().default(false),
  expectedAmount: numeric('expected_amount', { precision: 10, scale: 2 }),
```

`drizzle/schema/transactions.ts`: change the import to
`import { pgTable, uuid, text, numeric, date, timestamp, integer, index, uniqueIndex, check } from 'drizzle-orm/pg-core'`, add `import { sql } from 'drizzle-orm'`, change the column to
`categoryId: uuid('category_id').references(() => categories.id),` and the table callback to:

```ts
}, (table) => ({
  yearMonthIdx: index('expense_entries_year_month_idx').on(table.yearAssigned, table.monthAssigned),
  // An expense coming out of an envelope needs no category; one with neither would be
  // invisible to every breakdown.
  categoryOrEnvelope: check('expense_entries_category_or_envelope', sql`${table.categoryId} IS NOT NULL OR ${table.envelopeId} IS NOT NULL`),
}))
```

`drizzle/schema/savings.ts`, in `savingsEntries` after `amount`:

```ts
  // Set on every manual versement; NULL on closure versements (close_month does not write
  // it) and on rows from before versements were dated.
  date: date('date'),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/drizzle-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Generate the migration and inspect it**

Run: `npm run db:generate`
Open the new `drizzle/migrations/0007_*.sql`. It must contain exactly these effects and nothing else (no `DISABLE ROW LEVEL SECURITY`, no `DROP POLICY`, nothing touching `close_month`):
- `ALTER TABLE "income_types" ADD COLUMN "is_salary" boolean DEFAULT false NOT NULL;`
- `ALTER TABLE "income_types" ADD COLUMN "expected_amount" numeric(10, 2);`
- `ALTER TABLE "expense_entries" ALTER COLUMN "category_id" DROP NOT NULL;`
- `ALTER TABLE "savings_entries" ADD COLUMN "date" date;`
- `ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_category_or_envelope" CHECK (...)`

If drizzle-kit did not emit the CHECK, append it by hand:
`ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_category_or_envelope" CHECK ("expense_entries"."category_id" IS NOT NULL OR "expense_entries"."envelope_id" IS NOT NULL);`
Do **not** run `db:migrate` here (Task 10).

- [ ] **Step 6: Run the whole suite, then commit**

Run: `npm test` — Expected: all pass.

```bash
git add drizzle tests/unit/drizzle-schema.test.ts
git commit -m "feat(db): salary flag on income types, optional expense category, dated savings versements"
```

---

### Task 2: Salary — expected amount on income types, copied to entries, back-filled in open months

**Files:**
- Modify: `server/utils/domain/closure.ts`, `server/utils/monthLock.ts`, `shared/schemas/incomeType.ts`, `server/api/incomes/index.post.ts`, `server/api/income-types/[id].patch.ts`
- Create: `server/utils/salaryExpectation.ts`, `server/utils/movementValues.ts`
- Test: `tests/unit/server/utils/monthLock.test.ts`, `tests/unit/server/utils/salaryExpectation.test.ts`, `tests/unit/server/api/incomeSalary.test.ts`, `tests/unit/shared/schemas/patchSchemas.test.ts`

**Interfaces:**
- Produces:
  - `isMonthOpen(month: YearMonth, latestClosed: YearMonth | null): boolean` in `server/utils/domain/closure.ts`
  - `fetchLatestClosedMonth(event: H3Event): Promise<YearMonth | null>` in `server/utils/monthLock.ts`
  - `salaryExpectationFor(incomeTypeId: string): Promise<string | null>`
  - `backfillSalaryExpectation(event: H3Event, incomeTypeId: string, expectedAmount: string | null): Promise<void>`
  - `incomeRowValues(input: IncomeEntryInput, expectedAmount: string | null)` in `server/utils/movementValues.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/server/utils/monthLock.test.ts` (reusing its existing `state` fake and `beforeEach`; add `fetchLatestClosedMonth` to that file's import from `monthLock`):

```ts
describe('fetchLatestClosedMonth', () => {
  it('returns null when no month was ever closed', async () => {
    state.closures = []
    expect(await fetchLatestClosedMonth({ context: {} } as any)).toBeNull()
  })

  it('returns the latest closed month only', async () => {
    state.closures = [
      { year: 2026, month: 8, status: 'closed' },
      { year: 2026, month: 9, status: 'closed' },
      { year: 2026, month: 10, status: 'open' },
    ]
    expect(await fetchLatestClosedMonth({ context: {} } as any)).toEqual({ year: 2026, month: 9 })
  })
})
```

Append to `tests/unit/server/utils/domain/closure.test.ts` (add `isMonthOpen` to its import):

```ts
describe('isMonthOpen', () => {
  it('treats every month as open when nothing was closed', () => {
    expect(isMonthOpen({ year: 2020, month: 1 }, null)).toBe(true)
  })
  it('freezes the latest closed month and everything before it', () => {
    const closed = { year: 2026, month: 9 }
    expect(isMonthOpen({ year: 2026, month: 9 }, closed)).toBe(false)
    expect(isMonthOpen({ year: 2026, month: 3 }, closed)).toBe(false)
    expect(isMonthOpen({ year: 2026, month: 10 }, closed)).toBe(true)
  })
})
```

Create `tests/unit/server/utils/salaryExpectation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { incomeEntries, incomeTypes } from '../../../../drizzle/schema'

// Operators become descriptors so the fake db evaluates the real `where` the code builds.
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: any, val: any) => ({ type: 'eq', col, val })),
  gt: vi.fn((col: any, val: any) => ({ type: 'gt', col, val })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  or: vi.fn((...args: any[]) => ({ type: 'or', args })),
}))

const lock = vi.hoisted(() => ({ latestClosed: null as { year: number, month: number } | null }))
vi.mock('../../../../server/utils/monthLock', () => ({
  fetchLatestClosedMonth: vi.fn(async () => lock.latestClosed),
}))

const fake = vi.hoisted(() => {
  const store = { types: [] as any[], entries: [] as any[] }
  function field(col: any): string {
    if (col === incomeTypes.id) return 'id'
    if (col === incomeEntries.incomeTypeId) return 'incomeTypeId'
    if (col === incomeEntries.yearAssigned) return 'yearAssigned'
    if (col === incomeEntries.monthAssigned) return 'monthAssigned'
    throw new Error('Unrecognized column')
  }
  function matches(row: any, c: any): boolean {
    if (c.type === 'and') return c.args.every((a: any) => matches(row, a))
    if (c.type === 'or') return c.args.some((a: any) => matches(row, a))
    if (c.type === 'eq') return row[field(c.col)] === c.val
    if (c.type === 'gt') return row[field(c.col)] > c.val
    throw new Error(`Unsupported ${c.type}`)
  }
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((c: any) => Promise.resolve(store.types.filter((r) => matches(r, c)))),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: any) => ({
        where: vi.fn((c: any) => ({
          returning: vi.fn(() => {
            const hit = store.entries.filter((r) => matches(r, c))
            hit.forEach((r) => Object.assign(r, values))
            return Promise.resolve(hit.map((r) => ({ id: r.id })))
          }),
        })),
      })),
    })),
  }
  return { store, db }
})
vi.mock('../../../../server/utils/db', () => ({ db: fake.db, withDbTimeout: <T>(p: Promise<T>) => p }))

import { salaryExpectationFor, backfillSalaryExpectation } from '../../../../server/utils/salaryExpectation'

const event = { context: {} } as any

describe('salaryExpectationFor', () => {
  beforeEach(() => { fake.store.types = [] })

  it("returns the type's expected amount when it is a salary", async () => {
    fake.store.types = [{ id: 't1', isSalary: true, expectedAmount: '2100.00' }]
    expect(await salaryExpectationFor('t1')).toBe('2100.00')
  })

  it('returns null for a type that is not a salary, even with an amount set', async () => {
    fake.store.types = [{ id: 't1', isSalary: false, expectedAmount: '2100.00' }]
    expect(await salaryExpectationFor('t1')).toBeNull()
  })

  it('returns null for an unknown type', async () => {
    expect(await salaryExpectationFor('missing')).toBeNull()
  })
})

describe('backfillSalaryExpectation', () => {
  beforeEach(() => {
    lock.latestClosed = null
    fake.store.entries = [
      { id: 'aug', incomeTypeId: 't1', yearAssigned: 2026, monthAssigned: 8, expectedAmount: null },
      { id: 'sep', incomeTypeId: 't1', yearAssigned: 2026, monthAssigned: 9, expectedAmount: null },
      { id: 'oct', incomeTypeId: 't1', yearAssigned: 2026, monthAssigned: 10, expectedAmount: null },
      { id: 'other', incomeTypeId: 't2', yearAssigned: 2026, monthAssigned: 10, expectedAmount: null },
    ]
  })

  it('updates only open months of that type', async () => {
    lock.latestClosed = { year: 2026, month: 9 }
    await backfillSalaryExpectation(event, 't1', '2100.00')
    const byId = Object.fromEntries(fake.store.entries.map((r) => [r.id, r.expectedAmount]))
    expect(byId).toEqual({ aug: null, sep: null, oct: '2100.00', other: null })
  })

  it('updates every month of that type when nothing was ever closed', async () => {
    await backfillSalaryExpectation(event, 't1', '2100.00')
    expect(fake.store.entries.filter((r) => r.expectedAmount === '2100.00').map((r) => r.id)).toEqual(['aug', 'sep', 'oct'])
  })

  it('clears the expectation in open months when the type stops being a salary', async () => {
    fake.store.entries.forEach((r) => { r.expectedAmount = '2100.00' })
    lock.latestClosed = { year: 2026, month: 9 }
    await backfillSalaryExpectation(event, 't1', null)
    expect(fake.store.entries.find((r) => r.id === 'oct')!.expectedAmount).toBeNull()
    expect(fake.store.entries.find((r) => r.id === 'sep')!.expectedAmount).toBe('2100.00')
  })

  it('crosses year boundaries correctly', async () => {
    lock.latestClosed = { year: 2025, month: 12 }
    fake.store.entries = [
      { id: 'dec', incomeTypeId: 't1', yearAssigned: 2025, monthAssigned: 12, expectedAmount: null },
      { id: 'jan', incomeTypeId: 't1', yearAssigned: 2026, monthAssigned: 1, expectedAmount: null },
    ]
    await backfillSalaryExpectation(event, 't1', '1.00')
    expect(fake.store.entries.map((r) => r.expectedAmount)).toEqual([null, '1.00'])
  })
})
```

Create `tests/unit/server/api/incomeSalary.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ input: null as any, expectation: null as string | null, patched: null as any }))
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))
vi.mock('../../../../server/utils/monthLock', () => ({ assertMonthOpen: vi.fn() }))
const salary = vi.hoisted(() => ({
  salaryExpectationFor: vi.fn(async () => state.expectation),
  backfillSalaryExpectation: vi.fn(async () => {}),
}))
vi.mock('../../../../server/utils/salaryExpectation', () => salary)
vi.mock('../../../../server/utils/referenceCrud', () => ({
  patchRow: vi.fn(async (_t: any, id: string, values: any) => ({ id, isSalary: false, expectedAmount: null, ...state.patched, ...values })),
}))

const db = vi.hoisted(() => {
  const chain: any = {}
  chain.insert = vi.fn(() => chain)
  chain.values = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve([{ id: 'row' }]))
  return chain
})
vi.mock('../../../../server/utils/db', () => ({ db, withDbTimeout: <T>(p: Promise<T>) => p }))

let postIncome: (e: any) => Promise<any>
let patchIncomeType: (e: any) => Promise<any>
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (h: any) => h
  postIncome = (await import('../../../../server/api/incomes/index.post.ts')).default as any
  patchIncomeType = (await import('../../../../server/api/income-types/[id].patch.ts')).default as any
})
const event = (id?: string) => ({ context: { params: id ? { id } : {} } }) as any

describe('salary on income entry', () => {
  beforeEach(() => {
    state.expectation = null
    state.patched = null
    db.values.mockClear()
    salary.backfillSalaryExpectation.mockClear()
  })

  it("copies the salary type's expected amount onto a new income", async () => {
    state.input = { incomeTypeId: 't1', label: 'Salaire', amount: 2150, dateReceived: '2026-10-01', monthAssigned: 10, yearAssigned: 2026 }
    state.expectation = '2100.00'
    await postIncome(event())
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ expectedAmount: '2100.00', amount: '2150' }))
  })

  it('leaves expected_amount null for a non-salary type', async () => {
    state.input = { incomeTypeId: 't2', label: 'Vinted', amount: 20, dateReceived: '2026-10-01', monthAssigned: 10, yearAssigned: 2026 }
    await postIncome(event())
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ expectedAmount: null }))
  })

  it('back-fills open months when the salary flag is switched on', async () => {
    state.input = { isSalary: true }
    state.patched = { expectedAmount: '2100.00' }
    await patchIncomeType(event('t1'))
    expect(salary.backfillSalaryExpectation).toHaveBeenCalledWith(expect.anything(), 't1', '2100.00')
  })

  it('back-fills null when the flag is switched off', async () => {
    state.input = { isSalary: false }
    state.patched = { expectedAmount: '2100.00' }
    await patchIncomeType(event('t1'))
    expect(salary.backfillSalaryExpectation).toHaveBeenCalledWith(expect.anything(), 't1', null)
  })

  it('does not touch entries on a rename', async () => {
    state.input = { name: 'Paie' }
    await patchIncomeType(event('t1'))
    expect(salary.backfillSalaryExpectation).not.toHaveBeenCalled()
  })
})
```

Append to `tests/unit/shared/schemas/patchSchemas.test.ts` (import `incomeTypePatchSchema` if not already imported):

```ts
describe('incomeTypePatchSchema salary fields', () => {
  it('accepts the flag and a text amount from the Paramètres input', () => {
    expect(incomeTypePatchSchema.parse({ isSalary: true, expectedAmount: '2100.5' })).toEqual({ isSalary: true, expectedAmount: 2100.5 })
  })
  it('keeps null as null rather than coercing it to 0', () => {
    expect(incomeTypePatchSchema.parse({ expectedAmount: null })).toEqual({ expectedAmount: null })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/server/utils/monthLock.test.ts tests/unit/server/utils/domain/closure.test.ts tests/unit/server/utils/salaryExpectation.test.ts tests/unit/server/api/incomeSalary.test.ts tests/unit/shared/schemas/patchSchemas.test.ts`
Expected: FAIL — missing exports / modules.

- [ ] **Step 3: Implement**

`server/utils/domain/closure.ts`, after `compareYearMonth`:

```ts
/** Every month up to and including the latest closed one is frozen. */
export function isMonthOpen(month: YearMonth, latestClosed: YearMonth | null): boolean {
  return latestClosed === null || compareYearMonth(month, latestClosed) > 0
}
```

`server/utils/monthLock.ts` — split the query out; keep the header comment above `assertMonthOpen`:

```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { isMonthOpen, monthLabel } from './domain/closure'
import type { YearMonth } from './domain/closure'
import { userError } from './userError'

// Data API only: it is called from pool-backed write routes, and must not take a second
// pool slot of its own while they hold one.
export async function fetchLatestClosedMonth(event: H3Event): Promise<YearMonth | null> {
  const supabase = createSupabaseServerClient(event)
  const { data, error } = await supabase
    .from('month_closures')
    .select('year, month')
    .eq('status', 'closed')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(10000))

  if (error) {
    console.error(`[monthLock] month_closures request failed: ${error.message}`)
    // Fail closed: writing into a month that might be closed would falsify its report.
    throw createError({ statusCode: 500, statusMessage: 'Failed to check month lock' })
  }

  const row = data?.[0]
  return row ? { year: row.year, month: row.month } : null
}

// Every month up to the latest closed one is frozen, closed or not: a movement backdated
// into an earlier, never-closed month would make that month closable, and closing it
// would rewrite the allocations of the closed month after it.
export async function assertMonthOpen(event: H3Event, year: number, month: number): Promise<void> {
  const latestClosed = await fetchLatestClosedMonth(event)
  if (!isMonthOpen({ year, month }, latestClosed)) {
    throw userError(409, 'Month closed', `${monthLabel({ year, month })} est clôturé. Affectez ce mouvement à un mois ouvert.`)
  }
}
```

`shared/schemas/incomeType.ts`:

```ts
export const incomeTypeInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  requiresDetailsText: z.boolean().optional(),
  defaultTargetEnvelopeId: z.string().uuid().nullable().optional(),
  isSalary: z.boolean().optional(),
  // Coerced: Paramètres submits it from a text input.
  expectedAmount: z.coerce.number().nonnegative().nullable().optional(),
})
```

Create `server/utils/salaryExpectation.ts`:

```ts
import { and, eq, gt, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { db, withDbTimeout } from './db'
import { fetchLatestClosedMonth } from './monthLock'
import { incomeEntries, incomeTypes } from '../../drizzle/schema'

// "Salaire reçu" counts incomes that carry an expected amount (summariseIncome). The
// amount is set once on the income type and copied onto each entry, so the dashboard,
// Épargne's variance row and the closure report all keep reading the same column.

export async function salaryExpectationFor(incomeTypeId: string): Promise<string | null> {
  const [type] = await withDbTimeout(db
    .select({ isSalary: incomeTypes.isSalary, expectedAmount: incomeTypes.expectedAmount })
    .from(incomeTypes)
    .where(eq(incomeTypes.id, incomeTypeId)))
  return type?.isSalary ? type.expectedAmount : null
}

/** Re-applies a type's expectation to its entries in open months; closed months stay frozen. */
export async function backfillSalaryExpectation(event: H3Event, incomeTypeId: string, expectedAmount: string | null): Promise<void> {
  const latestClosed = await fetchLatestClosedMonth(event)
  const sameType = eq(incomeEntries.incomeTypeId, incomeTypeId)
  const where = latestClosed
    ? and(sameType, or(
        gt(incomeEntries.yearAssigned, latestClosed.year),
        and(eq(incomeEntries.yearAssigned, latestClosed.year), gt(incomeEntries.monthAssigned, latestClosed.month)),
      ))
    : sameType

  await withDbTimeout(db.update(incomeEntries).set({ expectedAmount }).where(where).returning({ id: incomeEntries.id }))
}
```

Create `server/utils/movementValues.ts`:

```ts
import type { IncomeEntryInput } from '../../shared/schemas/incomeEntry'

// The row each create and edit endpoint writes, built in one place so POST and PATCH can
// never derive months or amounts differently.

export function incomeRowValues(input: IncomeEntryInput, expectedAmount: string | null) {
  return {
    incomeTypeId: input.incomeTypeId,
    label: input.label,
    amount: String(input.amount),
    dateReceived: input.dateReceived,
    monthAssigned: input.monthAssigned,
    yearAssigned: input.yearAssigned,
    detailsText: input.detailsText ?? null,
    targetEnvelopeId: input.targetEnvelopeId ?? null,
    expectedAmount,
  }
}
```

`server/api/incomes/index.post.ts` — replace the insert:

```ts
import { requireUser } from '../../utils/auth'
import { db, withDbTimeout } from '../../utils/db'
import { validateBody } from '../../utils/validateBody'
import { assertMonthOpen } from '../../utils/monthLock'
import { salaryExpectationFor } from '../../utils/salaryExpectation'
import { incomeRowValues } from '../../utils/movementValues'
import { incomeEntries } from '../../../drizzle/schema'
import { incomeEntryInputSchema } from '../../../shared/schemas/incomeEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, incomeEntryInputSchema)
  // A closed month is frozen: its report and leftovers must stay true.
  await assertMonthOpen(event, input.yearAssigned, input.monthAssigned)

  const expectedAmount = await salaryExpectationFor(input.incomeTypeId)

  // withDbTimeout: the pool-wait queue has no timeout of its own, so an unwrapped call
  // waits forever instead of failing when the pool's slots are exhausted.
  const [row] = await withDbTimeout(db
    .insert(incomeEntries)
    .values(incomeRowValues(input, expectedAmount))
    .returning())

  return row
})
```

`server/api/income-types/[id].patch.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { backfillSalaryExpectation } from '../../utils/salaryExpectation'
import { incomeTypes } from '../../../drizzle/schema'
import { incomeTypePatchSchema } from '../../../shared/schemas/incomeType'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const input = await validateBody(event, incomeTypePatchSchema)
  const row = await patchRow(incomeTypes, id, input)

  // Entries already saved in open months follow the type, so flagging the salary type
  // fixes the current month's dashboard straight away.
  if (input.isSalary !== undefined || input.expectedAmount !== undefined) {
    await backfillSalaryExpectation(event, id, row.isSalary ? row.expectedAmount : null)
  }

  return row
})
```

Note: `getRouterParam`/`createError` stay Nitro auto-imports here, as before. In `incomeSalary.test.ts` they are not shimmed; if the test errors with `getRouterParam is not defined`, add `import { createError, getRouterParam } from 'h3'` at the top of the handler (h3 reads `event.context.params`, which the fake event provides).

- [ ] **Step 4: Run the tests to verify they pass**

Run the command from Step 2. Expected: PASS. Then `npm test` — Expected: all pass (`entryLock.test.ts` still passes: its fake `where` resolves `[]`, so the expectation is null).

- [ ] **Step 5: Commit**

```bash
git add server shared tests
git commit -m "fix: count salary incomes in 'Salaire reçu' via a salary flag and expected amount on the income type"
```

---

### Task 3: Optional category when an expense comes out of an envelope

**Files:**
- Modify: `shared/schemas/expenseEntry.ts`, `server/utils/movementValues.ts`, `server/api/expenses/index.post.ts`, `server/utils/closureQuery.ts`, `server/utils/domain/accountsOverview.ts`, `server/utils/movementsQuery.ts` (comment only)
- Test: `tests/unit/server/schemas/expenseEntry.test.ts`, `tests/unit/server/utils/closureQuery.test.ts`, `tests/unit/server/utils/domain/dashboard.test.ts`

**Interfaces:**
- Consumes: `server/utils/movementValues.ts` from Task 2.
- Produces: `expenseRowValues(input: ExpenseEntryInput)`; `ExpenseEntryInput.categoryId: string | null | undefined`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/server/schemas/expenseEntry.test.ts`, **replace** the test `'rejects a missing categoryId'` with:

```ts
  it('accepts an expense with an envelope and no category', () => {
    const { categoryId, ...rest } = validInput
    expect(() => expenseEntryInputSchema.parse({ ...rest, envelopeId: '33333333-3333-3333-3333-333333333333' })).not.toThrow()
  })

  it('accepts a null category when an envelope is set', () => {
    expect(() => expenseEntryInputSchema.parse({ ...validInput, categoryId: null, envelopeId: '33333333-3333-3333-3333-333333333333' })).not.toThrow()
  })

  it('rejects an expense with neither a category nor an envelope, in French', () => {
    const result = expenseEntryInputSchema.safeParse({ ...validInput, categoryId: null, envelopeId: null })
    expect(result.success).toBe(false)
    expect(result.error!.issues[0].message).toBe('Choisissez une catégorie ou une enveloppe.')
  })
```

Append to `tests/unit/server/utils/domain/dashboard.test.ts`:

```ts
describe('partitionExpenses with an uncategorised envelope expense', () => {
  it('counts it in the envelope slice', () => {
    expect(partitionExpenses([{ amount: 30, envelopeId: 'env', categoryIsFixed: false, financedBy: 'budget' }]))
      .toEqual({ fixed: 0, envelope: 30, variable: 0 })
  })
})
```

In `tests/unit/server/utils/closureQuery.test.ts`, read the existing test `'maps one month of rows, keeping nulls and turning numeric strings into numbers'` to see how it seeds `expense_entries`; add a sibling test in the same style that seeds one expense row with `categories: null, envelopes: { name: 'Courses', emoji: '🛒' }` and asserts the mapped expense has `categoryName: 'Courses', categoryEmoji: '🛒', categoryBucket: null`. Also assert the `expense_entries` select string contains `envelopes(name,emoji)`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/server/schemas/expenseEntry.test.ts tests/unit/server/utils/closureQuery.test.ts tests/unit/server/utils/domain/dashboard.test.ts`
Expected: FAIL on the schema and closureQuery tests (the dashboard one may already pass — it pins existing behaviour).

- [ ] **Step 3: Implement**

`shared/schemas/expenseEntry.ts`:

```ts
import { z } from 'zod'

export const expenseEntryInputSchema = z.object({
  date: z.string().min(1),
  // Optional when the expense comes out of an envelope: the envelope already says where it
  // belongs. The database CHECK expense_entries_category_or_envelope enforces the same rule.
  categoryId: z.string().uuid().nullable().optional(),
  label: z.string().min(1),
  amount: z.number().positive(),
  accountId: z.string().uuid().nullable().optional(),
  envelopeId: z.string().uuid().nullable().optional(),
  financedBy: z.enum(['budget', 'gift_given', 'gift_received']).default('budget'),
}).refine((input) => Boolean(input.categoryId) || Boolean(input.envelopeId), {
  message: 'Choisissez une catégorie ou une enveloppe.',
  path: ['categoryId'],
})

export type ExpenseEntryInput = z.infer<typeof expenseEntryInputSchema>
```

Append to `server/utils/movementValues.ts` (and add `import type { ExpenseEntryInput } from '../../shared/schemas/expenseEntry'`):

```ts
export function expenseRowValues(input: ExpenseEntryInput) {
  const [yearAssigned, monthAssigned] = input.date.split('-').map(Number)
  return {
    date: input.date,
    categoryId: input.categoryId ?? null,
    label: input.label,
    amount: String(input.amount),
    accountId: input.accountId ?? null,
    envelopeId: input.envelopeId ?? null,
    financedBy: input.financedBy,
    monthAssigned,
    yearAssigned,
  }
}
```

`server/api/expenses/index.post.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { db, withDbTimeout } from '../../utils/db'
import { validateBody } from '../../utils/validateBody'
import { assertMonthOpen } from '../../utils/monthLock'
import { expenseRowValues } from '../../utils/movementValues'
import { expenseEntries } from '../../../drizzle/schema'
import { expenseEntryInputSchema } from '../../../shared/schemas/expenseEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, expenseEntryInputSchema)
  const values = expenseRowValues(input)

  // A closed month is frozen: its report and leftovers must stay true.
  await assertMonthOpen(event, values.yearAssigned, values.monthAssigned)

  // withDbTimeout: the pool-wait queue has no timeout of its own, so an unwrapped call
  // waits forever instead of failing when the pool's slots are exhausted.
  const [row] = await withDbTimeout(db.insert(expenseEntries).values(values).returning())

  return row
})
```

`server/utils/closureQuery.ts` — the expense select becomes
`'date,label,amount,envelope_id,financed_by,categories(name,emoji,fifty_thirty_twenty_bucket),envelopes(name,emoji)'`
and the expense mapping:

```ts
    expenses: (expensesRes.data ?? []).map((row: any) => {
      const category = unwrap<any>(row.categories)
      // An expense taken from an envelope may have no category; the report groups it
      // under its envelope instead.
      const envelope = unwrap<any>(row.envelopes)
      return {
        date: row.date,
        label: row.label,
        amount: Number(row.amount),
        envelopeId: row.envelope_id ?? null,
        financedBy: row.financed_by,
        categoryName: category?.name ?? envelope?.name ?? '',
        categoryEmoji: category?.emoji ?? envelope?.emoji ?? '',
        categoryBucket: category?.fifty_thirty_twenty_bucket ?? null,
      }
    }),
```

`server/utils/domain/accountsOverview.ts`: change `expensesThisMonth: { categoryId: string }[]` to `expensesThisMonth: { categoryId: string | null }[]` (an uncategorised expense can never settle a fixed charge; the Set lookup already handles it).

`server/utils/movementsQuery.ts`: replace the comment `// category_id is NOT NULL, so the embed is always present.` with `// category_id is null for an expense taken from an envelope; the feed labels it by envelope.`

Then run `grep -rn "categories(" server` and confirm every remaining reader (`dashboardQuery.ts`, `epargneQuery.ts`, `movementsQuery.ts`) uses `?.` on the category embed — they do today; leave them.

- [ ] **Step 4: Run tests**

Run the Step 2 command, then `npm test`. Expected: PASS. If `entryLock.test.ts` fails on the expense case, it is because the fixture lacks `envelopeId`; it is injected past validation, so it should not — investigate before changing it.

- [ ] **Step 5: Commit**

```bash
git add server shared tests
git commit -m "feat: an expense taken from an envelope no longer needs a category"
```

---

### Task 4: Savings as dated, additive versements

**Files:**
- Modify: `shared/schemas/savings.ts`, `server/utils/movementValues.ts`, `server/api/savings/index.post.ts`
- Test: `tests/unit/server/api/savingsPost.test.ts` (rewrite), `tests/unit/server/api/entryLock.test.ts`

**Interfaces:**
- Produces: `savingsInputSchema` = `{ savingsGoalId: uuid, date: 'YYYY-MM-DD', amount: number > 0 }`; `SavingsInput`; `savingsRowValues(input: SavingsInput)` returning `{ savingsGoalId, date, year, month, amount: string, source: 'manual' }`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `tests/unit/server/api/savingsPost.test.ts` with:

```ts
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { savingsInputSchema } from '../../../../shared/schemas/savings'

const state = vi.hoisted(() => ({ input: null as any, rows: [] as any[] }))
const lock = vi.hoisted(() => ({ assertMonthOpen: vi.fn() }))
vi.mock('../../../../server/utils/monthLock', () => lock)
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))

const db = vi.hoisted(() => ({
  insert: vi.fn(() => ({
    values: vi.fn((values: any) => ({
      returning: vi.fn(() => {
        const row = { id: `row-${state.rows.length + 1}`, ...values }
        state.rows.push(row)
        return Promise.resolve([row])
      }),
    })),
  })),
  update: vi.fn(),
}))
vi.mock('../../../../server/utils/db', () => ({ db, withDbTimeout: <T>(p: Promise<T>) => p }))

let postSavings: (event: any) => Promise<any>
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (handler: any) => handler
  postSavings = (await import('../../../../server/api/savings/index.post.ts')).default as any
})

describe('POST /api/savings', () => {
  beforeEach(() => {
    state.rows = []
    lock.assertMonthOpen.mockReset()
    db.update.mockClear()
  })

  it('records a dated manual versement, month and year taken from the date', async () => {
    state.input = { savingsGoalId: 'g1', date: '2026-10-05', amount: 100 }
    const row = await postSavings({ context: {} })
    expect(row).toMatchObject({ savingsGoalId: 'g1', date: '2026-10-05', year: 2026, month: 10, amount: '100', source: 'manual' })
    expect(lock.assertMonthOpen).toHaveBeenCalledWith(expect.anything(), 2026, 10)
  })

  it('adds a second versement for the same poche and month instead of replacing the first', async () => {
    state.input = { savingsGoalId: 'g1', date: '2026-10-05', amount: 100 }
    await postSavings({ context: {} })
    state.input = { savingsGoalId: 'g1', date: '2026-10-20', amount: 50 }
    await postSavings({ context: {} })
    expect(state.rows.map((r) => r.amount)).toEqual(['100', '50'])
    expect(db.update).not.toHaveBeenCalled()
  })
})

describe('savingsInputSchema', () => {
  const valid = { savingsGoalId: '11111111-1111-1111-1111-111111111111', date: '2026-10-05', amount: '12,5'.replace(',', '.') }
  it('accepts a dated positive amount', () => {
    expect(savingsInputSchema.parse(valid)).toEqual({ ...valid, amount: 12.5 })
  })
  it('rejects zero, which used to mean "reset" and no longer means anything', () => {
    expect(savingsInputSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false)
  })
  it('rejects a malformed date', () => {
    expect(savingsInputSchema.safeParse({ ...valid, date: '05/10/2026' }).success).toBe(false)
  })
})
```

In `tests/unit/server/api/entryLock.test.ts`, change the savings case input to
`lock.input = { savingsGoalId: 'g', date: '2026-09-15', amount: 10 }`. In the `it.each` shared input, `date: '2026-09-28'` is already present and now also serves savings; remove `year: 2026, month: 9` from it.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/server/api/savingsPost.test.ts tests/unit/server/api/entryLock.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`shared/schemas/savings.ts` — replace `savingsInputSchema` (keep `savingsQuerySchema` untouched):

```ts
export const savingsInputSchema = z.object({
  savingsGoalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Each entry is a versement that adds to the month; 0 no longer means anything.
  amount: z.coerce.number().positive(),
})
```

Append to `server/utils/movementValues.ts` (add `import type { SavingsInput } from '../../shared/schemas/savings'`):

```ts
export function savingsRowValues(input: SavingsInput) {
  const [year, month] = input.date.split('-').map(Number)
  return {
    savingsGoalId: input.savingsGoalId,
    date: input.date,
    year,
    month,
    amount: String(input.amount),
    source: 'manual' as const,
  }
}
```

Replace `server/api/savings/index.post.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { assertMonthOpen } from '../../utils/monthLock'
import { db, withDbTimeout } from '../../utils/db'
import { savingsRowValues } from '../../utils/movementValues'
import { savingsEntries } from '../../../drizzle/schema'
import { savingsInputSchema } from '../../../shared/schemas/savings'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, savingsInputSchema)
  const values = savingsRowValues(input)
  // A closed month is frozen: its report and leftovers must stay true.
  await assertMonthOpen(event, values.year, values.month)

  // Every submission is a new versement: two in the same month add up. Closure versements
  // are separate rows (source 'closure') and are never touched here.
  const [row] = await withDbTimeout(db.insert(savingsEntries).values(values).returning())
  return row
})
```

Update the comment in `server/utils/savingsQuery.ts` above the summing loop to: `// A poche can have several versements in a month; summing gives its monthly total.`

- [ ] **Step 4: Run tests**

Run the Step 2 command, then `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server shared tests
git commit -m "feat: savings entries are dated versements that add up within a month"
```

---

### Task 5: Edit and delete endpoints

**Files:**
- Create: `server/utils/movementWrite.ts`, the eight `server/api/{expenses,incomes,transfers,savings}/[id].{patch,delete}.ts` handlers
- Test: `tests/unit/server/api/movementWrite.test.ts`

**Interfaces:**
- Consumes: `assertMonthOpen` (monthLock), `compareYearMonth`/`YearMonth` (domain/closure), `expenseRowValues`, `incomeRowValues`, `savingsRowValues` (movementValues), `salaryExpectationFor`.
- Produces: `PATCH`/`DELETE` on `/api/expenses/:id`, `/api/incomes/:id`, `/api/transfers/:id`, `/api/savings/:id`. PATCH bodies = the creation schemas; PATCH returns the updated row; DELETE returns `{ id }`.

- [ ] **Step 1: Write the failing test** — create `tests/unit/server/api/movementWrite.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ input: null as any, current: null as any, expectation: null as string | null }))
const lock = vi.hoisted(() => ({ assertMonthOpen: vi.fn() }))
vi.mock('../../../../server/utils/monthLock', () => lock)
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))
vi.mock('../../../../server/utils/salaryExpectation', () => ({ salaryExpectationFor: vi.fn(async () => state.expectation) }))

const db = vi.hoisted(() => {
  const calls = { set: [] as any[], deleted: 0 }
  const db: any = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(state.current ? [state.current] : [])) })) })),
    update: vi.fn(() => ({
      set: vi.fn((values: any) => {
        calls.set.push(values)
        return { where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ ...state.current, ...values }])) })) }
      }),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => { calls.deleted++; return Promise.resolve([]) }) })),
  }
  return { db, calls }
})
vi.mock('../../../../server/utils/db', () => ({ db: db.db, withDbTimeout: <T>(p: Promise<T>) => p }))

const routes: Record<string, (e: any) => Promise<any>> = {}
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (h: any) => h
  for (const kind of ['expenses', 'incomes', 'transfers', 'savings']) {
    routes[`${kind}.patch`] = (await import(`../../../../server/api/${kind}/[id].patch.ts`)).default as any
    routes[`${kind}.delete`] = (await import(`../../../../server/api/${kind}/[id].delete.ts`)).default as any
  }
})

const event = () => ({ context: { params: { id: 'm1' } } }) as any
const closed = () => Object.assign(new Error('closed'), { statusCode: 409 })

const expenseInput = { date: '2026-10-12', categoryId: null, label: 'Ramen', amount: 28, envelopeId: 'env', financedBy: 'budget' }
const expenseRow = { id: 'm1', yearAssigned: 2026, monthAssigned: 10 }

describe('edit and delete movements', () => {
  beforeEach(() => {
    lock.assertMonthOpen.mockReset()
    db.calls.set.length = 0
    db.calls.deleted = 0
    state.expectation = null
  })

  it('updates an expense, deriving its month from the new date', async () => {
    state.current = expenseRow
    state.input = expenseInput
    const row = await routes['expenses.patch'](event())
    expect(db.calls.set[0]).toMatchObject({ label: 'Ramen', amount: '28', categoryId: null, monthAssigned: 10, yearAssigned: 2026 })
    expect(row.id).toBe('m1')
  })

  it('checks both the current and the destination month when the date moves', async () => {
    state.current = expenseRow
    state.input = { ...expenseInput, date: '2026-11-02' }
    await routes['expenses.patch'](event())
    expect(lock.assertMonthOpen.mock.calls.map((c) => [c[1], c[2]])).toEqual([[2026, 10], [2026, 11]])
  })

  it('refuses to move an expense into a closed month', async () => {
    state.current = { ...expenseRow, monthAssigned: 11 }
    state.input = expenseInput
    lock.assertMonthOpen.mockResolvedValueOnce(undefined).mockRejectedValueOnce(closed())
    await expect(routes['expenses.patch'](event())).rejects.toMatchObject({ statusCode: 409 })
    expect(db.calls.set).toHaveLength(0)
  })

  it('refuses to edit or delete a movement of a closed month', async () => {
    state.current = expenseRow
    state.input = expenseInput
    lock.assertMonthOpen.mockRejectedValue(closed())
    await expect(routes['expenses.patch'](event())).rejects.toMatchObject({ statusCode: 409 })
    await expect(routes['expenses.delete'](event())).rejects.toMatchObject({ statusCode: 409 })
    expect(db.calls.deleted).toBe(0)
  })

  it.each(['expenses', 'incomes', 'transfers', 'savings'])('answers 404 in French for a movement that no longer exists (%s)', async (kind) => {
    state.current = null
    state.input = expenseInput
    await expect(routes[`${kind}.delete`](event())).rejects.toMatchObject({ statusCode: 404, data: { message: "Ce mouvement n'existe plus." } })
    await expect(routes[`${kind}.patch`](event())).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deletes an expense of an open month', async () => {
    state.current = expenseRow
    expect(await routes['expenses.delete'](event())).toEqual({ id: 'm1' })
    expect(db.calls.deleted).toBe(1)
  })

  it('re-applies the salary expectation when an income changes type', async () => {
    state.current = { id: 'm1', yearAssigned: 2026, monthAssigned: 10 }
    state.input = { incomeTypeId: 'salary', label: 'Paie', amount: 2150, dateReceived: '2026-10-01', monthAssigned: 10, yearAssigned: 2026 }
    state.expectation = '2100.00'
    await routes['incomes.patch'](event())
    expect(db.calls.set[0]).toMatchObject({ incomeTypeId: 'salary', expectedAmount: '2100.00' })
  })

  it('clears the expectation when an income moves to a non-salary type', async () => {
    state.current = { id: 'm1', yearAssigned: 2026, monthAssigned: 10, expectedAmount: '2100.00' }
    state.input = { incomeTypeId: 'gift', label: 'Cadeau', amount: 50, dateReceived: '2026-10-01', monthAssigned: 10, yearAssigned: 2026 }
    await routes['incomes.patch'](event())
    expect(db.calls.set[0]).toMatchObject({ expectedAmount: null })
  })

  it('edits a transfer without moving it to another month', async () => {
    state.current = { id: 'm1', yearAssigned: 2026, monthAssigned: 10 }
    state.input = { fromEnvelopeId: 'a', toEnvelopeId: 'b', amount: 15, reason: 'Resto' }
    await routes['transfers.patch'](event())
    expect(db.calls.set[0]).toEqual({ fromEnvelopeId: 'a', toEnvelopeId: 'b', amount: '15', reason: 'Resto' })
    expect(lock.assertMonthOpen).toHaveBeenCalledTimes(1)
  })

  it('edits a manual savings versement, month from its date', async () => {
    state.current = { id: 'm1', year: 2026, month: 10, source: 'manual' }
    state.input = { savingsGoalId: 'g1', date: '2026-10-20', amount: 60 }
    await routes['savings.patch'](event())
    expect(db.calls.set[0]).toMatchObject({ savingsGoalId: 'g1', date: '2026-10-20', year: 2026, month: 10, amount: '60' })
  })

  it('never edits or deletes a closure versement', async () => {
    state.current = { id: 'm1', year: 2026, month: 10, source: 'closure' }
    state.input = { savingsGoalId: 'g1', date: '2026-10-20', amount: 60 }
    await expect(routes['savings.patch'](event())).rejects.toMatchObject({ statusCode: 409, data: { message: 'Versement de clôture — non modifiable.' } })
    await expect(routes['savings.delete'](event())).rejects.toMatchObject({ statusCode: 409 })
    expect(db.calls.deleted).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/server/api/movementWrite.test.ts`
Expected: FAIL — handler modules not found.

- [ ] **Step 3: Implement the helper** — create `server/utils/movementWrite.ts`:

```ts
import { eq } from 'drizzle-orm'
import { createError, getRouterParam } from 'h3'
import type { H3Event } from 'h3'
import { db, withDbTimeout } from './db'
import { assertMonthOpen } from './monthLock'
import { compareYearMonth } from './domain/closure'
import type { YearMonth } from './domain/closure'
import { userError } from './userError'

// Shared by the edit and delete handlers of every movement kind. Every call is pool-backed
// and therefore wrapped in withDbTimeout (see referenceCrud.ts for why).

export function requireId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  return id
}

export async function loadRowOr404<T>(table: any, id: string): Promise<T> {
  const [row] = await withDbTimeout(db.select().from(table).where(eq(table.id, id)))
  // A stale drawer (second tab, double click) can target a row that is already gone.
  if (!row) throw userError(404, 'Not found', "Ce mouvement n'existe plus.")
  return row as T
}

/** The month a movement leaves and, if different, the month it lands in must both be open. */
export async function assertMovable(event: H3Event, from: YearMonth, to: YearMonth = from): Promise<void> {
  await assertMonthOpen(event, from.year, from.month)
  if (compareYearMonth(from, to) !== 0) await assertMonthOpen(event, to.year, to.month)
}

export async function updateRow<T>(table: any, id: string, values: Record<string, unknown>): Promise<T> {
  const [row] = await withDbTimeout(db.update(table).set(values).where(eq(table.id, id)).returning())
  return row as T
}

export async function deleteRow(table: any, id: string): Promise<{ id: string }> {
  await withDbTimeout(db.delete(table).where(eq(table.id, id)))
  return { id }
}

export function assertNotClosureVersement(row: { source: string }): void {
  if (row.source === 'closure') {
    throw userError(409, 'Closure versement', 'Versement de clôture — non modifiable.')
  }
}
```

- [ ] **Step 4: Implement the eight handlers**

`server/api/expenses/[id].patch.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { expenseRowValues } from '../../utils/movementValues'
import { assertMovable, loadRowOr404, requireId, updateRow } from '../../utils/movementWrite'
import { expenseEntries } from '../../../drizzle/schema'
import { expenseEntryInputSchema } from '../../../shared/schemas/expenseEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const input = await validateBody(event, expenseEntryInputSchema)
  const current = await loadRowOr404<typeof expenseEntries.$inferSelect>(expenseEntries, id)
  const values = expenseRowValues(input)

  await assertMovable(
    event,
    { year: current.yearAssigned, month: current.monthAssigned },
    { year: values.yearAssigned, month: values.monthAssigned },
  )

  return updateRow(expenseEntries, id, values)
})
```

`server/api/expenses/[id].delete.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { assertMovable, deleteRow, loadRowOr404, requireId } from '../../utils/movementWrite'
import { expenseEntries } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const current = await loadRowOr404<typeof expenseEntries.$inferSelect>(expenseEntries, id)
  await assertMovable(event, { year: current.yearAssigned, month: current.monthAssigned })
  return deleteRow(expenseEntries, id)
})
```

`server/api/incomes/[id].patch.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { incomeRowValues } from '../../utils/movementValues'
import { salaryExpectationFor } from '../../utils/salaryExpectation'
import { assertMovable, loadRowOr404, requireId, updateRow } from '../../utils/movementWrite'
import { incomeEntries } from '../../../drizzle/schema'
import { incomeEntryInputSchema } from '../../../shared/schemas/incomeEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const input = await validateBody(event, incomeEntryInputSchema)
  const current = await loadRowOr404<typeof incomeEntries.$inferSelect>(incomeEntries, id)

  await assertMovable(
    event,
    { year: current.yearAssigned, month: current.monthAssigned },
    { year: input.yearAssigned, month: input.monthAssigned },
  )

  // The type may have changed, so the salary expectation is re-read rather than kept.
  const expectedAmount = await salaryExpectationFor(input.incomeTypeId)
  return updateRow(incomeEntries, id, incomeRowValues(input, expectedAmount))
})
```

`server/api/incomes/[id].delete.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { assertMovable, deleteRow, loadRowOr404, requireId } from '../../utils/movementWrite'
import { incomeEntries } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const current = await loadRowOr404<typeof incomeEntries.$inferSelect>(incomeEntries, id)
  await assertMovable(event, { year: current.yearAssigned, month: current.monthAssigned })
  return deleteRow(incomeEntries, id)
})
```

`server/api/transfers/[id].patch.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { assertMovable, loadRowOr404, requireId, updateRow } from '../../utils/movementWrite'
import { transfers } from '../../../drizzle/schema'
import { transferInputSchema } from '../../../shared/schemas/transfer'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const input = await validateBody(event, transferInputSchema)
  const current = await loadRowOr404<typeof transfers.$inferSelect>(transfers, id)

  // A transfer has no date field in the form, so editing never moves it to another month.
  await assertMovable(event, { year: current.yearAssigned, month: current.monthAssigned })

  return updateRow(transfers, id, {
    fromEnvelopeId: input.fromEnvelopeId,
    toEnvelopeId: input.toEnvelopeId,
    amount: String(input.amount),
    reason: input.reason,
  })
})
```

`server/api/transfers/[id].delete.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { assertMovable, deleteRow, loadRowOr404, requireId } from '../../utils/movementWrite'
import { transfers } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const current = await loadRowOr404<typeof transfers.$inferSelect>(transfers, id)
  await assertMovable(event, { year: current.yearAssigned, month: current.monthAssigned })
  return deleteRow(transfers, id)
})
```

`server/api/savings/[id].patch.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { savingsRowValues } from '../../utils/movementValues'
import { assertMovable, assertNotClosureVersement, loadRowOr404, requireId, updateRow } from '../../utils/movementWrite'
import { savingsEntries } from '../../../drizzle/schema'
import { savingsInputSchema } from '../../../shared/schemas/savings'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const input = await validateBody(event, savingsInputSchema)
  const current = await loadRowOr404<typeof savingsEntries.$inferSelect>(savingsEntries, id)
  assertNotClosureVersement(current)
  const values = savingsRowValues(input)

  await assertMovable(event, { year: current.year, month: current.month }, { year: values.year, month: values.month })

  return updateRow(savingsEntries, id, values)
})
```

`server/api/savings/[id].delete.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { assertMovable, assertNotClosureVersement, deleteRow, loadRowOr404, requireId } from '../../utils/movementWrite'
import { savingsEntries } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const current = await loadRowOr404<typeof savingsEntries.$inferSelect>(savingsEntries, id)
  assertNotClosureVersement(current)
  await assertMovable(event, { year: current.year, month: current.month })
  return deleteRow(savingsEntries, id)
})
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/server/api/movementWrite.test.ts`, then `npm test`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server tests
git commit -m "feat: edit and delete expenses, incomes, transfers and savings versements in open months"
```

---

### Task 6: Movements feed — savings rows, edit fields, `editable`

**Files:**
- Create: `shared/types/movement.ts`
- Modify: `server/utils/domain/movementsFeed.ts`, `server/utils/movementsQuery.ts`
- Test: `tests/unit/server/utils/domain/movementsFeed.test.ts`, `tests/unit/server/utils/movementsQuery.test.ts`

**Interfaces:**
- Consumes: `fetchLatestClosedMonth` (Task 2), `isMonthOpen` (Task 2), `ExpenseEntryInput`, `IncomeEntryInput`, `TransferInput`, `SavingsInput`.
- Produces (`shared/types/movement.ts`):

```ts
export type MovementType = 'expense' | 'income' | 'transfer' | 'savings'
export interface Movement {
  id: string
  type: MovementType
  date: string
  label: string
  envelopeLabel: string
  origin: string
  amount: number
  sign: 'negative' | 'positive' | 'neutral'
  editable: boolean
  // The movement as its entry form submits it, so the edit drawer can prefill that form.
  fields: ExpenseEntryInput | IncomeEntryInput | TransferInput | SavingsInput
}
```

- [ ] **Step 1: Write the failing tests**

In `tests/unit/server/utils/domain/movementsFeed.test.ts`: change the first test's `expect(movement).toEqual({...})` to `toMatchObject` (the movement now has `editable` and `fields` too). Then append:

```ts
describe('buildMovementsFeed — savings and editing', () => {
  const savingsRow = (overrides = {}) => ({
    id: 's1', date: '2026-10-05' as string | null, year: 2026, month: 10, amount: 100,
    goalName: 'Voyage', source: 'manual' as const,
    savingsGoalId: 'g1',
    ...overrides,
  })

  it('lists a savings versement as money out', () => {
    const [movement] = buildMovementsFeed({ expenses: [], incomes: [], transfers: [], savings: [savingsRow()], monthOpen: true })
    expect(movement).toMatchObject({
      id: 's1', type: 'savings', date: '2026-10-05', label: 'Épargne — Voyage',
      envelopeLabel: '🐷 Épargne', origin: 'Versement', amount: -100, sign: 'negative', editable: true,
      fields: { savingsGoalId: 'g1', date: '2026-10-05', amount: 100 },
    })
  })

  it('dates an undated (older) versement on the 1st of its month, and keeps it editable', () => {
    const [movement] = buildMovementsFeed({ expenses: [], incomes: [], transfers: [], savings: [savingsRow({ date: null, month: 9 })], monthOpen: true })
    expect(movement.date).toBe('2026-09-01')
    expect(movement.fields).toMatchObject({ date: '2026-09-01' })
    expect(movement.editable).toBe(true)
  })

  it('marks a closure versement as not editable, even in an open month', () => {
    const [movement] = buildMovementsFeed({ expenses: [], incomes: [], transfers: [], savings: [savingsRow({ source: 'closure' })], monthOpen: true })
    expect(movement).toMatchObject({ origin: 'Clôture', editable: false })
  })

  it('marks every movement of a closed month as not editable', () => {
    const feed = buildMovementsFeed({ expenses: [], incomes: [], transfers: [], savings: [savingsRow()], monthOpen: false })
    expect(feed.every((m) => !m.editable)).toBe(true)
  })

  it('labels an uncategorised envelope expense by its envelope and carries its form fields', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e9', date: '2026-10-12', label: 'Ramen', amount: 28, financedBy: 'budget',
        envelopeName: 'Restaurants', envelopeEmoji: '🍽️',
        categoryName: '', categoryEmoji: '', categoryIsFixed: false, accountName: null,
        categoryId: null, envelopeId: 'env', accountId: null,
      }],
      incomes: [], transfers: [], savings: [], monthOpen: true,
    })
    expect(movement.envelopeLabel).toBe('🍽️ Restaurants')
    expect(movement.fields).toEqual({ date: '2026-10-12', categoryId: null, label: 'Ramen', amount: 28, accountId: null, envelopeId: 'env', financedBy: 'budget' })
  })
})
```

In `tests/unit/server/utils/movementsQuery.test.ts`:
1. Add `savings_entries: { data: [], error: null }` to `responseByTable` and to `reset()`.
2. Add at the top, after the supabase mock: 
   `const closure = vi.hoisted(() => ({ latest: null as { year: number, month: number } | null }))`
   `vi.mock('../../../../server/utils/monthLock', () => ({ fetchLatestClosedMonth: vi.fn(async () => closure.latest) }))`
   and `closure.latest = null` in `reset()`.
3. Append:

```ts
describe('fetchMovements — savings and editing', () => {
  beforeEach(reset)

  it('includes the month savings versements, with their form fields', async () => {
    mocks.responseByTable.savings_entries = {
      data: [{ id: 's1', date: '2026-09-05', year: 2026, month: 9, amount: 100, source: 'manual', savings_goal_id: 'g1', savings_goals: { name: 'Voyage' } }],
      error: null,
    }
    const feed = await fetchMovements(fakeEvent(), 2026, 9)
    expect(feed.find((m) => m.id === 's1')).toMatchObject({ type: 'savings', amount: -100, fields: { savingsGoalId: 'g1', date: '2026-09-05', amount: 100 } })
    expect(mocks.eqCalls.savings_entries).toEqual([['year', 2026], ['month', 9]])
  })

  it('carries expense ids for the edit form', async () => {
    mocks.responseByTable.expense_entries = {
      data: [{ id: 'x1', date: '2026-09-19', label: 'Courses', amount: 62.4, financed_by: 'budget', category_id: 'c1', envelope_id: null, account_id: 'a1', categories: { name: 'Alimentation', emoji: '🍎', is_fixed: false }, envelopes: null, accounts: { name: 'Compte courant' } }],
      error: null,
    }
    const [movement] = await fetchMovements(fakeEvent(), 2026, 9)
    expect(movement.fields).toMatchObject({ categoryId: 'c1', envelopeId: null, accountId: 'a1' })
  })

  it('marks the month as not editable once it is closed', async () => {
    closure.latest = { year: 2026, month: 9 }
    mocks.responseByTable.transfers = { data: [{ id: 't1', date: '2026-09-03', reason: 'r', amount: 10, from_envelope_id: 'a', to_envelope_id: 'b', from_envelope: { name: 'A' }, to_envelope: { name: 'B' } }], error: null }
    const [movement] = await fetchMovements(fakeEvent(), 2026, 9)
    expect(movement.editable).toBe(false)
  })

  it('leaves savings out of an envelope journal', async () => {
    await fetchEnvelopeJournal(fakeEvent(), 'env-1', 2026, 9)
    expect(mocks.selectCalls.savings_entries).toBeUndefined()
  })
})
```

Note: `selectCalls` is never cleared in the existing `reset()`; add `for (const key of Object.keys(mocks.selectCalls)) delete mocks.selectCalls[key]` to `reset()` so the last test is meaningful.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/server/utils/domain/movementsFeed.test.ts tests/unit/server/utils/movementsQuery.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `shared/types/movement.ts` with the `Produces` block above, importing the four input types:

```ts
import type { ExpenseEntryInput } from '../schemas/expenseEntry'
import type { IncomeEntryInput } from '../schemas/incomeEntry'
import type { TransferInput } from '../schemas/transfer'
import type { SavingsInput } from '../schemas/savings'
```

`server/utils/domain/movementsFeed.ts` — full replacement:

```ts
import type { Movement } from '../../../shared/types/movement'

export type { Movement } from '../../../shared/types/movement'

export interface RawExpenseMovement {
  id: string
  date: string
  label: string
  amount: number
  financedBy: 'budget' | 'gift_given' | 'gift_received'
  envelopeName: string | null
  envelopeEmoji: string | null
  categoryName: string
  categoryEmoji: string
  categoryIsFixed: boolean
  accountName: string | null
  categoryId: string | null
  envelopeId: string | null
  accountId: string | null
}

export interface RawIncomeMovement {
  id: string
  date: string
  label: string
  amount: number
  envelopeName: string | null
  envelopeEmoji: string | null
  incomeTypeId: string
  monthAssigned: number
  yearAssigned: number
  detailsText: string | null
  targetEnvelopeId: string | null
}

export interface RawTransferMovement {
  id: string
  date: string
  reason: string
  amount: number
  fromEnvelopeName: string
  toEnvelopeName: string
  fromEnvelopeId: string
  toEnvelopeId: string
}

export interface RawSavingsMovement {
  id: string
  date: string | null
  year: number
  month: number
  amount: number
  goalName: string
  source: 'manual' | 'closure'
  savingsGoalId: string
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function buildMovementsFeed(input: {
  expenses: RawExpenseMovement[]
  incomes: RawIncomeMovement[]
  transfers: RawTransferMovement[]
  savings?: RawSavingsMovement[]
  // A closed month is frozen, so nothing in it can be opened for editing.
  monthOpen?: boolean
}): Movement[] {
  const monthOpen = input.monthOpen ?? true

  const expenseMovements: Movement[] = input.expenses.map((expense) => ({
    id: expense.id,
    type: 'expense',
    date: expense.date,
    label: expense.label,
    envelopeLabel: expense.envelopeName
      ? `${expense.envelopeEmoji} ${expense.envelopeName}`
      : expense.categoryIsFixed
        ? 'Charges fixes'
        : `${expense.categoryEmoji} ${expense.categoryName}`,
    origin: expense.financedBy === 'gift_received'
      ? 'Cadeau reçu'
      : expense.financedBy === 'gift_given'
        ? 'Cadeau offert'
        : (expense.accountName ?? '—'),
    amount: -expense.amount,
    sign: 'negative',
    editable: monthOpen,
    fields: {
      date: expense.date,
      categoryId: expense.categoryId,
      label: expense.label,
      amount: expense.amount,
      accountId: expense.accountId,
      envelopeId: expense.envelopeId,
      financedBy: expense.financedBy,
    },
  }))

  const incomeMovements: Movement[] = input.incomes.map((income) => ({
    id: income.id,
    type: 'income',
    date: income.date,
    label: income.label,
    envelopeLabel: income.envelopeName ? `${income.envelopeEmoji} ${income.envelopeName}` : '—',
    origin: 'Virement',
    amount: income.amount,
    sign: 'positive',
    editable: monthOpen,
    fields: {
      incomeTypeId: income.incomeTypeId,
      label: income.label,
      amount: income.amount,
      dateReceived: income.date,
      monthAssigned: income.monthAssigned,
      yearAssigned: income.yearAssigned,
      detailsText: income.detailsText,
      targetEnvelopeId: income.targetEnvelopeId,
    },
  }))

  const transferMovements: Movement[] = input.transfers.map((transfer) => ({
    id: transfer.id,
    type: 'transfer',
    date: transfer.date,
    label: `Transfert ${transfer.fromEnvelopeName} → ${transfer.toEnvelopeName}`,
    envelopeLabel: '⇄ deux enveloppes',
    origin: transfer.reason,
    amount: transfer.amount,
    sign: 'neutral',
    editable: monthOpen,
    fields: {
      fromEnvelopeId: transfer.fromEnvelopeId,
      toEnvelopeId: transfer.toEnvelopeId,
      amount: transfer.amount,
      reason: transfer.reason,
    },
  }))

  const savingsMovements: Movement[] = (input.savings ?? []).map((entry) => {
    // Closure versements and rows from before versements were dated have no date.
    const date = entry.date ?? firstOfMonth(entry.year, entry.month)
    return {
      id: entry.id,
      type: 'savings',
      date,
      label: `Épargne — ${entry.goalName}`,
      envelopeLabel: '🐷 Épargne',
      origin: entry.source === 'closure' ? 'Clôture' : 'Versement',
      amount: -entry.amount,
      sign: 'negative',
      editable: monthOpen && entry.source === 'manual',
      fields: { savingsGoalId: entry.savingsGoalId, date, amount: entry.amount },
    }
  })

  return [...expenseMovements, ...incomeMovements, ...transferMovements, ...savingsMovements]
    .sort((a, b) => b.date.localeCompare(a.date))
}
```

`server/utils/movementsQuery.ts`:
- `import type { Movement } from './domain/movementsFeed'` stays; add `import { fetchLatestClosedMonth } from './monthLock'` and `import { isMonthOpen } from './domain/closure'`.
- Selects:

```ts
const EXPENSE_SELECT
  = 'id,date,label,amount,financed_by,category_id,envelope_id,account_id,'
  + 'categories(name,emoji,is_fixed),'
  + 'envelopes(name,emoji),'
  + 'accounts(name)'

const INCOME_SELECT
  = 'id,date_received,label,amount,income_type_id,month_assigned,year_assigned,details_text,target_envelope_id,'
  + 'envelopes:target_envelope_id(name,emoji)'

const TRANSFER_SELECT
  = 'id,date,reason,amount,from_envelope_id,to_envelope_id,'
  + 'from_envelope:envelopes!from_envelope_id(name),'
  + 'to_envelope:envelopes!to_envelope_id(name)'

// savings_entries has one foreign key to savings_goals.
const SAVINGS_SELECT = 'id,date,year,month,amount,source,savings_goal_id,savings_goals(name)'
```

- In `fetchFeed`, after the three queries are built, replace the `Promise.all` and mapping tail with:

```ts
  // Savings belong to the month feed only: a versement never touches an envelope.
  const savingsQuery = envelopeId
    ? null
    : supabase.from('savings_entries').select(SAVINGS_SELECT).eq('year', year).eq('month', month)

  const [expenseRes, incomeRes, transferRes, savingsRes, latestClosed] = await Promise.all([
    expenseQuery.abortSignal(signal),
    incomeQuery.abortSignal(signal),
    transferQuery.abortSignal(signal),
    savingsQuery ? savingsQuery.abortSignal(signal) : Promise.resolve({ data: [], error: null }),
    fetchLatestClosedMonth(event),
  ])

  assertOk('expense_entries', expenseRes.error)
  assertOk('income_entries', incomeRes.error)
  assertOk('transfers', transferRes.error)
  assertOk('savings_entries', savingsRes.error)
```

- In the expense mapping add `categoryId: row.category_id ?? null, envelopeId: row.envelope_id ?? null, accountId: row.account_id ?? null,`.
- In the income mapping add `incomeTypeId: row.income_type_id, monthAssigned: row.month_assigned, yearAssigned: row.year_assigned, detailsText: row.details_text ?? null, targetEnvelopeId: row.target_envelope_id ?? null,`.
- In the transfer mapping add `fromEnvelopeId: row.from_envelope_id, toEnvelopeId: row.to_envelope_id,`.
- Add:

```ts
  const savings = (savingsRes.data ?? []).map((row: any) => ({
    id: row.id,
    date: row.date ?? null,
    year: row.year,
    month: row.month,
    amount: Number(row.amount),
    goalName: unwrap(row.savings_goals)?.name ?? '',
    source: row.source,
    savingsGoalId: row.savings_goal_id,
  }))

  return buildMovementsFeed({
    expenses,
    incomes,
    transfers: transferMovements,
    savings,
    monthOpen: isMonthOpen({ year, month }, latestClosed),
  })
```

Update the file header comment's "three requests" wording to "four requests (three for an envelope journal), plus the month lock".

Then `grep -rn "Movement\b" server app --include=*.ts --include=*.vue` and check `dashboardQuery.ts` still compiles against the new `Movement` (it only re-exports and slices `recentMovements`).

- [ ] **Step 4: Run tests**

Run the Step 2 command, then `npm test`. Expected: PASS. `dashboardQuery.test.ts` mocks `fetchMovements`, so it is unaffected; if `envelopeCeilingsQuery`/journal tests call the real `movementsQuery`, add the same `monthLock` mock to them.

- [ ] **Step 5: Commit**

```bash
git add server shared tests
git commit -m "feat: movements feed lists savings versements and carries edit fields and an editable flag"
```

---

### Task 7: Paramètres — salary flag and expected amount

**Files:**
- Modify: `app/pages/parametres.vue`

**Interfaces:**
- Consumes: `PATCH /api/income-types/:id` with `{ isSalary?: boolean, expectedAmount?: string | null }` (Task 2). `/api/pages/parametres` already returns `isSalary` and `expectedAmount` (it selects `*` and camelizes).

- [ ] **Step 1: Implement**

In the `<script setup>`, change the page type's `incomeTypes: ReferenceItem[]` to
`incomeTypes: (ReferenceItem & { isSalary: boolean, expectedAmount: number | string | null })[]`, and add after `addIncomeType`:

```ts
async function saveSalary(id: string, body: { isSalary?: boolean, expectedAmount?: string | null }) {
  errorMessage.value = ''
  try {
    await $fetch(`/api/income-types/${id}`, { method: 'PATCH', body })
    await loadAll()
  } catch {
    errorMessage.value = 'Une erreur est survenue. Réessayez.'
  }
}

function amountFromInput(event: Event): string | null {
  // Comma normalised like every other amount field here; blank clears the amount.
  return (event.target as HTMLInputElement).value.trim().replace(',', '.') || null
}
```

In the template, replace the income-type chip `<span v-for="incomeType in incomeTypes" …>…</span>` with:

```vue
          <span
            v-for="incomeType in incomeTypes"
            :key="incomeType.id"
            class="flex items-center gap-2 rounded-full bg-app-bg px-3 py-2 text-[11.5px] font-semibold text-ink"
          >
            {{ incomeType.emoji }} {{ incomeType.name }}
            <label class="flex items-center gap-1 text-ink-muted">
              <input
                type="checkbox"
                :checked="incomeType.isSalary"
                @change="saveSalary(incomeType.id, { isSalary: ($event.target as HTMLInputElement).checked })"
              >
              C'est un salaire
            </label>
            <input
              v-if="incomeType.isSalary"
              :value="incomeType.expectedAmount ?? ''"
              :aria-label="`Montant prévu — ${incomeType.name}`"
              placeholder="Montant prévu"
              inputmode="decimal"
              class="w-24 rounded-lg border border-divider bg-white px-2 py-0.5 text-right"
              @change="saveSalary(incomeType.id, { expectedAmount: amountFromInput($event) })"
            >
            <button type="button" class="text-ink-faint" @click="archive('/api/income-types', incomeType.id)">×</button>
          </span>
```

- [ ] **Step 2: Verify**

Run: `npm run build` — Expected: success. Then `npm run dev`, open `/parametres`, tick "C'est un salaire" on a type, type `2100` in "Montant prévu", tab out; reload — both are kept. (Manual check; requires the migration from Task 10 on the database the dev server uses. If the migration is not applied yet, do this check during Task 10.)

- [ ] **Step 3: Commit**

```bash
git add app/pages/parametres.vue
git commit -m "feat(parametres): mark an income type as salary and set its expected amount"
```

---

### Task 8: Entry forms — Épargne tab, hidden category, edit mode

**Files:**
- Create: `app/components/entry/SavingsForm.vue`, `app/utils/expenseForm.ts`
- Modify: `app/composables/useAmountInput.ts`, `app/components/entry/ExpenseForm.vue`, `IncomeForm.vue`, `TransferForm.vue`, `EntryPanel.vue`, `server/utils/pageData.ts`, `app/pages/index.vue`
- Test: `tests/unit/app/expenseForm.test.ts`, `tests/unit/composables/useAmountInput.test.ts`, `tests/unit/server/utils/pageData.test.ts`

**Interfaces:**
- Consumes: `POST /api/savings` `{ savingsGoalId, date, amount }` (Task 4); `PATCH /api/{kind}/:id` (Task 5); `ExpenseEntryInput`, `IncomeEntryInput`, `TransferInput`, `SavingsInput`.
- Produces:
  - `amountToBuffer(value: number): string` in `useAmountInput.ts`
  - `expenseNeedsCategory(envelopeId: string, financedBy: string): boolean` in `app/utils/expenseForm.ts`
  - Every entry form accepts `editing?: { id: string, fields: <its input type> } | null` and emits `saved`.
  - `SavingsForm` props: `goals: { id: string, name: string }[]`, `editing?`.
  - `getMouvementsPage` returns `reference.savingsGoals`; `getDashboardPage` no longer returns `goals`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/app/expenseForm.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { expenseNeedsCategory } from '../../../app/utils/expenseForm'

describe('expenseNeedsCategory', () => {
  it('needs a category when no envelope is chosen', () => {
    expect(expenseNeedsCategory('', 'budget')).toBe(true)
  })
  it('does not when an envelope is chosen', () => {
    expect(expenseNeedsCategory('env-1', 'budget')).toBe(false)
  })
  it('does not for gift money, which always goes to the reserve envelope', () => {
    expect(expenseNeedsCategory('', 'gift_received')).toBe(false)
  })
  it('needs one again once the envelope is set back to "Aucune"', () => {
    expect(expenseNeedsCategory('', 'gift_given')).toBe(true)
  })
})
```

Append to `tests/unit/composables/useAmountInput.test.ts` (import `amountToBuffer` alongside `useAmountInput`):

```ts
describe('amountToBuffer', () => {
  it('turns a stored amount into the keypad buffer, French comma', () => {
    expect(amountToBuffer(62.4)).toBe('62,4')
    expect(amountToBuffer(2100)).toBe('2100')
  })
  it('round-trips through useAmountInput', () => {
    expect(useAmountInput(amountToBuffer(28.5)).amount.value).toBe(28.5)
  })
})
```

In `tests/unit/server/utils/pageData.test.ts`:
- In the Mouvements test, expect `fetchSavingsGoals` to start with the others: the sorted pending names become `['fetchActiveRows', 'fetchActiveRows', 'fetchActiveRows', 'fetchActiveRows', 'fetchMovements', 'fetchSavingsGoals']`, and the settled page's `reference` to include `savingsGoals` (resolve `fetchSavingsGoals: () => [{ id: 'g1' }]` and expect `page.reference.savingsGoals` to equal `[{ id: 'g1' }]`).
- In the Dashboard test, `fetchSavingsGoals` is no longer started and the result has no `goals` key. Read the existing dashboard test and adjust its expected pending list and result accordingly.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/app/expenseForm.test.ts tests/unit/composables/useAmountInput.test.ts tests/unit/server/utils/pageData.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the helpers and page data**

Append to `app/composables/useAmountInput.ts`:

```ts
/** The keypad buffer for an amount already saved, e.g. 62.4 → "62,4". */
export function amountToBuffer(value: number): string {
  return String(value).replace('.', ',')
}
```

Create `app/utils/expenseForm.ts`:

```ts
/**
 * An expense coming out of an envelope belongs to that envelope, so it needs no category.
 * Gift money always goes to the reserve envelope, so it never needs one either.
 */
export function expenseNeedsCategory(envelopeId: string, financedBy: string): boolean {
  return envelopeId === '' && financedBy !== 'gift_received'
}
```

`server/utils/pageData.ts`:

```ts
export async function getDashboardPage(event: H3Event, now: Date) {
  const { year, month } = currentMonth(now)
  // fetchDashboard is the only pool-backed read here (reserve balances); the other is
  // Data API, so this never holds more pool slots than /api/dashboard alone did.
  const [dashboard, closureStatus] = await Promise.all([
    fetchDashboard(event, year, month, now),
    getClosureStatus(event, now),
  ])
  return { dashboard, closureStatus }
}

export async function getMouvementsPage(event: H3Event, now: Date) {
  const { year, month } = currentMonth(now)
  const [movements, categories, accounts, envelopes, incomeTypes, savingsGoals] = await Promise.all([
    fetchMovements(event, year, month),
    fetchActiveRows(event, 'categories'),
    fetchActiveRows(event, 'accounts'),
    fetchActiveRows(event, 'envelopes'),
    fetchActiveRows(event, 'income_types'),
    fetchSavingsGoals(event),
  ])
  return { movements, reference: { categories, accounts, envelopes, incomeTypes, savingsGoals } }
}
```

Run the Step 2 command again — Expected: PASS.

- [ ] **Step 4: Dashboard — remove the savings form**

In `app/pages/index.vue`:
- Delete the `<form …@submit.prevent="recordSavings">…</form>` block inside the "Épargne" section (keep the heading, total and per-goal list).
- Delete `savingsGoalId`, `savingsAmount`, `savingsError`, `isSavingSavings`, `recordSavings`, the `goals` computed and the `goals: SavingsGoal[]` page field (and the `SavingsGoal` interface if nothing else uses it).
- `isHydrated` and its `onMounted`: run `grep -n isHydrated app/pages/index.vue`; delete them and their comment only if no other use remains.
- Under the per-goal list add: `<NuxtLink to="/mouvements" class="mt-3 block text-[11.5px] font-bold text-ink-muted">Ajouter un versement →</NuxtLink>` so the entry point does not just vanish.

- [ ] **Step 5: `SavingsForm.vue`** — create `app/components/entry/SavingsForm.vue`:

```vue
<script setup lang="ts">
import type { SavingsInput } from '~~/shared/schemas/savings'

interface GoalItem {
  id: string
  name: string
}

const emit = defineEmits<{ saved: []; 'amount-change': [number] }>()

const props = defineProps<{
  goals: GoalItem[]
  editing?: { id: string, fields: SavingsInput } | null
}>()

const initial = props.editing?.fields
const { displayValue, amount, pressDigit, pressComma, backspace } = useAmountInput(initial ? amountToBuffer(initial.amount) : '0')

const savingsGoalId = ref(initial?.savingsGoalId ?? props.goals[0]?.id ?? '')
const date = ref(initial?.date ?? new Date().toISOString().slice(0, 10))

watch(amount, (value) => emit('amount-change', value), { immediate: true })

const errorMessage = ref('')
const isSubmitting = ref(false)

const canSubmit = computed(() => amount.value > 0 && savingsGoalId.value.length > 0 && date.value.length > 0)

async function submit() {
  if (!canSubmit.value || isSubmitting.value) return

  errorMessage.value = ''
  isSubmitting.value = true

  try {
    await $fetch(props.editing ? `/api/savings/${props.editing.id}` : '/api/savings', {
      method: props.editing ? 'PATCH' : 'POST',
      body: { savingsGoalId: savingsGoalId.value, date: date.value, amount: amount.value },
    })
    emit('saved')
  } catch (error) {
    errorMessage.value = apiErrorMessage(error) ?? "Impossible d'enregistrer le versement. Vérifiez les champs et réessayez."
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="text-center">
      <p class="text-[40px] font-extrabold tracking-tight text-ink">{{ displayValue }} <span class="text-ink-muted">€</span></p>
      <p class="mt-1 text-[12px] font-medium text-ink-muted">Mis de côté sur le salaire</p>
    </div>

    <div class="rounded-[22px] bg-white px-4">
      <EntryFormRow label="Poche">
        <select v-model="savingsGoalId" class="bg-transparent text-right font-bold text-ink">
          <option v-for="goal in goals" :key="goal.id" :value="goal.id">{{ goal.name }}</option>
        </select>
      </EntryFormRow>
      <EntryFormRow label="Date">
        <input v-model="date" type="date" class="bg-transparent text-right font-bold text-ink">
      </EntryFormRow>
    </div>

    <NumericKeypad @digit="pressDigit" @comma="pressComma" @backspace="backspace" />

    <p v-if="errorMessage" class="text-center text-[12px] font-medium text-warn-ink">{{ errorMessage }}</p>

    <button type="button" :disabled="!canSubmit || isSubmitting" class="rounded-[18px] bg-ink py-[14px] text-center text-[14.5px] font-bold text-white disabled:opacity-50" @click="submit">
      {{ editing ? 'Enregistrer les modifications' : 'Enregistrer le versement' }}
    </button>
  </div>
</template>
```

- [ ] **Step 6: `ExpenseForm.vue` — hidden category and edit mode**

In the `<script setup>`:
- Add `import type { ExpenseEntryInput } from '~~/shared/schemas/expenseEntry'`.
- Props become:

```ts
const props = defineProps<{
  categories: ReferenceItem[]
  accounts: ReferenceItem[]
  envelopes: ReferenceItem[]
  editing?: { id: string, fields: ExpenseEntryInput } | null
}>()
const initial = props.editing?.fields
```

- Initialise from `initial`:

```ts
const { displayValue, amount, pressDigit, pressComma, backspace } = useAmountInput(initial ? amountToBuffer(initial.amount) : '0')

const categoryId = ref(initial?.categoryId ?? categories.value[0]?.id ?? '')
const label = ref(initial?.label ?? '')
const date = ref(initial?.date ?? new Date().toISOString().slice(0, 10))
const accountId = ref(initial?.accountId ?? accounts.value[0]?.id ?? '')
const financedBy = ref<'budget' | 'gift_given' | 'gift_received'>(initial?.financedBy ?? 'budget')
// A gift_received expense is stored against the reserve envelope; the form derives that
// itself, so the envelope picker starts empty for it.
const envelopeId = ref<string>(initial && initial.financedBy !== 'gift_received' ? (initial.envelopeId ?? '') : '')

const needsCategory = computed(() => expenseNeedsCategory(envelopeId.value, financedBy.value))
```

- `canSubmit`:
  `const canSubmit = computed(() => amount.value > 0 && label.value.trim().length > 0 && (!needsCategory.value || categoryId.value.length > 0))`
- In `submit()`, the request becomes:

```ts
    await $fetch(props.editing ? `/api/expenses/${props.editing.id}` : '/api/expenses', {
      method: props.editing ? 'PATCH' : 'POST',
      body: {
        date: date.value,
        // Out of an envelope, the envelope says where the expense belongs.
        categoryId: needsCategory.value ? categoryId.value : null,
        label: label.value,
        amount: amount.value,
        accountId: financedBy.value === 'gift_received' ? null : (accountId.value || null),
        envelopeId: financedBy.value === 'gift_received' ? (reserveEnvelope.value?.id ?? null) : (envelopeId.value || null),
        financedBy: financedBy.value,
      },
    })
```

In the template: add `v-if="needsCategory"` to the `<EntryFormRow label="Catégorie">`, and change the submit button text to `{{ editing ? 'Enregistrer les modifications' : 'Enregistrer la sortie' }}`.

- [ ] **Step 7: `IncomeForm.vue` and `TransferForm.vue` — edit mode**

`IncomeForm.vue`:
- `import type { IncomeEntryInput } from '~~/shared/schemas/incomeEntry'`; add `editing?: { id: string, fields: IncomeEntryInput } | null` to props and `const initial = props.editing?.fields`.
- `useAmountInput(initial ? amountToBuffer(initial.amount) : '0')`.
- Initialise: `incomeTypeId` ← `initial?.incomeTypeId ?? incomeTypes.value[0]?.id ?? ''`, `label` ← `initial?.label ?? ''`, `dateReceived` ← `initial?.dateReceived ?? …today`, `monthAssigned` ← `initial?.monthAssigned ?? now.getMonth() + 1`, `yearAssigned` ← `initial?.yearAssigned ?? now.getFullYear()`, `detailsText` ← `initial?.detailsText ?? ''`, `targetEnvelopeId` ← `initial?.targetEnvelopeId ?? ''`.
- `yearOptions`: if `initial` has a year outside the three options, include it: `const yearOptions = [...new Set([now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, ...(initial ? [initial.yearAssigned] : [])])].sort()`.
- `$fetch(props.editing ? \`/api/incomes/${props.editing.id}\` : '/api/incomes', { method: props.editing ? 'PATCH' : 'POST', body: … })` — body unchanged.
- Button: `{{ editing ? 'Enregistrer les modifications' : "Enregistrer l'entrée" }}`.

`TransferForm.vue`:
- `import type { TransferInput } from '~~/shared/schemas/transfer'`; props `envelopes`, `editing?: { id: string, fields: TransferInput } | null`; `const initial = props.editing?.fields`.
- `useAmountInput(initial ? amountToBuffer(initial.amount) : '0')`; `fromEnvelopeId` ← `initial?.fromEnvelopeId ?? envelopes.value[0]?.id ?? ''`; `toEnvelopeId` ← `initial?.toEnvelopeId ?? envelopes.value[1]?.id ?? ''`; `reason` ← `initial?.reason ?? ''`.
- `$fetch(props.editing ? \`/api/transfers/${props.editing.id}\` : '/api/transfers', { method: props.editing ? 'PATCH' : 'POST', body: … })`.
- Button: `{{ editing ? 'Enregistrer les modifications' : 'Valider le transfert' }}`.

- [ ] **Step 8: `EntryPanel.vue` — the Épargne tab**

- `mode` type becomes `'expense' | 'income' | 'transfer' | 'savings'`; add `{ value: 'savings', label: '🐷 Épargne' }` to `modeOptions`.
- `EntryReferenceData` gains `savingsGoals: { id: string, name: string }[]`; add `const savingsGoals = computed(() => referenceData.value?.savingsGoals ?? [])`.
- At the top of `previewLines`: `if (mode.value === 'savings') return []` (a versement touches no envelope).
- In `handleSaved`, also refresh the dashboard: `refreshNuxtData(['page-mouvements', 'envelope-ceilings', 'page-dashboard'])` — check the dashboard's `useLazyFetch` key in `app/pages/index.vue` and use that exact key.
- Template: change `<TransferForm v-else …>` to `<TransferForm v-else-if="mode === 'transfer'" …>` and add after it:

```vue
      <SavingsForm
        v-else
        :goals="savingsGoals"
        @saved="handleSaved"
        @amount-change="draftAmount = $event"
      />
```

- [ ] **Step 9: Verify**

Run: `npm test` then `npm run build`. Expected: both succeed.

- [ ] **Step 10: Commit**

```bash
git add app server tests
git commit -m "feat(entry): Épargne tab, category hidden for envelope expenses, forms reusable for editing"
```

---

### Task 9: Mouvements — edit drawer with delete

**Files:**
- Create: `app/components/MovementEditor.vue`
- Modify: `app/pages/mouvements.vue`

**Interfaces:**
- Consumes: `Movement` (`shared/types/movement.ts`), the four forms' `editing` prop (Task 8), `DELETE /api/{kind}/:id` (Task 5), `DetailDrawer` (`v-model:open`, `title`).

- [ ] **Step 1: Create `app/components/MovementEditor.vue`**

```vue
<script setup lang="ts">
import type { Movement } from '~~/shared/types/movement'
import type { ExpenseEntryInput } from '~~/shared/schemas/expenseEntry'
import type { IncomeEntryInput } from '~~/shared/schemas/incomeEntry'
import type { TransferInput } from '~~/shared/schemas/transfer'
import type { SavingsInput } from '~~/shared/schemas/savings'

interface ReferenceItem { id: string, name: string, emoji: string, requiresDetailsText?: boolean }
interface EntryReferenceData {
  categories: ReferenceItem[]
  accounts: ReferenceItem[]
  envelopes: ReferenceItem[]
  incomeTypes: ReferenceItem[]
  savingsGoals: { id: string, name: string }[]
}

const props = defineProps<{ movement: Movement, reference: EntryReferenceData }>()
const emit = defineEmits<{ done: [] }>()

const ENDPOINTS: Record<Movement['type'], string> = {
  expense: '/api/expenses',
  income: '/api/incomes',
  transfer: '/api/transfers',
  savings: '/api/savings',
}

const confirmingDelete = ref(false)
const isDeleting = ref(false)
const deleteError = ref('')

async function remove() {
  if (isDeleting.value) return
  deleteError.value = ''
  isDeleting.value = true
  try {
    await $fetch(`${ENDPOINTS[props.movement.type]}/${props.movement.id}`, { method: 'DELETE' })
    emit('done')
  } catch (error) {
    deleteError.value = apiErrorMessage(error) ?? 'Impossible de supprimer ce mouvement.'
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="!movement.editable">
      <p class="rounded-[16px] bg-app-bg p-3 text-[12px] font-semibold text-ink-muted">Mois clôturé — non modifiable</p>
      <dl class="flex flex-col gap-1 text-[12.5px]">
        <div class="flex justify-between"><dt class="text-ink-muted">Libellé</dt><dd class="font-bold text-ink">{{ movement.label }}</dd></div>
        <div class="flex justify-between"><dt class="text-ink-muted">Date</dt><dd class="font-bold text-ink">{{ movement.date }}</dd></div>
        <div class="flex justify-between"><dt class="text-ink-muted">Montant</dt><dd class="font-bold text-ink">{{ formatEuro(Math.abs(movement.amount)) }}</dd></div>
      </dl>
    </template>

    <template v-else>
      <ExpenseForm
        v-if="movement.type === 'expense'"
        :categories="reference.categories"
        :accounts="reference.accounts"
        :envelopes="reference.envelopes"
        :editing="{ id: movement.id, fields: movement.fields as ExpenseEntryInput }"
        @saved="emit('done')"
      />
      <IncomeForm
        v-else-if="movement.type === 'income'"
        :income-types="reference.incomeTypes"
        :envelopes="reference.envelopes"
        :editing="{ id: movement.id, fields: movement.fields as IncomeEntryInput }"
        @saved="emit('done')"
      />
      <TransferForm
        v-else-if="movement.type === 'transfer'"
        :envelopes="reference.envelopes"
        :editing="{ id: movement.id, fields: movement.fields as TransferInput }"
        @saved="emit('done')"
      />
      <SavingsForm
        v-else
        :goals="reference.savingsGoals"
        :editing="{ id: movement.id, fields: movement.fields as SavingsInput }"
        @saved="emit('done')"
      />

      <div class="border-t border-divider pt-4">
        <button
          v-if="!confirmingDelete"
          type="button"
          class="w-full rounded-[18px] border border-divider py-[12px] text-[13.5px] font-bold text-warn-ink"
          @click="confirmingDelete = true"
        >
          Supprimer
        </button>
        <div v-else class="flex flex-col gap-2 rounded-[16px] bg-app-bg p-3">
          <p class="text-center text-[12.5px] font-bold text-ink">Supprimer définitivement ?</p>
          <div class="flex gap-2">
            <button type="button" :disabled="isDeleting" class="flex-1 rounded-[14px] bg-ink py-2 text-[12.5px] font-bold text-white disabled:opacity-50" @click="remove">Oui</button>
            <button type="button" class="flex-1 rounded-[14px] border border-divider py-2 text-[12.5px] font-bold text-ink" @click="confirmingDelete = false">Annuler</button>
          </div>
        </div>
        <p v-if="deleteError" class="mt-2 text-center text-[12px] font-medium text-warn-ink">{{ deleteError }}</p>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Wire it into `app/pages/mouvements.vue`**

Script:
- Replace the local `Movement` interface with `import type { Movement } from '~~/shared/types/movement'`.
- `EntryReferenceData` gains `savingsGoals: { id: string, name: string }[]`.
- `activeFilter` type becomes `'all' | 'expense' | 'income' | 'transfer' | 'savings'`; add `{ value: 'savings', label: 'Épargne' }` to `filterOptions`.
- Add:

```ts
const selected = ref<Movement | null>(null)
const drawerOpen = computed({
  get: () => selected.value !== null,
  set: (open: boolean) => { if (!open) selected.value = null },
})

async function handleEdited() {
  selected.value = null
  await refreshNuxtData(['page-mouvements', 'envelope-ceilings'])
}
```

Template:
- On the `<tr v-for="movement in filteredMovements" …>` add `class="cursor-pointer border-t border-divider hover:bg-app-bg"` (replacing the current class) and `@click="selected = movement"`.
- Before the closing root `</div>` add:

```vue
    <DetailDrawer v-model:open="drawerOpen" :title="selected?.label ?? ''">
      <MovementEditor
        v-if="selected && page"
        :key="selected.id"
        :movement="selected"
        :reference="page.reference"
        @done="handleEdited"
      />
    </DetailDrawer>
```

`DetailDrawer` renders a `USlideover` (a portal), so it may sit inside the grid without taking a column.

- [ ] **Step 3: Verify**

Run: `npm run build` — Expected: success. Run `npm test` — Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add app
git commit -m "feat(mouvements): open a movement to edit or delete it, read-only in closed months"
```

---

### Task 10: Migration, E2E and final verification

**Files:**
- Create: `tests/e2e/movement-edit.spec.ts`
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: Ask the user before migrating the live database**

Tell the user: "Je vais appliquer la migration `0007_*` sur la base Supabase live (`npm run db:migrate`). Elle ajoute 3 colonnes, rend `category_id` facultatif et ajoute une contrainte CHECK ; aucune donnée n'est supprimée. Je peux y aller ?" **Wait for an explicit yes.**

- [ ] **Step 2: Migrate and check RLS**

Run: `npm run db:migrate` — Expected: applies `0007_*` without error.
Then verify RLS is still on for the three altered tables, e.g. with a one-off script in the scratchpad that runs, through `DATABASE_URL`:
`select relname, relrowsecurity from pg_class where relname in ('income_types','expense_entries','savings_entries');` — Expected: `relrowsecurity = true` on all three.

- [ ] **Step 3: Write the E2E spec** — create `tests/e2e/movement-edit.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

// Runs against the live database. Every test deletes what it created through the new
// DELETE routes, so a run leaves no rows behind (unlike entry.spec.ts).
const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

const today = () => new Date().toISOString().slice(0, 10)

async function typeAmount(page: any, digits: string) {
  for (const digit of digits) await page.getByRole('button', { name: digit, exact: true }).click()
}

test('a salary income shows in "Salaire reçu"', async ({ page }) => {
  const parametres = await (await page.request.get('/api/pages/parametres')).json()
  const salaryType = parametres.incomeTypes.find((type: any) => type.isSalary)
  test.skip(!salaryType, 'No income type is flagged as salary yet')

  const before = (await (await page.request.get('/api/pages/dashboard')).json()).dashboard.income.salaryReceived
  const now = new Date()
  const created = await (await page.request.post('/api/incomes', {
    data: { incomeTypeId: salaryType.id, label: 'E2E salaire', amount: 1, dateReceived: today(), monthAssigned: now.getMonth() + 1, yearAssigned: now.getFullYear() },
  })).json()

  try {
    const after = (await (await page.request.get('/api/pages/dashboard')).json()).dashboard.income.salaryReceived
    expect(after).toBeCloseTo(before + 1)
  } finally {
    expect((await page.request.delete(`/api/incomes/${created.id}`)).status()).toBe(200)
  }
})

test('an expense can come out of an envelope with no category', async ({ page }) => {
  const reference = (await (await page.request.get('/api/pages/mouvements')).json()).reference
  const envelope = reference.envelopes.find((e: any) => e.kind === 'budget')
  const response = await page.request.post('/api/expenses', {
    data: { date: today(), categoryId: null, label: 'E2E enveloppe seule', amount: 1, envelopeId: envelope.id, financedBy: 'budget' },
  })
  expect(response.status()).toBe(200)
  const created = await response.json()
  expect(created.categoryId).toBeNull()
  expect((await page.request.delete(`/api/expenses/${created.id}`)).status()).toBe(200)
})

test('savings from the Épargne tab appear in Mouvements, then can be edited and deleted', async ({ page }) => {
  await page.goto('/mouvements')
  await expect(page.getByRole('heading', { name: /mouvements/i })).toBeVisible({ timeout: 15_000 })
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: '🐷 Épargne' }).first().click()
  await typeAmount(page, '7')
  await page.getByRole('button', { name: 'Enregistrer le versement' }).click()

  const row = page.locator('tr', { hasText: 'Épargne —' }).filter({ hasText: '7,00' }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })

  // Edit: 7 → 79
  await row.click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('button', { name: '9', exact: true }).click()
  await drawer.getByRole('button', { name: 'Enregistrer les modifications' }).click()
  const edited = page.locator('tr', { hasText: 'Épargne —' }).filter({ hasText: '79,00' }).first()
  await expect(edited).toBeVisible({ timeout: 15_000 })

  // Delete, with the inline confirmation.
  await edited.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Oui' }).click()
  await expect(page.locator('tr', { hasText: 'Épargne —' }).filter({ hasText: '79,00' })).toHaveCount(0, { timeout: 15_000 })
})
```

The euro formatting (`7,00`) comes from `formatEuro`; if the rendered text differs (e.g. a narrow no-break space before `€`), match on the digits only as above. If the segmented toggle renders its options as something other than buttons, read `app/components/SegmentedToggle.vue` and adjust the first locator.

- [ ] **Step 4: Run it**

Run: `npx playwright test tests/e2e/movement-edit.spec.ts`
Expected: 3 passed (the salary test may report skipped if no type is flagged yet — then flag one in Paramètres (Task 7's manual check) and re-run). Then run the read-only perf guard: `npx playwright test tests/e2e/perf.spec.ts` — Expected: pass (the feed now makes two more Data API requests per load; this confirms navigation stays within its ceilings).

- [ ] **Step 5: Full verification**

Run: `npm test` and `npm run build`. Expected: all unit tests pass; build succeeds.

- [ ] **Step 6: Update the handoff and commit**

In `docs/HANDOFF.md` §3, add a short "User feedback A" paragraph: spec and plan paths; salary = flag + expected amount on the income type, copied to entries, back-filled in open months; edit/delete routes and the closed-month rule; savings are dated additive versements entered from the panel's Épargne tab; `movement-edit.spec.ts` cleans up after itself. Update the unit-test count in §2 to what `npm test` reports.

```bash
git add tests/e2e/movement-edit.spec.ts docs/HANDOFF.md
git commit -m "test(e2e): salary, envelope-only expense, savings edit/delete; handoff notes for feedback A"
```

- [ ] **Step 7: Rollout reminder for the user**

Tell the user (in French) to flag their salary income type in Paramètres → Types de revenus and set "Montant prévu"; that fixes the current month's "Salaire reçu" immediately. Do not push to `main`/deploy without asking.
