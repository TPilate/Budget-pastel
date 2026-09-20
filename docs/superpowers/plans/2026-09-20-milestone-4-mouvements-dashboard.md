# Milestone 4: Mouvements & Tableau de bord Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Mouvements page (movements feed, filters/search, and the page-scoped `EntryPanel` that replaces the old mobile entry sheet) and rebuild the Tableau de bord placeholder into the full desktop dashboard, per the Figma redesign.

**Architecture:** Same server pattern as Milestones 1–3 — every route calls `requireUser()` first. Two new pure domain modules join `envelopeLedger.ts`: `movementsFeed.ts` (normalizes expense/income/transfer rows into one unified, sorted list) and `dashboardSummary.ts` (the salary/budget/50-30-20 math). DB-fetching glue that isn't pure business logic lives in `server/utils/*.ts` (not `domain/`), a pattern started in this milestone by extracting `server/api/envelopes/ceilings.get.ts`'s query loop into `server/utils/envelopeCeilingsQuery.ts` so both the ceilings endpoint and the new dashboard endpoint share it instead of duplicating the query. The existing `ExpenseForm`/`IncomeForm`/`TransferForm` components (Milestone 2) are reused as-is inside a new `EntryPanel`, extended with small `amount-change`/`envelope-change` emits so the panel's live "Après validation" preview can react to the in-progress draft without the forms knowing anything about the preview.

**Tech Stack:** Same as Milestones 1–3 (Nuxt 4, Nuxt UI, Tailwind v4 `@theme`, Drizzle, Zod, Vitest, Playwright). The donut chart is hand-rolled SVG (stacked `<circle>` arcs via `stroke-dasharray`/`stroke-dashoffset`) — no charting library, consistent with this project's YAGNI stance.

**Spec:** `docs/superpowers/specs/2026-09-20-desktop-web-redesign-design.md` §4.1 (Tableau de bord) and §4.3 (Mouvements). Also `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md` §7 for the underlying "reste à dépenser" / 50-30-20 formulas, which this plan's `dashboardSummary.ts` implements.

## Global Constraints

- Every new `server/api/*` route calls `requireUser(event)` before touching the database.
- No hardcoded hex colors in new Vue components — use Tailwind theme tokens (`ink`, `ink-muted`, `app-bg`, `toggle-track`, `divider`, `mint*`, `warn*`, `violet-bar`, `azure-bar`, `primary`, `primary-ink`).
- All ceiling/net-spent/remaining math goes through `computeEnvelopeLedger`; all reserve-envelope balance math goes through `computeReserveBalance` (new in this plan) — never re-derived inline in a route or component.
- "Current month" is always the server clock's current year/month, exactly like the existing `ceilings.get.ts` convention from Milestone 3 — no month-switcher query params yet (deferred, tracked in Milestone 3's ledger as a known follow-up).
- **Design decisions this plan makes that the spec left implicit** (documented here so no task re-derives them differently):
  - Mouvements' "Enveloppe" column: envelope name+emoji if the entry has one; else, for a fixed-category expense, the literal label "Charges fixes"; else the category's own name+emoji.
  - Mouvements' "Origine" column: `"Cadeau reçu"` / `"Cadeau offert"` for gift-financed expenses; the linked account's name for budget-financed expenses (falling back to `"—"` with no account); the fixed label `"Virement"` for income (the schema has no income "origin" field); the transfer's own `reason` field for transfers.
  - Transfer rows render as a single combined movement (not two), amount shown unsigned/neutral-colored; expense amounts negative/red; income amounts positive/green.
  - Dashboard "Salaire reçu"/"Épargne prévisionnelle" figures identify salary income by `income_types.name === 'Salaire'` (the seeded income type) — there's no dedicated `is_salary` flag in the schema.
  - Dashboard's reserve-envelope highlight card shows the first (by `sort_order`) active `kind = 'reserve'` envelope — currently only "Anniversaire et fêtes" exists in seed data, so this is equivalent to hardcoding that name without actually hardcoding it.

---

## File Structure

```
server/
  utils/
    domain/
      movementsFeed.ts                    (create)
      envelopeLedger.ts                   (modify: add computeReserveBalance)
      dashboardSummary.ts                 (create)
    movementsQuery.ts                     (create)
    envelopeCeilingsQuery.ts              (create — extracted from ceilings.get.ts)
    reserveEnvelopeQuery.ts               (create)
  api/
    movements/
      index.get.ts                        (create)
    envelopes/
      ceilings.get.ts                     (modify — thin wrapper over envelopeCeilingsQuery)
    savings-goals/
      index.get.ts                        (create)
    dashboard/
      summary.get.ts                      (create)
app/
  components/
    entry/
      ExpenseForm.vue                     (modify: add amount-change/envelope-change emits)
      IncomeForm.vue                      (modify: add amount-change/envelope-change emits)
      TransferForm.vue                    (modify: add amount-change/from-envelope-change/to-envelope-change emits)
      EntryPanel.vue                      (create)
    SidebarCeilingsWidget.vue             (modify: explicit useFetch key)
    dashboard/
      StatCard.vue                        (create)
      DonutChart.vue                      (create)
      EnvelopeCard.vue                    (create)
  pages/
    mouvements.vue                        (create)
    index.vue                             (rewrite)
tests/
  unit/
    server/
      utils/
        domain/
          movementsFeed.test.ts           (create)
          envelopeLedger.test.ts          (modify: add computeReserveBalance tests)
          dashboardSummary.test.ts        (create)
```

---

### Task 1: Movements feed domain module

**Files:**
- Create: `server/utils/domain/movementsFeed.ts`
- Test: `tests/unit/server/utils/domain/movementsFeed.test.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `buildMovementsFeed(input: { expenses: RawExpenseMovement[]; incomes: RawIncomeMovement[]; transfers: RawTransferMovement[] }): Movement[]` and the `Movement`/`RawExpenseMovement`/`RawIncomeMovement`/`RawTransferMovement` types — consumed by `server/utils/movementsQuery.ts` (Task 2) and, through it, both the Mouvements page and the dashboard summary route (Task 7).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/server/utils/domain/movementsFeed.test.ts
import { describe, it, expect } from 'vitest'
import { buildMovementsFeed } from '../../../../../server/utils/domain/movementsFeed'

describe('buildMovementsFeed', () => {
  it('maps a budget-financed expense with an envelope and account', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e1', date: '2026-09-13', label: 'Ramen Kodawari', amount: 28, financedBy: 'budget',
        envelopeName: 'Restaurants', envelopeEmoji: '🍽️',
        categoryName: 'Restaurants', categoryEmoji: '🍽️', categoryIsFixed: false,
        accountName: 'Compte courant',
      }],
      incomes: [],
      transfers: [],
    })
    expect(movement).toEqual({
      id: 'e1', type: 'expense', date: '2026-09-13', label: 'Ramen Kodawari',
      envelopeLabel: '🍽️ Restaurants', origin: 'Compte courant', amount: -28, sign: 'negative',
    })
  })

  it('labels a fixed-category expense with no envelope as "Charges fixes"', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e2', date: '2026-09-01', label: 'Loyer', amount: 620, financedBy: 'budget',
        envelopeName: null, envelopeEmoji: null,
        categoryName: 'Loyer', categoryEmoji: '🏠', categoryIsFixed: true,
        accountName: 'Compte courant',
      }],
      incomes: [],
      transfers: [],
    })
    expect(movement.envelopeLabel).toBe('Charges fixes')
  })

  it('falls back to the category name+emoji for a variable expense with no envelope', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e3', date: '2026-09-08', label: 'Courses', amount: 40, financedBy: 'budget',
        envelopeName: null, envelopeEmoji: null,
        categoryName: 'Courses', categoryEmoji: '🛒', categoryIsFixed: false,
        accountName: 'Compte courant',
      }],
      incomes: [],
      transfers: [],
    })
    expect(movement.envelopeLabel).toBe('🛒 Courses')
  })

  it('labels a gift-received expense origin as "Cadeau reçu" with no account', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e4', date: '2026-09-11', label: 'Sneakers', amount: 62, financedBy: 'gift_received',
        envelopeName: 'Anniversaire et fêtes', envelopeEmoji: '🎂',
        categoryName: 'Mode', categoryEmoji: '👗', categoryIsFixed: false,
        accountName: null,
      }],
      incomes: [],
      transfers: [],
    })
    expect(movement.origin).toBe('Cadeau reçu')
    expect(movement.amount).toBe(-62)
  })

  it('falls back to "—" for a budget expense with no account', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e5', date: '2026-09-08', label: 'Cash', amount: 10, financedBy: 'budget',
        envelopeName: null, envelopeEmoji: null,
        categoryName: 'Courses', categoryEmoji: '🛒', categoryIsFixed: false,
        accountName: null,
      }],
      incomes: [],
      transfers: [],
    })
    expect(movement.origin).toBe('—')
  })

  it('maps an income with a target envelope as a positive, green movement', () => {
    const [movement] = buildMovementsFeed({
      expenses: [],
      incomes: [{
        id: 'i1', date: '2026-09-14', label: 'Remboursement Claire', amount: 18,
        envelopeName: 'Restaurants', envelopeEmoji: '🍽️',
      }],
      transfers: [],
    })
    expect(movement).toEqual({
      id: 'i1', type: 'income', date: '2026-09-14', label: 'Remboursement Claire',
      envelopeLabel: '🍽️ Restaurants', origin: 'Virement', amount: 18, sign: 'positive',
    })
  })

  it('maps a transfer as one neutral movement combining both envelopes', () => {
    const [movement] = buildMovementsFeed({
      expenses: [],
      incomes: [],
      transfers: [{
        id: 't1', date: '2026-09-19', reason: 'rééquilibrage', amount: 20,
        fromEnvelopeName: 'Mode', toEnvelopeName: 'Restaurants',
      }],
    })
    expect(movement).toEqual({
      id: 't1', type: 'transfer', date: '2026-09-19', label: 'Transfert Mode → Restaurants',
      envelopeLabel: '⇄ deux enveloppes', origin: 'rééquilibrage', amount: 20, sign: 'neutral',
    })
  })

  it('sorts all movements by date descending, mixing types', () => {
    const movements = buildMovementsFeed({
      expenses: [{
        id: 'e1', date: '2026-09-01', label: 'Loyer', amount: 620, financedBy: 'budget',
        envelopeName: null, envelopeEmoji: null, categoryName: 'Loyer', categoryEmoji: '🏠',
        categoryIsFixed: true, accountName: 'Compte courant',
      }],
      incomes: [{
        id: 'i1', date: '2026-09-14', label: 'Remboursement Claire', amount: 18,
        envelopeName: null, envelopeEmoji: null,
      }],
      transfers: [{
        id: 't1', date: '2026-09-19', reason: 'rééquilibrage', amount: 20,
        fromEnvelopeName: 'Mode', toEnvelopeName: 'Restaurants',
      }],
    })
    expect(movements.map((m) => m.id)).toEqual(['t1', 'i1', 'e1'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/server/utils/domain/movementsFeed.test.ts`
Expected: FAIL — `Cannot find module '../../../../../server/utils/domain/movementsFeed'`.

- [ ] **Step 3: Write `server/utils/domain/movementsFeed.ts`**

```ts
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
}

export interface RawIncomeMovement {
  id: string
  date: string
  label: string
  amount: number
  envelopeName: string | null
  envelopeEmoji: string | null
}

export interface RawTransferMovement {
  id: string
  date: string
  reason: string
  amount: number
  fromEnvelopeName: string
  toEnvelopeName: string
}

export interface Movement {
  id: string
  type: 'expense' | 'income' | 'transfer'
  date: string
  label: string
  envelopeLabel: string
  origin: string
  amount: number
  sign: 'negative' | 'positive' | 'neutral'
}

export function buildMovementsFeed(input: {
  expenses: RawExpenseMovement[]
  incomes: RawIncomeMovement[]
  transfers: RawTransferMovement[]
}): Movement[] {
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
  }))

  return [...expenseMovements, ...incomeMovements, ...transferMovements]
    .sort((a, b) => b.date.localeCompare(a.date))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/utils/domain/movementsFeed.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/domain/movementsFeed.ts tests/unit/server/utils/domain/movementsFeed.test.ts
git commit -m "feat: add movements feed domain module"
```

---

### Task 2: Movements query + API endpoint

**Files:**
- Create: `server/utils/movementsQuery.ts`
- Create: `server/api/movements/index.get.ts`

**Interfaces:**
- Consumes: `buildMovementsFeed` and its types (Task 1); `requireUser`, `db`; `expenseEntries`/`incomeEntries`/`transfers`/`categories`/`accounts`/`envelopes` tables.
- Produces: `fetchMovements(year: number, month: number): Promise<Movement[]>` — consumed by `server/api/movements/index.get.ts` (this task) and by the dashboard summary route (Task 7). `GET /api/movements` → `Movement[]` for the current month — consumed by the Mouvements page (Task 3).

- [ ] **Step 1: Write `server/utils/movementsQuery.ts`**

```ts
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { expenseEntries, incomeEntries, transfers, categories, accounts, envelopes } from '../../drizzle/schema'
import { buildMovementsFeed } from './domain/movementsFeed'
import type { Movement } from './domain/movementsFeed'

export async function fetchMovements(year: number, month: number): Promise<Movement[]> {
  const [expenseRows, incomeRows, transferRows, categoryRows, accountRows, envelopeRows] = await Promise.all([
    db.select().from(expenseEntries).where(and(eq(expenseEntries.yearAssigned, year), eq(expenseEntries.monthAssigned, month))),
    db.select().from(incomeEntries).where(and(eq(incomeEntries.yearAssigned, year), eq(incomeEntries.monthAssigned, month))),
    db.select().from(transfers).where(and(eq(transfers.yearAssigned, year), eq(transfers.monthAssigned, month))),
    db.select().from(categories),
    db.select().from(accounts),
    db.select().from(envelopes),
  ])

  const categoryById = new Map(categoryRows.map((row) => [row.id, row]))
  const accountById = new Map(accountRows.map((row) => [row.id, row]))
  const envelopeById = new Map(envelopeRows.map((row) => [row.id, row]))

  const expenses = expenseRows.map((row) => {
    const category = categoryById.get(row.categoryId)!
    const envelope = row.envelopeId ? envelopeById.get(row.envelopeId) : undefined
    const account = row.accountId ? accountById.get(row.accountId) : undefined
    return {
      id: row.id,
      date: row.date,
      label: row.label,
      amount: Number(row.amount),
      financedBy: row.financedBy,
      envelopeName: envelope?.name ?? null,
      envelopeEmoji: envelope?.emoji ?? null,
      categoryName: category.name,
      categoryEmoji: category.emoji,
      categoryIsFixed: category.isFixed,
      accountName: account?.name ?? null,
    }
  })

  const incomes = incomeRows.map((row) => {
    const envelope = row.targetEnvelopeId ? envelopeById.get(row.targetEnvelopeId) : undefined
    return {
      id: row.id,
      date: row.dateReceived,
      label: row.label,
      amount: Number(row.amount),
      envelopeName: envelope?.name ?? null,
      envelopeEmoji: envelope?.emoji ?? null,
    }
  })

  const transferMovements = transferRows.map((row) => ({
    id: row.id,
    date: row.date,
    reason: row.reason,
    amount: Number(row.amount),
    fromEnvelopeName: envelopeById.get(row.fromEnvelopeId)?.name ?? '?',
    toEnvelopeName: envelopeById.get(row.toEnvelopeId)?.name ?? '?',
  }))

  return buildMovementsFeed({ expenses, incomes, transfers: transferMovements })
}
```

- [ ] **Step 2: Write `server/api/movements/index.get.ts`**

```ts
import { requireUser } from '../../utils/auth'
import { fetchMovements } from '../../utils/movementsQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return fetchMovements(now.getFullYear(), now.getMonth() + 1)
})
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 4: Manually verify against the real API**

Requires a working `DATABASE_URL` with migrations applied and reference data seeded. Run `npm run dev`, log in, and `curl` `/api/movements` with a session cookie. Expected: an array (empty if no entries exist yet this month, or populated if you add a test expense via Paramètres → an entry form isn't built yet at this point in the plan, so an empty array is an acceptable first check — Task 4 gives you a way to add real entries to re-verify against).

If no real database is reachable, run `npx tsc --noEmit server/utils/movementsQuery.ts server/api/movements/index.get.ts` to confirm type correctness, and note in your report that live verification is pending a real database connection.

- [ ] **Step 5: Commit**

```bash
git add server/utils/movementsQuery.ts server/api/movements/index.get.ts
git commit -m "feat: add movements query and API endpoint"
```

---

### Task 3: Mouvements page (read-only table)

**Files:**
- Create: `app/pages/mouvements.vue`

**Interfaces:**
- Consumes: `GET /api/movements` (Task 2).
- Produces: the `/mouvements` route with a working filtered/searchable table — Task 4 restructures this page's template to add the `EntryPanel` in a second column; nothing from this task's internals is consumed elsewhere by name.

- [ ] **Step 1: Write `app/pages/mouvements.vue`**

```vue
<script setup lang="ts">
interface Movement {
  id: string
  type: 'expense' | 'income' | 'transfer'
  date: string
  label: string
  envelopeLabel: string
  origin: string
  amount: number
  sign: 'negative' | 'positive' | 'neutral'
}

const { data } = await useFetch<Movement[]>('/api/movements', { key: 'movements-feed' })

const activeFilter = ref<'all' | 'expense' | 'income' | 'transfer'>('all')
const searchText = ref('')

const filterOptions = [
  { value: 'all', label: 'Tous' },
  { value: 'expense', label: 'Sorties' },
  { value: 'income', label: 'Entrées' },
  { value: 'transfer', label: 'Transferts' },
]

const filteredMovements = computed(() => {
  const movements = data.value ?? []
  const query = searchText.value.trim().toLowerCase()
  return movements
    .filter((movement) => activeFilter.value === 'all' || movement.type === activeFilter.value)
    .filter((movement) => !query || movement.label.toLowerCase().includes(query))
})

function formatAmount(movement: Movement) {
  const formatted = `${Math.abs(movement.amount).toFixed(2).replace('.', ',')} €`
  if (movement.sign === 'negative') return `-${formatted}`
  if (movement.sign === 'positive') return `+${formatted}`
  return formatted
}

function amountColorClass(movement: Movement) {
  if (movement.sign === 'negative') return 'text-warn-ink'
  if (movement.sign === 'positive') return 'text-mint-ink'
  return 'text-ink'
}

function formatDate(isoDate: string) {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Mouvements">
      <template #context>
        <div class="flex gap-1 rounded-[12px] bg-toggle-track p-1">
          <button
            v-for="option in filterOptions"
            :key="option.value"
            type="button"
            class="rounded-[9px] px-3 py-1.5 text-[12.5px] font-bold"
            :class="activeFilter === option.value ? 'bg-white text-ink' : 'text-ink-muted'"
            @click="activeFilter = option.value as typeof activeFilter"
          >
            {{ option.label }}
          </button>
        </div>
      </template>
      <template #actions>
        <input
          v-model="searchText"
          type="search"
          placeholder="Rechercher un mouvement…"
          class="rounded-[12px] border border-divider bg-white px-3 py-2 text-[12.5px]"
        >
      </template>
    </PageHeader>

    <div class="rounded-[22px] bg-white p-4">
      <table class="w-full text-left text-[12.5px]">
        <thead>
          <tr class="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
            <th class="pb-2">Date</th>
            <th class="pb-2">Libellé</th>
            <th class="pb-2">Enveloppe</th>
            <th class="pb-2">Origine</th>
            <th class="pb-2 text-right">Montant</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="movement in filteredMovements" :key="movement.id" class="border-t border-divider">
            <td class="py-2.5 text-ink-muted">{{ formatDate(movement.date) }}</td>
            <td class="py-2.5 font-semibold text-ink">{{ movement.label }}</td>
            <td class="py-2.5 text-ink-muted">{{ movement.envelopeLabel }}</td>
            <td class="py-2.5 text-ink-muted">{{ movement.origin }}</td>
            <td class="py-2.5 text-right font-bold" :class="amountColorClass(movement)">{{ formatAmount(movement) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="filteredMovements.length === 0" class="py-6 text-center text-[12.5px] font-medium text-ink-muted">
        Aucun mouvement ce mois-ci.
      </p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 3: Commit**

```bash
git add app/pages/mouvements.vue
git commit -m "feat: add Mouvements page with filterable/searchable table"
```

---

### Task 4: EntryPanel — page-scoped entry form host with live preview

**Files:**
- Modify: `app/components/entry/ExpenseForm.vue`
- Modify: `app/components/entry/IncomeForm.vue`
- Modify: `app/components/entry/TransferForm.vue`
- Modify: `app/components/SidebarCeilingsWidget.vue`
- Create: `app/components/entry/EntryPanel.vue`
- Modify: `app/pages/mouvements.vue`

**Interfaces:**
- Consumes: `GET /api/envelopes/ceilings` (Milestone 3); `ExpenseForm`/`IncomeForm`/`TransferForm`'s new emits (this task); `SegmentedToggle` (Milestone 2).
- Produces: `<EntryPanel @saved="...">` — mounted by the Mouvements page (this task). `ExpenseForm`/`IncomeForm`/`TransferForm` now also emit `'amount-change': [number]` and `'envelope-change': [string]` (`TransferForm` emits `'from-envelope-change'`/`'to-envelope-change'` instead of a single `'envelope-change'`).

- [ ] **Step 1: Add emits to `ExpenseForm.vue`**

In `app/components/entry/ExpenseForm.vue`, replace the `defineEmits` line and add two `watch` calls right after the existing `ref`/`computed` declarations (after the `reserveEnvelope` computed, before `errorMessage`):

```ts
const emit = defineEmits<{ saved: []; 'amount-change': [number]; 'envelope-change': [string] }>()
```

```ts
watch(amount, (value) => emit('amount-change', value))
watch(envelopeId, (value) => emit('envelope-change', value))
```

- [ ] **Step 2: Add emits to `IncomeForm.vue`**

In `app/components/entry/IncomeForm.vue`, replace the `defineEmits` line and add two `watch` calls right after `selectedIncomeType` (before `errorMessage`):

```ts
const emit = defineEmits<{ saved: []; 'amount-change': [number]; 'envelope-change': [string] }>()
```

```ts
watch(amount, (value) => emit('amount-change', value))
watch(targetEnvelopeId, (value) => emit('envelope-change', value))
```

- [ ] **Step 3: Add emits to `TransferForm.vue`**

In `app/components/entry/TransferForm.vue`, replace the `defineEmits` line and add three `watch` calls right after `reason` (before `errorMessage`):

```ts
const emit = defineEmits<{ saved: []; 'amount-change': [number]; 'from-envelope-change': [string]; 'to-envelope-change': [string] }>()
```

```ts
watch(amount, (value) => emit('amount-change', value))
watch(fromEnvelopeId, (value) => emit('from-envelope-change', value))
watch(toEnvelopeId, (value) => emit('to-envelope-change', value))
```

- [ ] **Step 4: Add an explicit fetch key to `SidebarCeilingsWidget.vue`**

In `app/components/SidebarCeilingsWidget.vue`, change the `useFetch` call from:

```ts
const { data, error, pending } = await useFetch<EnvelopeCeiling[]>('/api/envelopes/ceilings')
```

to:

```ts
const { data, error, pending } = await useFetch<EnvelopeCeiling[]>('/api/envelopes/ceilings', { key: 'envelope-ceilings' })
```

(Only the `useFetch` call changes — everything else in the file stays as-is.)

- [ ] **Step 5: Write `app/components/entry/EntryPanel.vue`**

```vue
<script setup lang="ts">
interface EnvelopeCeiling {
  id: string
  name: string
  emoji: string
  ceiling: number
  netSpent: number
  remaining: number
}

const emit = defineEmits<{ saved: [] }>()

const mode = ref<'expense' | 'income' | 'transfer'>('expense')

const modeOptions = [
  { value: 'expense', label: '− Sortie' },
  { value: 'income', label: '+ Entrée' },
  { value: 'transfer', label: '⇄ Transfert' },
]

const { data: ceilingsData } = await useFetch<EnvelopeCeiling[]>('/api/envelopes/ceilings', { key: 'envelope-ceilings' })
const ceilingsById = computed(() => new Map((ceilingsData.value ?? []).map((envelope) => [envelope.id, envelope])))

const draftAmount = ref(0)
const draftExpenseEnvelopeId = ref('')
const draftIncomeEnvelopeId = ref('')
const draftTransferFromId = ref('')
const draftTransferToId = ref('')

interface PreviewLine {
  label: string
  before: number
  after: number
  suffix: string
}

const previewLines = computed<PreviewLine[]>(() => {
  if (mode.value === 'transfer') {
    const from = ceilingsById.value.get(draftTransferFromId.value)
    const to = ceilingsById.value.get(draftTransferToId.value)
    if (!from || !to || draftAmount.value <= 0) return []
    return [
      { label: `Retirer à ${from.emoji} ${from.name}`, before: from.ceiling, after: from.ceiling - draftAmount.value, suffix: 'plafond' },
      { label: `Ajouter à ${to.emoji} ${to.name}`, before: to.ceiling, after: to.ceiling + draftAmount.value, suffix: 'plafond' },
    ]
  }

  const envelopeId = mode.value === 'expense' ? draftExpenseEnvelopeId.value : draftIncomeEnvelopeId.value
  const envelope = ceilingsById.value.get(envelopeId)
  if (!envelope || draftAmount.value <= 0) return []

  const delta = mode.value === 'expense' ? -draftAmount.value : draftAmount.value
  return [{ label: `${envelope.emoji} ${envelope.name}`, before: envelope.remaining, after: envelope.remaining + delta, suffix: 'restant' }]
})

function formatEuro(value: number) {
  return `${value.toFixed(2).replace('.', ',')} €`
}

function handleSaved() {
  refreshNuxtData('movements-feed')
  refreshNuxtData('envelope-ceilings')
  draftAmount.value = 0
  emit('saved')
}
</script>

<template>
  <div class="flex flex-col gap-4 rounded-[22px] bg-white p-5">
    <p class="text-[15px] font-extrabold text-ink">Nouvelle saisie</p>

    <SegmentedToggle :options="modeOptions" :model-value="mode" @update:model-value="mode = $event as typeof mode" />

    <ExpenseForm
      v-if="mode === 'expense'"
      @saved="handleSaved"
      @amount-change="draftAmount = $event"
      @envelope-change="draftExpenseEnvelopeId = $event"
    />
    <IncomeForm
      v-else-if="mode === 'income'"
      @saved="handleSaved"
      @amount-change="draftAmount = $event"
      @envelope-change="draftIncomeEnvelopeId = $event"
    />
    <TransferForm
      v-else
      @saved="handleSaved"
      @amount-change="draftAmount = $event"
      @from-envelope-change="draftTransferFromId = $event"
      @to-envelope-change="draftTransferToId = $event"
    />

    <div v-if="previewLines.length" class="rounded-[16px] bg-app-bg p-3">
      <p class="text-[11px] font-bold text-ink">Après validation</p>
      <div v-for="line in previewLines" :key="line.label" class="mt-1 flex items-center justify-between text-[11.5px]">
        <span class="font-semibold text-ink-muted">{{ line.label }}</span>
        <span class="font-bold text-ink">{{ formatEuro(line.before) }} → {{ formatEuro(line.after) }} {{ line.suffix }}</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 6: Restructure `app/pages/mouvements.vue` into a two-column layout**

Replace the file's `<template>` block (script stays the same) with:

```vue
<template>
  <div class="grid grid-cols-[1fr_360px] gap-5">
    <div class="flex flex-col gap-5">
      <PageHeader title="Mouvements">
        <template #context>
          <div class="flex gap-1 rounded-[12px] bg-toggle-track p-1">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              class="rounded-[9px] px-3 py-1.5 text-[12.5px] font-bold"
              :class="activeFilter === option.value ? 'bg-white text-ink' : 'text-ink-muted'"
              @click="activeFilter = option.value as typeof activeFilter"
            >
              {{ option.label }}
            </button>
          </div>
        </template>
        <template #actions>
          <input
            v-model="searchText"
            type="search"
            placeholder="Rechercher un mouvement…"
            class="rounded-[12px] border border-divider bg-white px-3 py-2 text-[12.5px]"
          >
        </template>
      </PageHeader>

      <div class="rounded-[22px] bg-white p-4">
        <table class="w-full text-left text-[12.5px]">
          <thead>
            <tr class="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
              <th class="pb-2">Date</th>
              <th class="pb-2">Libellé</th>
              <th class="pb-2">Enveloppe</th>
              <th class="pb-2">Origine</th>
              <th class="pb-2 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="movement in filteredMovements" :key="movement.id" class="border-t border-divider">
              <td class="py-2.5 text-ink-muted">{{ formatDate(movement.date) }}</td>
              <td class="py-2.5 font-semibold text-ink">{{ movement.label }}</td>
              <td class="py-2.5 text-ink-muted">{{ movement.envelopeLabel }}</td>
              <td class="py-2.5 text-ink-muted">{{ movement.origin }}</td>
              <td class="py-2.5 text-right font-bold" :class="amountColorClass(movement)">{{ formatAmount(movement) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="filteredMovements.length === 0" class="py-6 text-center text-[12.5px] font-medium text-ink-muted">
          Aucun mouvement ce mois-ci.
        </p>
      </div>
    </div>

    <EntryPanel />
  </div>
</template>
```

- [ ] **Step 7: Build to verify everything compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 8: Run the unit suite (regression check)**

Run: `npx vitest run`
Expected: PASS — this task doesn't touch unit-tested logic, this confirms nothing else broke.

- [ ] **Step 9: Manually verify in the browser**

Run `npm run dev`, log in, navigate to `/mouvements`. Confirm: the entry panel renders on the right with the Sortie/Entrée/Transfert toggle; typing an amount and picking an envelope in the Sortie tab shows an "Après validation" line; switching to Transfert and picking two different envelopes shows two preview lines (plafond before → after); submitting a valid entry clears the panel's amount and the movements table refreshes with the new row without a page reload; the sidebar's Plafonds widget numbers update too.

- [ ] **Step 10: Commit**

```bash
git add app/components/entry/ExpenseForm.vue app/components/entry/IncomeForm.vue app/components/entry/TransferForm.vue app/components/entry/EntryPanel.vue app/components/SidebarCeilingsWidget.vue app/pages/mouvements.vue
git commit -m "feat: add page-scoped EntryPanel with live après-validation preview"
```

---

### Task 5: Extract envelope-ledger query + add reserve-balance domain function

**Files:**
- Modify: `server/utils/domain/envelopeLedger.ts`
- Modify: `tests/unit/server/utils/domain/envelopeLedger.test.ts`
- Create: `server/utils/envelopeCeilingsQuery.ts`
- Create: `server/utils/reserveEnvelopeQuery.ts`
- Modify: `server/api/envelopes/ceilings.get.ts`

**Interfaces:**
- Consumes: existing `computeEnvelopeLedger` (Milestone 3); `db`; `envelopes`/`monthlyEnvelopeAllocations`/`expenseEntries`/`incomeEntries`/`transfers` tables.
- Produces: `computeReserveBalance(incomeCreditsTotal: number, expensesTotal: number): number` (added to `envelopeLedger.ts`). `listBudgetEnvelopeLedgers(year: number, month: number): Promise<BudgetEnvelopeLedger[]>` where `BudgetEnvelopeLedger` is `{ id, name, emoji, showOnHome, ceiling, netSpent, remaining }` — consumed by `ceilings.get.ts` (this task) and the dashboard summary route (Task 7). `getPrimaryReserveEnvelopeBalance(): Promise<ReserveEnvelopeBalance | null>` where `ReserveEnvelopeBalance` is `{ id, name, emoji, balance, incomeCreditsTotal, expensesTotal }` — consumed by the dashboard summary route (Task 7).

- [ ] **Step 1: Write the failing test for `computeReserveBalance`**

Append to `tests/unit/server/utils/domain/envelopeLedger.test.ts` (a new `describe` block, after the existing `computeEnvelopeLedger` one):

```ts
describe('computeReserveBalance', () => {
  it('is income credits minus expenses', () => {
    expect(computeReserveBalance(150, 62)).toBe(88)
  })

  it('can go negative if expenses exceed income credits', () => {
    expect(computeReserveBalance(50, 80)).toBe(-30)
  })

  it('is zero with no activity', () => {
    expect(computeReserveBalance(0, 0)).toBe(0)
  })
})
```

Also update the file's import line to include the new function:

```ts
import { computeEnvelopeLedger, computeReserveBalance } from '../../../../../server/utils/domain/envelopeLedger'
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/unit/server/utils/domain/envelopeLedger.test.ts`
Expected: FAIL — `computeReserveBalance is not a function` (the 5 pre-existing tests still pass).

- [ ] **Step 3: Add `computeReserveBalance` to `server/utils/domain/envelopeLedger.ts`**

Append to the end of the file:

```ts
export function computeReserveBalance(incomeCreditsTotal: number, expensesTotal: number): number {
  return incomeCreditsTotal - expensesTotal
}
```

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `npx vitest run tests/unit/server/utils/domain/envelopeLedger.test.ts`
Expected: PASS (8 tests: 5 existing + 3 new).

- [ ] **Step 5: Write `server/utils/envelopeCeilingsQuery.ts`**

This is the query loop currently inline in `server/api/envelopes/ceilings.get.ts`, extracted verbatim with one addition (`showOnHome` is now selected and returned):

```ts
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { envelopes, monthlyEnvelopeAllocations, expenseEntries, incomeEntries, transfers } from '../../drizzle/schema'
import { computeEnvelopeLedger } from './domain/envelopeLedger'

export interface BudgetEnvelopeLedger {
  id: string
  name: string
  emoji: string
  showOnHome: boolean
  ceiling: number
  netSpent: number
  remaining: number
}

export async function listBudgetEnvelopeLedgers(year: number, month: number): Promise<BudgetEnvelopeLedger[]> {
  const budgetEnvelopes = await db
    .select()
    .from(envelopes)
    .where(and(eq(envelopes.kind, 'budget'), isNull(envelopes.archivedAt)))
    .orderBy(asc(envelopes.sortOrder))

  const results: BudgetEnvelopeLedger[] = []

  for (const envelope of budgetEnvelopes) {
    const [allocation] = await db
      .select()
      .from(monthlyEnvelopeAllocations)
      .where(and(
        eq(monthlyEnvelopeAllocations.envelopeId, envelope.id),
        eq(monthlyEnvelopeAllocations.year, year),
        eq(monthlyEnvelopeAllocations.month, month),
      ))

    const expenses = await db
      .select()
      .from(expenseEntries)
      .where(and(
        eq(expenseEntries.envelopeId, envelope.id),
        eq(expenseEntries.yearAssigned, year),
        eq(expenseEntries.monthAssigned, month),
      ))

    const incomeCredits = await db
      .select()
      .from(incomeEntries)
      .where(and(
        eq(incomeEntries.targetEnvelopeId, envelope.id),
        eq(incomeEntries.yearAssigned, year),
        eq(incomeEntries.monthAssigned, month),
      ))

    const transfersIn = await db
      .select()
      .from(transfers)
      .where(and(
        eq(transfers.toEnvelopeId, envelope.id),
        eq(transfers.yearAssigned, year),
        eq(transfers.monthAssigned, month),
      ))

    const transfersOut = await db
      .select()
      .from(transfers)
      .where(and(
        eq(transfers.fromEnvelopeId, envelope.id),
        eq(transfers.yearAssigned, year),
        eq(transfers.monthAssigned, month),
      ))

    const ledger = computeEnvelopeLedger({
      defaultCeiling: Number(envelope.defaultCeiling ?? 0),
      allocation: allocation
        ? {
            baseCeiling: Number(allocation.baseCeiling),
            carriedOverAmount: Number(allocation.carriedOverAmount),
            overspendDeduction: Number(allocation.overspendDeduction),
          }
        : null,
      transfersIn: transfersIn.reduce((sum, row) => sum + Number(row.amount), 0),
      transfersOut: transfersOut.reduce((sum, row) => sum + Number(row.amount), 0),
      expensesTotal: expenses.reduce((sum, row) => sum + Number(row.amount), 0),
      incomeCreditsTotal: incomeCredits.reduce((sum, row) => sum + Number(row.amount), 0),
    })

    results.push({
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      showOnHome: envelope.showOnHome,
      ...ledger,
    })
  }

  return results
}
```

- [ ] **Step 6: Write `server/utils/reserveEnvelopeQuery.ts`**

```ts
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { envelopes, expenseEntries, incomeEntries } from '../../drizzle/schema'
import { computeReserveBalance } from './domain/envelopeLedger'

export interface ReserveEnvelopeBalance {
  id: string
  name: string
  emoji: string
  balance: number
  incomeCreditsTotal: number
  expensesTotal: number
}

export async function getPrimaryReserveEnvelopeBalance(): Promise<ReserveEnvelopeBalance | null> {
  const [reserveEnvelope] = await db
    .select()
    .from(envelopes)
    .where(and(eq(envelopes.kind, 'reserve'), isNull(envelopes.archivedAt)))
    .orderBy(asc(envelopes.sortOrder))
    .limit(1)

  if (!reserveEnvelope) return null

  const expenses = await db.select().from(expenseEntries).where(eq(expenseEntries.envelopeId, reserveEnvelope.id))
  const incomeCredits = await db.select().from(incomeEntries).where(eq(incomeEntries.targetEnvelopeId, reserveEnvelope.id))

  const expensesTotal = expenses.reduce((sum, row) => sum + Number(row.amount), 0)
  const incomeCreditsTotal = incomeCredits.reduce((sum, row) => sum + Number(row.amount), 0)

  return {
    id: reserveEnvelope.id,
    name: reserveEnvelope.name,
    emoji: reserveEnvelope.emoji,
    balance: computeReserveBalance(incomeCreditsTotal, expensesTotal),
    incomeCreditsTotal,
    expensesTotal,
  }
}
```

- [ ] **Step 7: Rewrite `server/api/envelopes/ceilings.get.ts` as a thin wrapper**

```ts
import { requireUser } from '../../utils/auth'
import { listBudgetEnvelopeLedgers } from '../../utils/envelopeCeilingsQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return listBudgetEnvelopeLedgers(now.getFullYear(), now.getMonth() + 1)
})
```

- [ ] **Step 8: Build and run the full unit suite**

Run: `npm run build && npx vitest run`
Expected: build succeeds; all unit tests pass (this is a regression-sensitive refactor of an existing, already-shipped endpoint — the response shape only gains one field, `showOnHome`, it does not lose or rename anything `SidebarCeilingsWidget.vue` or `EntryPanel.vue` already rely on).

- [ ] **Step 9: Commit**

```bash
git add server/utils/domain/envelopeLedger.ts tests/unit/server/utils/domain/envelopeLedger.test.ts server/utils/envelopeCeilingsQuery.ts server/utils/reserveEnvelopeQuery.ts server/api/envelopes/ceilings.get.ts
git commit -m "refactor: extract envelope ceilings query, add reserve balance domain function"
```

---

### Task 6: Dashboard summary domain module

**Files:**
- Create: `server/utils/domain/dashboardSummary.ts`
- Test: `tests/unit/server/utils/domain/dashboardSummary.test.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `computeDashboardSummary(inputs: DashboardSummaryInputs): DashboardSummaryResult` — consumed by the dashboard summary route (Task 7).

- [ ] **Step 1: Write the failing tests**

These use the exact figures from the Figma mockup's "Septembre 2026" dashboard screen, so the expected outputs below are the real, verified numbers shown there (cross-checked: `861+424+318 = 1603` also matches the mockup's "Sorties 1 603,00 €" total on the Mouvements screen).

```ts
// tests/unit/server/utils/domain/dashboardSummary.test.ts
import { describe, it, expect } from 'vitest'
import { computeDashboardSummary } from '../../../../../server/utils/domain/dashboardSummary'

describe('computeDashboardSummary', () => {
  const mockupInputs = {
    salaryReceived: 2316,
    salaryExpected: 2300,
    fixedChargesTotal: 861,
    variableChargesTotal: 318,
    envelopeSpendTotal: 424,
    savingsVersedTotal: 345,
    joursRestants: 11,
  }

  it('matches the Figma mockup figures exactly', () => {
    const result = computeDashboardSummary(mockupInputs)

    expect(result.budgetDuMois).toBe(1971)
    expect(result.totalSpent).toBe(1603)
    expect(result.resteADepenser).toBe(368)
    expect(result.resteADepenserParJour).toBeCloseTo(33.45, 2)
    expect(result.salaryVsExpected).toBe(16)
    expect(result.usagePercent).toBe(84)
  })

  it('computes the breakdown amounts and percentages matching the mockup legend', () => {
    const result = computeDashboardSummary(mockupInputs)

    expect(result.breakdown.fixedCharges).toEqual({ amount: 861, percent: 37 })
    expect(result.breakdown.envelopes).toEqual({ amount: 424, percent: 18 })
    expect(result.breakdown.variable).toEqual({ amount: 318, percent: 14 })
    expect(result.breakdown.savings).toEqual({ amount: 345, percent: 15 })
    expect(result.breakdown.unspent).toEqual({ amount: 368, percent: 16 })
  })

  it('returns zero percentages when no salary has been received yet', () => {
    const result = computeDashboardSummary({
      salaryReceived: 0,
      salaryExpected: 2300,
      fixedChargesTotal: 0,
      variableChargesTotal: 0,
      envelopeSpendTotal: 0,
      savingsVersedTotal: 0,
      joursRestants: 20,
    })

    expect(result.usagePercent).toBe(0)
    expect(result.breakdown.fixedCharges.percent).toBe(0)
    expect(result.salaryVsExpected).toBe(-2300)
  })

  it('falls back to the raw remaining amount when no days remain in the month', () => {
    const result = computeDashboardSummary({ ...mockupInputs, joursRestants: 0 })
    expect(result.resteADepenserParJour).toBe(result.resteADepenser)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/server/utils/domain/dashboardSummary.test.ts`
Expected: FAIL — `Cannot find module '../../../../../server/utils/domain/dashboardSummary'`.

- [ ] **Step 3: Write `server/utils/domain/dashboardSummary.ts`**

```ts
export interface DashboardSummaryInputs {
  salaryReceived: number
  salaryExpected: number
  fixedChargesTotal: number
  variableChargesTotal: number
  envelopeSpendTotal: number
  savingsVersedTotal: number
  joursRestants: number
}

export interface DashboardSummaryBreakdownEntry {
  amount: number
  percent: number
}

export interface DashboardSummaryResult {
  budgetDuMois: number
  totalSpent: number
  resteADepenser: number
  resteADepenserParJour: number
  salaryVsExpected: number
  usagePercent: number
  breakdown: {
    fixedCharges: DashboardSummaryBreakdownEntry
    envelopes: DashboardSummaryBreakdownEntry
    variable: DashboardSummaryBreakdownEntry
    savings: DashboardSummaryBreakdownEntry
    unspent: DashboardSummaryBreakdownEntry
  }
}

export function computeDashboardSummary(inputs: DashboardSummaryInputs): DashboardSummaryResult {
  const budgetDuMois = inputs.salaryReceived - inputs.savingsVersedTotal
  const totalSpent = inputs.fixedChargesTotal + inputs.variableChargesTotal + inputs.envelopeSpendTotal
  const resteADepenser = budgetDuMois - totalSpent
  const resteADepenserParJour = inputs.joursRestants > 0 ? resteADepenser / inputs.joursRestants : resteADepenser
  const salaryVsExpected = inputs.salaryReceived - inputs.salaryExpected

  const percentOf = (amount: number) =>
    inputs.salaryReceived > 0 ? Math.round((amount / inputs.salaryReceived) * 100) : 0

  const usagePercent = inputs.salaryReceived > 0
    ? Math.round(((totalSpent + inputs.savingsVersedTotal) / inputs.salaryReceived) * 100)
    : 0

  return {
    budgetDuMois,
    totalSpent,
    resteADepenser,
    resteADepenserParJour,
    salaryVsExpected,
    usagePercent,
    breakdown: {
      fixedCharges: { amount: inputs.fixedChargesTotal, percent: percentOf(inputs.fixedChargesTotal) },
      envelopes: { amount: inputs.envelopeSpendTotal, percent: percentOf(inputs.envelopeSpendTotal) },
      variable: { amount: inputs.variableChargesTotal, percent: percentOf(inputs.variableChargesTotal) },
      savings: { amount: inputs.savingsVersedTotal, percent: percentOf(inputs.savingsVersedTotal) },
      unspent: { amount: resteADepenser, percent: percentOf(resteADepenser) },
    },
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/utils/domain/dashboardSummary.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/domain/dashboardSummary.ts tests/unit/server/utils/domain/dashboardSummary.test.ts
git commit -m "feat: add dashboard summary domain module"
```

---

### Task 7: Savings goals route + dashboard summary API endpoint

**Files:**
- Create: `server/api/savings-goals/index.get.ts`
- Create: `server/api/dashboard/summary.get.ts`

**Interfaces:**
- Consumes: `listBudgetEnvelopeLedgers`, `getPrimaryReserveEnvelopeBalance` (Task 5); `fetchMovements` (Task 2); `computeDashboardSummary` (Task 6); `db`; `incomeEntries`/`incomeTypes`/`expenseEntries`/`categories`/`savingsEntries`/`savingsGoals` tables.
- Produces: `GET /api/savings-goals` → `{ id, name, receivesSalaryVariance, sortOrder }[]`. `GET /api/dashboard/summary` → `{ monthLabel: string, joursRestants: number, salaryReceived: number, summary: DashboardSummaryResult, homeEnvelopes: BudgetEnvelopeLedger[], envelopesTotalCeiling: number, savingsGoals: { id, name, amount }[], savingsTotal: number, reserveEnvelope: ReserveEnvelopeBalance | null, recentMovements: Movement[] }` — consumed by the Tableau de bord page (Task 8).

- [ ] **Step 1: Write `server/api/savings-goals/index.get.ts`**

`savings_goals` has no `archived_at` column (unlike the other reference tables), so this can't reuse `listActiveRows` — it's a plain ordered select:

```ts
import { asc } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { savingsGoals } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return db.select().from(savingsGoals).orderBy(asc(savingsGoals.sortOrder))
})
```

- [ ] **Step 2: Write `server/api/dashboard/summary.get.ts`**

```ts
import { and, eq } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { incomeEntries, incomeTypes, expenseEntries, categories, savingsEntries, savingsGoals } from '../../../drizzle/schema'
import { listBudgetEnvelopeLedgers } from '../../utils/envelopeCeilingsQuery'
import { getPrimaryReserveEnvelopeBalance } from '../../utils/reserveEnvelopeQuery'
import { fetchMovements } from '../../utils/movementsQuery'
import { computeDashboardSummary } from '../../utils/domain/dashboardSummary'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()
  const joursRestants = Math.max(0, daysInMonth - now.getDate())

  const [
    incomeRows,
    incomeTypeRows,
    expenseRows,
    categoryRows,
    savingsEntryRows,
    savingsGoalRows,
    envelopeLedgers,
    reserveEnvelope,
    recentMovements,
  ] = await Promise.all([
    db.select().from(incomeEntries).where(and(eq(incomeEntries.yearAssigned, year), eq(incomeEntries.monthAssigned, month))),
    db.select().from(incomeTypes),
    db.select().from(expenseEntries).where(and(eq(expenseEntries.yearAssigned, year), eq(expenseEntries.monthAssigned, month))),
    db.select().from(categories),
    db.select().from(savingsEntries).where(and(eq(savingsEntries.year, year), eq(savingsEntries.month, month))),
    db.select().from(savingsGoals),
    listBudgetEnvelopeLedgers(year, month),
    getPrimaryReserveEnvelopeBalance(),
    fetchMovements(year, month),
  ])

  const salaryTypeId = incomeTypeRows.find((incomeType) => incomeType.name === 'Salaire')?.id
  const salaryRows = incomeRows.filter((row) => row.incomeTypeId === salaryTypeId)
  const salaryReceived = salaryRows.reduce((sum, row) => sum + Number(row.amount), 0)
  const salaryExpected = salaryRows.reduce((sum, row) => sum + Number(row.expectedAmount ?? 0), 0)

  const categoryById = new Map(categoryRows.map((category) => [category.id, category]))
  const fixedChargesTotal = expenseRows
    .filter((row) => categoryById.get(row.categoryId)?.isFixed)
    .reduce((sum, row) => sum + Number(row.amount), 0)
  const variableChargesTotal = expenseRows
    .filter((row) => !categoryById.get(row.categoryId)?.isFixed && !row.envelopeId)
    .reduce((sum, row) => sum + Number(row.amount), 0)

  const envelopeSpendTotal = envelopeLedgers.reduce((sum, envelope) => sum + envelope.netSpent, 0)
  const savingsVersedTotal = savingsEntryRows.reduce((sum, row) => sum + Number(row.amount), 0)

  const summary = computeDashboardSummary({
    salaryReceived,
    salaryExpected,
    fixedChargesTotal,
    variableChargesTotal,
    envelopeSpendTotal,
    savingsVersedTotal,
    joursRestants,
  })

  const savingsByGoal = savingsGoalRows.map((goal) => ({
    id: goal.id,
    name: goal.name,
    amount: savingsEntryRows
      .filter((row) => row.savingsGoalId === goal.id)
      .reduce((sum, row) => sum + Number(row.amount), 0),
  }))

  return {
    monthLabel: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    joursRestants,
    salaryReceived,
    summary,
    homeEnvelopes: envelopeLedgers.filter((envelope) => envelope.showOnHome),
    envelopesTotalCeiling: envelopeLedgers.reduce((sum, envelope) => sum + envelope.ceiling, 0),
    savingsGoals: savingsByGoal,
    savingsTotal: savingsVersedTotal,
    reserveEnvelope,
    recentMovements: recentMovements.slice(0, 5),
  }
})
```

`envelopesTotalCeiling` sums ceilings across *all* budget envelopes (not just the `show_on_home` subset in `homeEnvelopes`) — the dashboard's "Enveloppes" KPI hint ("sur 455 € de plafonds" in the mockup) reflects every envelope's plafond, matching the Enveloppes page's own future Total row, not just the ones surfaced on the home grid.

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 4: Manually verify against the real API**

Requires a working `DATABASE_URL` with migrations applied and reference data seeded. Run `npm run dev`, log in, and `curl` `/api/savings-goals` (expect the 3 seeded goals) and `/api/dashboard/summary` (expect an object with all the fields above; `summary.usagePercent` will be `0` until real income/expense data exists for the current month — that's correct, not a bug, since no entries exist yet at this point unless you added some via Task 4's Mouvements page).

If no real database is reachable, run `npx tsc --noEmit server/api/savings-goals/index.get.ts server/api/dashboard/summary.get.ts` to confirm type correctness, and note in your report that live verification is pending a real database connection.

- [ ] **Step 5: Commit**

```bash
git add server/api/savings-goals/index.get.ts server/api/dashboard/summary.get.ts
git commit -m "feat: add savings goals route and dashboard summary endpoint"
```

---

### Task 8: Tableau de bord page

**Files:**
- Create: `app/components/dashboard/StatCard.vue`
- Create: `app/components/dashboard/DonutChart.vue`
- Create: `app/components/dashboard/EnvelopeCard.vue`
- Modify: `app/pages/index.vue`

**Interfaces:**
- Consumes: `GET /api/dashboard/summary` (Task 7).
- Produces: the full `/` dashboard page. `StatCard`/`DonutChart`/`EnvelopeCard` are local to this page for now (not yet imported elsewhere) — Milestone 5's Enveloppes page may reuse `EnvelopeCard`'s visual pattern later, but this plan does not generalize it preemptively.

- [ ] **Step 1: Write `app/components/dashboard/StatCard.vue`**

```vue
<script setup lang="ts">
defineProps<{
  label: string
  value: string
  hint?: string
  highlighted?: boolean
}>()
</script>

<template>
  <div class="rounded-[18px] p-4" :class="highlighted ? 'bg-toggle-track' : 'bg-white'">
    <p class="text-[12px] font-semibold text-ink-muted">{{ label }}</p>
    <p class="mt-1 text-[22px] font-extrabold text-ink">{{ value }}</p>
    <p v-if="hint" class="mt-1 text-[11px] font-medium text-ink-muted">{{ hint }}</p>
  </div>
</template>
```

- [ ] **Step 2: Write `app/components/dashboard/DonutChart.vue`**

Only the 4 non-zero categories are drawn as arcs; the "Non dépensé" share is simply the uncovered portion of the base grey ring, so it needs no arc of its own.

```vue
<script setup lang="ts">
const props = defineProps<{
  segments: { label: string; percent: number; colorClass: string }[]
  centerPercent: number
  centerLabel: string
}>()

const radius = 60
const circumference = 2 * Math.PI * radius

function dashArrayFor(percent: number) {
  const length = (percent / 100) * circumference
  return `${length} ${circumference - length}`
}

function offsetFor(index: number) {
  const before = props.segments.slice(0, index).reduce((sum, segment) => sum + segment.percent, 0)
  return -(before / 100) * circumference
}
</script>

<template>
  <div class="relative size-[140px] shrink-0">
    <svg viewBox="0 0 140 140" class="size-full -rotate-90">
      <circle cx="70" cy="70" r="60" fill="none" stroke-width="16" class="stroke-toggle-track" />
      <circle
        v-for="(segment, index) in segments"
        :key="segment.label"
        cx="70" cy="70" r="60" fill="none" stroke-width="16"
        stroke="currentColor"
        stroke-linecap="butt"
        :class="segment.colorClass"
        :stroke-dasharray="dashArrayFor(segment.percent)"
        :stroke-dashoffset="offsetFor(index)"
      />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <p class="text-[22px] font-extrabold text-ink">{{ centerPercent }} %</p>
      <p class="w-[70px] text-center text-[9.5px] font-semibold leading-tight text-ink-muted">{{ centerLabel }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Write `app/components/dashboard/EnvelopeCard.vue`**

```vue
<script setup lang="ts">
const props = defineProps<{
  emoji: string
  name: string
  remaining: number
  ceiling: number
  netSpent: number
}>()

const isOverspent = computed(() => props.remaining < 0)
const progressPercent = computed(() => props.ceiling > 0 ? Math.min(100, Math.round((props.netSpent / props.ceiling) * 100)) : 0)
</script>

<template>
  <div class="rounded-[16px] p-3" :class="isOverspent ? 'bg-warn-bg' : 'bg-app-bg'">
    <div class="flex items-center justify-between">
      <span class="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
        <span>{{ emoji }}</span>
        <span>{{ name }}</span>
      </span>
      <span class="text-[13px] font-extrabold" :class="isOverspent ? 'text-warn-ink' : 'text-ink'">
        {{ netSpent.toFixed(0) }} €
      </span>
    </div>
    <div class="mt-2 h-[6px] rounded-full bg-toggle-track">
      <div
        class="h-full rounded-full"
        :class="isOverspent ? 'bg-warn-bar' : 'bg-mint-bar'"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>
    <p class="mt-1 text-[10.5px] font-medium text-ink-muted">{{ netSpent.toFixed(0) }} € sur {{ ceiling.toFixed(0) }} €</p>
  </div>
</template>
```

- [ ] **Step 4: Rewrite `app/pages/index.vue`**

```vue
<script setup lang="ts">
interface BudgetEnvelopeLedger {
  id: string
  name: string
  emoji: string
  showOnHome: boolean
  ceiling: number
  netSpent: number
  remaining: number
}

interface Movement {
  id: string
  type: 'expense' | 'income' | 'transfer'
  date: string
  label: string
  envelopeLabel: string
  origin: string
  amount: number
  sign: 'negative' | 'positive' | 'neutral'
}

interface DashboardSummary {
  monthLabel: string
  joursRestants: number
  salaryReceived: number
  summary: {
    budgetDuMois: number
    totalSpent: number
    resteADepenser: number
    resteADepenserParJour: number
    salaryVsExpected: number
    usagePercent: number
    breakdown: {
      fixedCharges: { amount: number; percent: number }
      envelopes: { amount: number; percent: number }
      variable: { amount: number; percent: number }
      savings: { amount: number; percent: number }
      unspent: { amount: number; percent: number }
    }
  }
  homeEnvelopes: BudgetEnvelopeLedger[]
  envelopesTotalCeiling: number
  savingsGoals: { id: string; name: string; amount: number }[]
  savingsTotal: number
  reserveEnvelope: { id: string; name: string; emoji: string; balance: number; incomeCreditsTotal: number; expensesTotal: number } | null
  recentMovements: Movement[]
}

const { data } = await useFetch<DashboardSummary>('/api/dashboard/summary', { key: 'dashboard-summary' })

function euro(value: number) {
  return `${value.toFixed(2).replace('.', ',')} €`
}

function formatMovementAmount(movement: Movement) {
  const formatted = `${Math.abs(movement.amount).toFixed(2).replace('.', ',')} €`
  if (movement.sign === 'negative') return `-${formatted}`
  if (movement.sign === 'positive') return `+${formatted}`
  return formatted
}

const donutSegments = computed(() => {
  const breakdown = data.value?.summary.breakdown
  if (!breakdown) return []
  return [
    { label: 'Charges fixes', percent: breakdown.fixedCharges.percent, colorClass: 'text-violet-bar' },
    { label: 'Enveloppes', percent: breakdown.envelopes.percent, colorClass: 'text-warn-bar' },
    { label: 'Variables', percent: breakdown.variable.percent, colorClass: 'text-mint-bar' },
    { label: 'Épargne', percent: breakdown.savings.percent, colorClass: 'text-azure-bar' },
  ]
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader :title="data?.monthLabel ?? ''">
      <template #context>
        <span v-if="data" class="text-[12.5px] font-semibold text-ink-muted">{{ data.joursRestants }} jours restants</span>
      </template>
      <template #actions>
        <NuxtLink to="/compte-rendu" class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink">
          Clôturer le mois
        </NuxtLink>
        <NuxtLink to="/mouvements" class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink">
          + Nouvelle saisie
        </NuxtLink>
      </template>
    </PageHeader>

    <template v-if="data">
      <div class="grid grid-cols-4 gap-4">
        <StatCard label="Salaire reçu" :value="euro(data.salaryReceived)" :hint="`${data.summary.salaryVsExpected >= 0 ? '+' : ''}${data.summary.salaryVsExpected.toFixed(0)} € vs prévu`" />
        <StatCard label="Épargne versée" :value="euro(data.savingsTotal)" />
        <StatCard label="Enveloppes" :value="euro(data.summary.breakdown.envelopes.amount)" :hint="`sur ${data.envelopesTotalCeiling.toFixed(0)} € de plafonds`" />
        <StatCard label="Reste à dépenser" :value="euro(data.summary.resteADepenser)" :hint="`soit ${data.summary.resteADepenserParJour.toFixed(0)} € / jour`" highlighted />
      </div>

      <div class="grid grid-cols-[auto_1fr] items-center gap-6 rounded-[22px] bg-white p-5">
        <DonutChart :segments="donutSegments" :center-percent="data.summary.usagePercent" center-label="du salaire affecté" />
        <div class="grid grid-cols-2 gap-x-8 gap-y-3 text-[12.5px]">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 font-semibold text-ink-muted"><span class="size-2 rounded-full bg-violet-bar" />Charges fixes</span>
            <span class="font-bold text-ink">{{ euro(data.summary.breakdown.fixedCharges.amount) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 font-semibold text-ink-muted"><span class="size-2 rounded-full bg-mint-bar" />Variables</span>
            <span class="font-bold text-ink">{{ euro(data.summary.breakdown.variable.amount) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 font-semibold text-ink-muted"><span class="size-2 rounded-full bg-warn-bar" />Enveloppes</span>
            <span class="font-bold text-ink">{{ euro(data.summary.breakdown.envelopes.amount) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 font-semibold text-ink-muted"><span class="size-2 rounded-full bg-azure-bar" />Épargne</span>
            <span class="font-bold text-ink">{{ euro(data.summary.breakdown.savings.amount) }}</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-[1fr_320px] gap-5">
        <div class="rounded-[22px] bg-white p-5">
          <p class="text-[13.5px] font-extrabold text-ink">Enveloppes du mois</p>
          <div class="mt-3 grid grid-cols-3 gap-3">
            <EnvelopeCard
              v-for="envelope in data.homeEnvelopes"
              :key="envelope.id"
              :emoji="envelope.emoji"
              :name="envelope.name"
              :remaining="envelope.remaining"
              :ceiling="envelope.ceiling"
              :net-spent="envelope.netSpent"
            />
          </div>
          <p v-if="data.homeEnvelopes.length === 0" class="mt-3 text-[12.5px] font-medium text-ink-muted">
            Aucune enveloppe affichée sur le tableau de bord pour le moment.
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <div class="rounded-[22px] bg-white p-4">
            <div class="flex items-center justify-between">
              <p class="text-[13px] font-extrabold text-ink">Derniers mouvements</p>
              <NuxtLink to="/mouvements" class="text-[11.5px] font-bold text-primary">Tout voir</NuxtLink>
            </div>
            <ul class="mt-2 flex flex-col gap-2">
              <li v-for="movement in data.recentMovements" :key="movement.id" class="flex items-center justify-between text-[12px]">
                <span class="font-semibold text-ink">{{ movement.label }}</span>
                <span class="font-bold" :class="movement.sign === 'negative' ? 'text-warn-ink' : movement.sign === 'positive' ? 'text-mint-ink' : 'text-ink'">
                  {{ formatMovementAmount(movement) }}
                </span>
              </li>
            </ul>
            <p v-if="data.recentMovements.length === 0" class="mt-2 text-[12px] font-medium text-ink-muted">Aucun mouvement ce mois-ci.</p>
          </div>

          <div class="rounded-[22px] bg-white p-4">
            <p class="text-[13px] font-extrabold text-ink">Épargne</p>
            <p class="mt-1 text-[20px] font-extrabold text-ink">{{ euro(data.savingsTotal) }}</p>
            <ul class="mt-2 flex flex-col gap-1.5">
              <li v-for="goal in data.savingsGoals" :key="goal.id" class="flex items-center justify-between text-[12px]">
                <span class="font-semibold text-ink-muted">{{ goal.name }}</span>
                <span class="font-bold text-ink">{{ euro(goal.amount) }}</span>
              </li>
            </ul>
          </div>

          <div v-if="data.reserveEnvelope" class="rounded-[22px] bg-toggle-track p-4">
            <p class="text-[12.5px] font-bold text-ink">{{ data.reserveEnvelope.emoji }} {{ data.reserveEnvelope.name }}</p>
            <p class="mt-1 text-[20px] font-extrabold text-ink">{{ euro(data.reserveEnvelope.balance) }} <span class="text-[11px] font-semibold text-ink-muted">disponibles</span></p>
            <p class="mt-1 text-[11px] font-medium text-ink-muted">
              {{ euro(data.reserveEnvelope.incomeCreditsTotal) }} reçus, {{ euro(data.reserveEnvelope.expensesTotal) }} dépensés. Hors budget du mois et hors règle 50/30/20.
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 5: Build to verify everything compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 6: Run the unit suite (regression check)**

Run: `npx vitest run`
Expected: PASS — this task adds no new unit-tested logic (the page is presentational), this confirms nothing else broke.

- [ ] **Step 7: Manually verify in the browser**

Run `npm run dev`, log in. Confirm: `/` shows the month name and day count in the header, 4 KPI cards, the donut chart with a legend, the "Enveloppes du mois" grid (only envelopes with `show_on_home = true` in the seed data — check `scripts/seed-reference-data.ts` for which ones those are, or set one via Paramètres if none are flagged), "Derniers mouvements" (populated if you added entries via `/mouvements` in Task 4's manual check), the Épargne card (goal names with 0 € amounts, since nothing writes `savings_entries` yet — this is the correct, honest empty state, not a bug), and the reserve-envelope highlight card for "Anniversaire et fêtes". Clicking "+ Nouvelle saisie" navigates to `/mouvements`; clicking "Clôturer le mois" navigates to `/compte-rendu` (which 404s — expected, it's a later milestone).

- [ ] **Step 8: Commit**

```bash
git add app/components/dashboard app/pages/index.vue
git commit -m "feat: rebuild Tableau de bord with real dashboard summary data"
```

---

## Self-Review Notes

- **Spec coverage:** §4.3 Mouvements (PageHeader/filters/search → Task 3; DataTable → Task 3; EntryPanel with toggle/live preview → Task 4) — fully covered, with the plan's own documented "Enveloppe"/"Origine" derivation decisions filling gaps the mockup left implicit. §4.1 Tableau de bord (PageHeader/month/days-remaining → Task 8; KPI row → Task 8; donut+50/30/20 legend → Task 6/7/8; Enveloppes du mois grid → Task 5/7/8; Derniers mouvements/Épargne/reserve highlight → Task 7/8) — fully covered. The "always-visible ceilings" replacement (sidebar widget) already shipped in Milestone 3 and is only touched here for its explicit fetch key (Task 4).
- **Placeholder scan:** no TBD/TODO; the one near-miss (an empty `recentMovements` call while drafting Task 7) was caught and fixed by reusing `fetchMovements` properly — the plan as written has no such gap.
- **Type consistency:** `Movement`/`RawExpenseMovement`/`RawIncomeMovement`/`RawTransferMovement` (Task 1) flow unchanged through `movementsQuery.ts` (Task 2) into both `/api/movements` (Task 2/3) and `/api/dashboard/summary`'s `recentMovements` (Task 7/8). `BudgetEnvelopeLedger` (Task 5, with the new `showOnHome` field) flows into both `ceilings.get.ts` (Task 5) and the dashboard route's `homeEnvelopes` (Task 7/8). `DashboardSummaryResult`'s shape (Task 6) matches exactly what `index.vue`'s local `DashboardSummary` interface expects (Task 8) — every field name checked field-by-field while writing Task 8.
