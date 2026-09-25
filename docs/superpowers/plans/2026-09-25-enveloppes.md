# Enveloppes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Enveloppes page (`/enveloppes`) — a sortable-by-nothing-yet table of budget envelopes with a per-row detail drawer, plus the two reserve-envelope summary cards — per the Figma redesign and the existing desktop-redesign spec §4.2.

**Architecture:** Server-side, this milestone re-introduces the shared `envelopeCeilingsQuery.ts` extraction pattern (the same one Milestone 4 built and a later revert removed) — but batched from the start this time, learning directly from the incident documented in `docs/superpowers/notes/2026-09-21-vercel-dashboard-hang.md`: one query per table for the month, grouped in memory, never a per-envelope loop. It also adds a small pure domain function (`deriveEnvelopeSubtitle`) that turns an envelope's carry-over/transfer/income-credit breakdown into the one-line subtitle text the table shows under each envelope's name, and two new small query modules: `reserveEnvelopeQuery.ts` (lists every `reserve`-kind envelope's balance, not just the "primary" one a future dashboard will want) and `envelopeJournalQuery.ts` (one envelope's movements for the month, reusing the existing `buildMovementsFeed` domain function against pre-filtered rows rather than touching that already-tested module). Client-side, the page is a hand-rolled table matching `mouvements.vue`'s existing styling (no shared `DataTable` component this milestone — a deliberate, previously-made decision to avoid touching already-working code), plus a new reusable `DetailDrawer.vue` wrapping Nuxt UI's `USlideover`. The "⇄ Transférer" button completes a piece the EntryPanel rebuild plan deliberately deferred: `EntryPanel.vue` learns to read `?mode=transfer` from the route on mount.

**Tech Stack:** Nuxt 4, Nuxt UI 3 (`USlideover`), Tailwind v4 `@theme`, Drizzle, Vitest. No new database migrations — this milestone treats the Figma design's second reserve-envelope card ("Extras") as an ordinary `reserve`-kind envelope, identical in every way to the existing "Anniversaire et fêtes" one; the design's "remis à zéro à la clôture" (reset at month-close) copy describes *closure-time* behavior that belongs to the not-yet-built Compte rendu milestone, not this one — see the Global Constraints below for the exact scope line.

**Spec:** `docs/superpowers/specs/2026-09-20-desktop-web-redesign-design.md` §4.2 (Enveloppes).

## Global Constraints

- Every new `server/api/*` route calls `requireUser(event)` before touching the database.
- No hardcoded hex colors in new Vue components — use Tailwind theme tokens (`ink`, `ink-muted`, `ink-faint`, `app-bg`, `toggle-track`, `divider`, `mint-bar`, `mint-ink`, `warn-bg`, `warn-ink`, `warn-bar`, `primary`, `primary-ink`).
- All ceiling/net-spent/remaining math goes through `computeEnvelopeLedger`; all reserve-envelope balance math goes through `computeReserveBalance` — never re-derived inline in a route or component.
- **Every DB-backed query function fetches each table at most once per request and groups in memory — no per-row/per-envelope loop issuing repeated queries.** This is a hard lesson from a prior production incident (`docs/superpowers/notes/2026-09-21-vercel-dashboard-hang.md`): a per-envelope query loop that was invisible locally caused multi-second-to-infinite page loads once deployed to a serverless function in a different region than the database. `envelopeCeilingsQuery.ts` (Task 2) is a direct re-application of that lesson, not a new pattern to reinvent.
- "Current month" is always the server clock's current year/month — no month-switcher query params yet, matching every prior milestone's convention.
- Every `useFetch` call in a page or panel destructures `error` and renders a distinct, honest error branch — matching the pattern in `app/components/SidebarCeilingsWidget.vue`.
- **This milestone's "Extras" reserve envelope is scope-limited:** it is created and displayed exactly like "Anniversaire et fêtes" (a `kind: 'reserve'` envelope, balance = all-time income credits minus all-time expenses via `computeReserveBalance`). The Figma design's "remis à zéro à la clôture" (reset each month) behavior is **not implemented** by this plan — no task here writes any reset/closure logic. That belongs to the future Compte rendu milestone, which is where the app's only closure logic will exist.
- **The `EnvelopeCeiling`-shaped local interface duplication** already accepted in `SidebarCeilingsWidget.vue` and `EntryPanel.vue` is not re-litigated by this plan — new components add their own local copies of whatever server-response shape they consume, matching the codebase's existing convention, not a shared types file.

---

## File Structure

```
server/
  utils/
    domain/
      envelopeSubtitle.ts              (create)
    envelopeCeilingsQuery.ts           (create — re-introduces the batched pattern, with subtitle)
    reserveEnvelopeQuery.ts            (create)
    envelopeJournalQuery.ts            (create)
  api/
    envelopes/
      ceilings.get.ts                  (modify — thin wrapper over envelopeCeilingsQuery)
      reserves.get.ts                  (create)
      [id]/
        journal.get.ts                 (create)
app/
  components/
    DetailDrawer.vue                   (create)
    entry/
      EntryPanel.vue                   (modify — read ?mode=transfer on mount)
  pages/
    enveloppes.vue                     (create)
tests/
  unit/
    server/
      utils/
        domain/
          envelopeSubtitle.test.ts     (create)
```

---

### Task 1: Envelope subtitle domain function

**Files:**
- Create: `server/utils/domain/envelopeSubtitle.ts`
- Test: `tests/unit/server/utils/domain/envelopeSubtitle.test.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `deriveEnvelopeSubtitle(input: { carriedOverAmount: number; netTransfer: number; incomeCreditsTotal: number }): string | null` — consumed by `server/utils/envelopeCeilingsQuery.ts` (Task 2).

The design shows varied subtitle copy per envelope ("110 € + 20 € reçus", "dont 10 € reportés d'août", "60 € − 20 € transférés") — this function picks ONE, in priority order, from whichever adjustment actually happened to that envelope's ceiling this month. Carry-over takes priority (it's the most common real scenario per the existing domain data), then net transfers, then income credits; an envelope with none of these gets no subtitle.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/server/utils/domain/envelopeSubtitle.test.ts
import { describe, it, expect } from 'vitest'
import { deriveEnvelopeSubtitle } from '../../../../../server/utils/domain/envelopeSubtitle'

describe('deriveEnvelopeSubtitle', () => {
  it('prioritizes a carried-over amount over everything else', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 10, netTransfer: 20, incomeCreditsTotal: 5 }))
      .toBe('dont 10 € reportés du mois dernier')
  })

  it('shows a positive net transfer when there is no carry-over', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 0, netTransfer: 20, incomeCreditsTotal: 0 }))
      .toBe('+20 € transférés')
  })

  it('shows a negative net transfer with the minus sign', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 0, netTransfer: -20, incomeCreditsTotal: 0 }))
      .toBe('−20 € transférés')
  })

  it('shows income credits when there is no carry-over or transfer', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 0, netTransfer: 0, incomeCreditsTotal: 20 }))
      .toBe('+20 € reçus')
  })

  it('returns null when nothing adjusted the envelope this month', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 0, netTransfer: 0, incomeCreditsTotal: 0 })).toBeNull()
  })

  it('treats a zero net transfer as no transfer even if gross in/out both happened', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 0, netTransfer: 0, incomeCreditsTotal: 0 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/server/utils/domain/envelopeSubtitle.test.ts`
Expected: FAIL — `Cannot find module '../../../../../server/utils/domain/envelopeSubtitle'`.

- [ ] **Step 3: Write `server/utils/domain/envelopeSubtitle.ts`**

```ts
export interface EnvelopeSubtitleInputs {
  carriedOverAmount: number
  netTransfer: number
  incomeCreditsTotal: number
}

export function deriveEnvelopeSubtitle(input: EnvelopeSubtitleInputs): string | null {
  if (input.carriedOverAmount > 0) {
    return `dont ${input.carriedOverAmount} € reportés du mois dernier`
  }

  if (input.netTransfer > 0) {
    return `+${input.netTransfer} € transférés`
  }
  if (input.netTransfer < 0) {
    return `−${Math.abs(input.netTransfer)} € transférés`
  }

  if (input.incomeCreditsTotal > 0) {
    return `+${input.incomeCreditsTotal} € reçus`
  }

  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/utils/domain/envelopeSubtitle.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/domain/envelopeSubtitle.ts tests/unit/server/utils/domain/envelopeSubtitle.test.ts
git commit -m "feat: add envelope subtitle domain function"
```

---

### Task 2: Batched envelope-ceilings query with subtitle

**Files:**
- Create: `server/utils/envelopeCeilingsQuery.ts`
- Modify: `server/api/envelopes/ceilings.get.ts`

**Interfaces:**
- Consumes: `computeEnvelopeLedger` (existing, `server/utils/domain/envelopeLedger.ts`); `deriveEnvelopeSubtitle` (Task 1).
- Produces: `listBudgetEnvelopeLedgers(year: number, month: number): Promise<BudgetEnvelopeLedger[]>` where `BudgetEnvelopeLedger` is `{ id, name, emoji, showOnHome, ceiling, netSpent, remaining, subtitle }` — consumed by `server/api/envelopes/ceilings.get.ts` (this task) and `app/pages/enveloppes.vue` (Task 5, via that same route).

This is a regression-sensitive change: `ceilings.get.ts` is an already-shipped, already-consumed endpoint (`SidebarCeilingsWidget.vue` and `EntryPanel.vue` both fetch it today). The response shape must be additive only — this task adds `subtitle`, it must not lose, rename, or change the type of `id`, `name`, `emoji`, `showOnHome`, `ceiling`, `netSpent`, or `remaining`.

- [ ] **Step 1: Read the current `ceilings.get.ts` to confirm its exact existing behavior**

Run: `cat server/api/envelopes/ceilings.get.ts`

Confirm it currently does a per-envelope `for` loop (5 queries per envelope) directly inline, calling `requireUser` then `computeEnvelopeLedger` per envelope, and returns `{ id, name, emoji, showOnHome, ceiling, netSpent, remaining }[]`. This is the code Step 2 replaces.

- [ ] **Step 2: Write `server/utils/envelopeCeilingsQuery.ts`**

```ts
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { envelopes, monthlyEnvelopeAllocations, expenseEntries, incomeEntries, transfers } from '../../drizzle/schema'
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
}

export async function listBudgetEnvelopeLedgers(year: number, month: number): Promise<BudgetEnvelopeLedger[]> {
  // One query per table for the whole month, not per envelope — see this plan's Global
  // Constraints for why. Everything below groups the results in memory instead.
  const [budgetEnvelopes, allocations, allExpenses, allIncomeCredits, allTransfers] = await Promise.all([
    db
      .select()
      .from(envelopes)
      .where(and(eq(envelopes.kind, 'budget'), isNull(envelopes.archivedAt)))
      .orderBy(asc(envelopes.sortOrder)),
    db
      .select()
      .from(monthlyEnvelopeAllocations)
      .where(and(eq(monthlyEnvelopeAllocations.year, year), eq(monthlyEnvelopeAllocations.month, month))),
    db
      .select()
      .from(expenseEntries)
      .where(and(eq(expenseEntries.yearAssigned, year), eq(expenseEntries.monthAssigned, month))),
    db
      .select()
      .from(incomeEntries)
      .where(and(eq(incomeEntries.yearAssigned, year), eq(incomeEntries.monthAssigned, month))),
    db
      .select()
      .from(transfers)
      .where(and(eq(transfers.yearAssigned, year), eq(transfers.monthAssigned, month))),
  ])

  const allocationByEnvelopeId = new Map(allocations.map((allocation) => [allocation.envelopeId, allocation]))

  return budgetEnvelopes.map((envelope) => {
    const allocation = allocationByEnvelopeId.get(envelope.id)
    const expenses = allExpenses.filter((row) => row.envelopeId === envelope.id)
    const incomeCredits = allIncomeCredits.filter((row) => row.targetEnvelopeId === envelope.id)
    const transfersIn = allTransfers.filter((row) => row.toEnvelopeId === envelope.id)
    const transfersOut = allTransfers.filter((row) => row.fromEnvelopeId === envelope.id)

    const carriedOverAmount = allocation ? Number(allocation.carriedOverAmount) : 0
    const transfersInTotal = transfersIn.reduce((sum, row) => sum + Number(row.amount), 0)
    const transfersOutTotal = transfersOut.reduce((sum, row) => sum + Number(row.amount), 0)
    const incomeCreditsTotal = incomeCredits.reduce((sum, row) => sum + Number(row.amount), 0)

    const ledger = computeEnvelopeLedger({
      defaultCeiling: Number(envelope.defaultCeiling ?? 0),
      allocation: allocation
        ? {
            baseCeiling: Number(allocation.baseCeiling),
            carriedOverAmount,
            overspendDeduction: Number(allocation.overspendDeduction),
          }
        : null,
      transfersIn: transfersInTotal,
      transfersOut: transfersOutTotal,
      expensesTotal: expenses.reduce((sum, row) => sum + Number(row.amount), 0),
      incomeCreditsTotal,
    })

    return {
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      showOnHome: envelope.showOnHome,
      ...ledger,
      subtitle: deriveEnvelopeSubtitle({
        carriedOverAmount,
        netTransfer: transfersInTotal - transfersOutTotal,
        incomeCreditsTotal,
      }),
    }
  })
}
```

- [ ] **Step 3: Rewrite `server/api/envelopes/ceilings.get.ts` as a thin wrapper**

```ts
import { requireUser } from '../../utils/auth'
import { listBudgetEnvelopeLedgers } from '../../utils/envelopeCeilingsQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return listBudgetEnvelopeLedgers(now.getFullYear(), now.getMonth() + 1)
})
```

- [ ] **Step 4: Build and run the full unit suite**

Run: `npm run build && npx vitest run`
Expected: build succeeds; all unit tests pass. This is a regression-sensitive refactor of an already-shipped endpoint — the response shape only gains one field (`subtitle`), it does not lose or rename anything `SidebarCeilingsWidget.vue` or `EntryPanel.vue` already rely on (`id, name, emoji, ceiling, netSpent, remaining` — note neither of those two files currently reads `showOnHome` or `subtitle`, so adding fields is safe).

- [ ] **Step 5: Manually verify against the real API**

Requires a working `DATABASE_URL`. Run `npm run dev`, log in, and `curl` `/api/envelopes/ceilings` with a session cookie (or hit it directly in a logged-in browser tab). Expected: an array of budget envelopes, each with a `subtitle` field (string or `null`), and the same `id/name/emoji/showOnHome/ceiling/netSpent/remaining` fields as before this change. Also confirm the sidebar's "Plafonds" widget still renders correctly (it should — it never reads `subtitle`).

If no real database is reachable, run `npx tsc --noEmit` on the two changed files to confirm type correctness instead, and note in your report that live verification is pending a real database connection.

- [ ] **Step 6: Commit**

```bash
git add server/utils/envelopeCeilingsQuery.ts server/api/envelopes/ceilings.get.ts
git commit -m "refactor: extract batched envelope-ceilings query, add subtitle field"
```

---

### Task 3: Reserve envelopes list query + endpoint

**Files:**
- Create: `server/utils/reserveEnvelopeQuery.ts`
- Create: `server/api/envelopes/reserves.get.ts`

**Interfaces:**
- Consumes: `computeReserveBalance` (existing, `server/utils/domain/envelopeLedger.ts`).
- Produces: `listReserveEnvelopeBalances(): Promise<ReserveEnvelopeBalance[]>` where `ReserveEnvelopeBalance` is `{ id, name, emoji, balance, incomeCreditsTotal, expensesTotal }` — consumed by `server/api/envelopes/reserves.get.ts` (this task). `GET /api/envelopes/reserves` → `ReserveEnvelopeBalance[]` — consumed by the Enveloppes page (Task 5).

This lists **every** active `reserve`-kind envelope (there will be two after seeding "Extras" in Task 5's manual verification step — "Anniversaire et fêtes" and "Extras"), unlike a hypothetical "primary reserve envelope" helper that only returns one. Reserve balances are all-time (not scoped to the current month), matching `computeReserveBalance`'s existing semantics — the whole point of a reserve envelope is that it carries forward.

- [ ] **Step 1: Write `server/utils/reserveEnvelopeQuery.ts`**

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

export async function listReserveEnvelopeBalances(): Promise<ReserveEnvelopeBalance[]> {
  const reserveEnvelopes = await db
    .select()
    .from(envelopes)
    .where(and(eq(envelopes.kind, 'reserve'), isNull(envelopes.archivedAt)))
    .orderBy(asc(envelopes.sortOrder))

  if (reserveEnvelopes.length === 0) return []

  const [allExpenses, allIncomeCredits] = await Promise.all([
    db.select().from(expenseEntries),
    db.select().from(incomeEntries),
  ])

  return reserveEnvelopes.map((envelope) => {
    const expenses = allExpenses.filter((row) => row.envelopeId === envelope.id)
    const incomeCredits = allIncomeCredits.filter((row) => row.targetEnvelopeId === envelope.id)

    const expensesTotal = expenses.reduce((sum, row) => sum + Number(row.amount), 0)
    const incomeCreditsTotal = incomeCredits.reduce((sum, row) => sum + Number(row.amount), 0)

    return {
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      balance: computeReserveBalance(incomeCreditsTotal, expensesTotal),
      incomeCreditsTotal,
      expensesTotal,
    }
  })
}
```

Note: `db.select().from(expenseEntries)` and `db.select().from(incomeEntries)` fetch **all** rows (no date filter) since reserve balances are all-time — this is intentionally different from Task 2's month-scoped queries. For a personal budget app's realistic data volume this is fine; if this table ever grows large, scope these to `envelopeId IN (...)` instead of filtering in memory, but that's not needed at current scale.

- [ ] **Step 2: Write `server/api/envelopes/reserves.get.ts`**

```ts
import { requireUser } from '../../utils/auth'
import { listReserveEnvelopeBalances } from '../../utils/reserveEnvelopeQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return listReserveEnvelopeBalances()
})
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 4: Manually verify against the real API**

Requires a working `DATABASE_URL`. Run `npm run dev`, log in, `curl`/fetch `/api/envelopes/reserves`. Expected: an array with one entry per active reserve-kind envelope (currently just "Anniversaire et fêtes" in seed data, until Task 5's manual step adds "Extras").

If no real database is reachable, run `npx tsc --noEmit` on the two new files instead, and note in your report that live verification is pending a real database connection.

- [ ] **Step 5: Commit**

```bash
git add server/utils/reserveEnvelopeQuery.ts server/api/envelopes/reserves.get.ts
git commit -m "feat: add reserve envelopes list query and endpoint"
```

---

### Task 4: Envelope journal query + endpoint

**Files:**
- Create: `server/utils/envelopeJournalQuery.ts`
- Create: `server/api/envelopes/[id]/journal.get.ts`

**Interfaces:**
- Consumes: `buildMovementsFeed` and its types (existing, `server/utils/domain/movementsFeed.ts`) — reused, not modified.
- Produces: `fetchEnvelopeJournal(envelopeId: string, year: number, month: number): Promise<Movement[]>` — consumed by `server/api/envelopes/[id]/journal.get.ts` (this task). `GET /api/envelopes/:id/journal` → `Movement[]` for the current month, sorted newest-first (inherited from `buildMovementsFeed`) — consumed by the Enveloppes page's `DetailDrawer` (Task 6).

This does **not** modify `movementsFeed.ts` or its existing tests. Instead it queries the three transaction tables pre-filtered to rows touching one specific envelope (an expense/income with that `envelopeId`/`targetEnvelopeId`, or a transfer with that `fromEnvelopeId` or `toEnvelopeId`), then feeds those pre-filtered rows through the same, already-tested `buildMovementsFeed` function `movementsQuery.ts` uses for the full unfiltered feed.

- [ ] **Step 1: Write `server/utils/envelopeJournalQuery.ts`**

```ts
import { and, eq, or } from 'drizzle-orm'
import { db } from './db'
import { expenseEntries, incomeEntries, transfers, categories, accounts, envelopes } from '../../drizzle/schema'
import { buildMovementsFeed } from './domain/movementsFeed'
import type { Movement } from './domain/movementsFeed'

export async function fetchEnvelopeJournal(envelopeId: string, year: number, month: number): Promise<Movement[]> {
  const [expenseRows, incomeRows, transferRows, categoryRows, accountRows, envelopeRows] = await Promise.all([
    db
      .select()
      .from(expenseEntries)
      .where(and(
        eq(expenseEntries.envelopeId, envelopeId),
        eq(expenseEntries.yearAssigned, year),
        eq(expenseEntries.monthAssigned, month),
      )),
    db
      .select()
      .from(incomeEntries)
      .where(and(
        eq(incomeEntries.targetEnvelopeId, envelopeId),
        eq(incomeEntries.yearAssigned, year),
        eq(incomeEntries.monthAssigned, month),
      )),
    db
      .select()
      .from(transfers)
      .where(and(
        or(eq(transfers.fromEnvelopeId, envelopeId), eq(transfers.toEnvelopeId, envelopeId)),
        eq(transfers.yearAssigned, year),
        eq(transfers.monthAssigned, month),
      )),
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

- [ ] **Step 2: Write `server/api/envelopes/[id]/journal.get.ts`**

```ts
import { requireUser } from '../../../utils/auth'
import { fetchEnvelopeJournal } from '../../../utils/envelopeJournalQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const envelopeId = getRouterParam(event, 'id')
  if (!envelopeId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing envelope id' })
  }

  const now = new Date()
  return fetchEnvelopeJournal(envelopeId, now.getFullYear(), now.getMonth() + 1)
})
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 4: Manually verify against the real API**

Requires a working `DATABASE_URL`. Run `npm run dev`, log in, find a real envelope id (e.g. from `/api/envelopes/ceilings`'s response), and `curl`/fetch `/api/envelopes/<that-id>/journal`. Expected: a `Movement[]` array scoped to only that envelope's activity this month — cross-check against `/api/movements`'s full feed that every returned row's `envelopeLabel` matches the envelope you queried (for transfers, either side).

If no real database is reachable, run `npx tsc --noEmit` on the two new files instead, and note in your report that live verification is pending a real database connection.

- [ ] **Step 5: Commit**

```bash
git add server/utils/envelopeJournalQuery.ts "server/api/envelopes/[id]/journal.get.ts"
git commit -m "feat: add envelope journal query and endpoint"
```

---

### Task 5: Enveloppes page — table + reserve cards (read-only)

**Files:**
- Create: `app/pages/enveloppes.vue`

**Interfaces:**
- Consumes: `GET /api/envelopes/ceilings` (Task 2, now including `subtitle`); `GET /api/envelopes/reserves` (Task 3).
- Produces: the `/enveloppes` route with the table and reserve cards rendered — Task 6 adds the row-click drawer interaction on top of this page without restructuring what this task builds.

- [ ] **Step 1: Write `app/pages/enveloppes.vue`**

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
  subtitle: string | null
}

interface ReserveEnvelopeBalance {
  id: string
  name: string
  emoji: string
  balance: number
  incomeCreditsTotal: number
  expensesTotal: number
}

const { data: envelopes, error: envelopesError } = await useFetch<BudgetEnvelopeLedger[]>('/api/envelopes/ceilings', { key: 'envelope-ceilings' })
const { data: reserves, error: reservesError } = await useFetch<ReserveEnvelopeBalance[]>('/api/envelopes/reserves', { key: 'reserve-envelopes' })

const totalCeiling = computed(() => (envelopes.value ?? []).reduce((sum, envelope) => sum + envelope.ceiling, 0))
const totalNetSpent = computed(() => (envelopes.value ?? []).reduce((sum, envelope) => sum + envelope.netSpent, 0))
const totalRemaining = computed(() => (envelopes.value ?? []).reduce((sum, envelope) => sum + envelope.remaining, 0))

function euro(value: number) {
  return `${value.toFixed(2).replace('.', ',')} €`
}

function progressPercent(envelope: BudgetEnvelopeLedger) {
  return envelope.ceiling > 0 ? Math.min(100, Math.max(0, Math.round((envelope.netSpent / envelope.ceiling) * 100))) : 0
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Enveloppes">
      <template #context>
        <span class="text-[12.5px] font-semibold text-ink-muted">Septembre 2026</span>
      </template>
      <template #actions>
        <NuxtLink to="/parametres" class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink">
          Modifier les plafonds
        </NuxtLink>
        <NuxtLink to="/mouvements?mode=transfer" class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink">
          ⇄ Transférer
        </NuxtLink>
      </template>
    </PageHeader>

    <div class="rounded-[22px] bg-white p-4">
      <p v-if="envelopesError" class="py-6 text-center text-[12.5px] font-semibold text-warn-ink">
        Impossible de charger les enveloppes.
      </p>
      <table v-else class="w-full text-left text-[12.5px]">
        <thead>
          <tr class="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
            <th class="pb-2">Enveloppe</th>
            <th class="pb-2 text-right">Plafond</th>
            <th class="pb-2 text-right">Dépensé</th>
            <th class="pb-2 text-right">Restant</th>
            <th class="pb-2">Progression</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="envelope in envelopes" :key="envelope.id" class="cursor-pointer border-t border-divider hover:bg-app-bg">
            <td class="py-2.5">
              <div class="flex items-center gap-2">
                <span>{{ envelope.emoji }}</span>
                <div class="flex flex-col">
                  <span class="font-semibold text-ink">{{ envelope.name }}</span>
                  <span v-if="envelope.subtitle" class="text-[10.5px] text-ink-faint">{{ envelope.subtitle }}</span>
                </div>
              </div>
            </td>
            <td class="py-2.5 text-right font-bold text-ink">{{ euro(envelope.ceiling) }}</td>
            <td class="py-2.5 text-right font-bold text-ink">{{ euro(envelope.netSpent) }}</td>
            <td class="py-2.5 text-right font-bold" :class="envelope.remaining < 0 ? 'text-warn-ink' : 'text-ink'">
              {{ euro(envelope.remaining) }}
            </td>
            <td class="py-2.5">
              <div class="h-[6px] w-full rounded-full bg-toggle-track">
                <div
                  class="h-full rounded-full"
                  :class="envelope.remaining < 0 ? 'bg-warn-bar' : 'bg-mint-bar'"
                  :style="{ width: `${progressPercent(envelope)}%` }"
                />
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t border-divider font-extrabold text-ink">
            <td class="py-2.5">Total</td>
            <td class="py-2.5 text-right">{{ euro(totalCeiling) }}</td>
            <td class="py-2.5 text-right">{{ euro(totalNetSpent) }}</td>
            <td class="py-2.5 text-right" :class="totalRemaining < 0 ? 'text-warn-ink' : 'text-ink'">{{ euro(totalRemaining) }}</td>
            <td class="py-2.5" />
          </tr>
        </tfoot>
      </table>
    </div>

    <p v-if="reservesError" class="rounded-[22px] bg-white p-4 text-[12.5px] font-semibold text-warn-ink">
      Impossible de charger les enveloppes de réserve.
    </p>
    <div v-else class="grid grid-cols-2 gap-4">
      <div v-for="reserve in reserves" :key="reserve.id" class="rounded-[22px] bg-toggle-track p-4">
        <p class="text-[12.5px] font-bold text-ink">{{ reserve.emoji }} {{ reserve.name }}</p>
        <p class="mt-1 text-[20px] font-extrabold text-ink">{{ euro(reserve.balance) }} <span class="text-[11px] font-semibold text-ink-muted">disponibles</span></p>
        <p class="mt-1 text-[11px] font-medium text-ink-muted">
          {{ euro(reserve.incomeCreditsTotal) }} reçus, {{ euro(reserve.expensesTotal) }} dépensés. Hors budget du mois et hors règle 50/30/20.
        </p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 3: Seed an "Extras" reserve envelope for manual verification**

The design shows two reserve cards; seed data currently only has "Anniversaire et fêtes". This is a one-off data step, not a schema change — insert a second `kind: 'reserve'` envelope via Paramètres (`/parametres`'s existing envelope-creation form — check it exposes a `kind` selector; if it only creates `kind: 'budget'` envelopes today, insert directly via SQL instead: `insert into envelopes (name, emoji, kind, sort_order) values ('Extras', '🎈', 'reserve', 1);` against your dev database) so the manual check in Step 4 has two cards to look at, matching the design.

- [ ] **Step 4: Manually verify in the browser**

Run `npm run dev`, log in, navigate to `/enveloppes`. Confirm: the table shows all budget envelopes with correct ceiling/dépensé/restant figures matching what `/api/envelopes/ceilings` returns directly; an overspent envelope (negative restant) shows in the warn color with a warn-colored progress bar; the Total row's figures equal the column sums; both reserve envelope cards render below the table with their balance and the "Hors budget du mois..." note. Clicking "Modifier les plafonds" navigates to `/parametres`; clicking "⇄ Transférer" navigates to `/mouvements?mode=transfer` (the query param won't do anything yet — that's Task 7).

- [ ] **Step 5: Commit**

```bash
git add app/pages/enveloppes.vue
git commit -m "feat: add Enveloppes page with budget table and reserve envelope cards"
```

---

### Task 6: DetailDrawer component + row-click journal wiring

**Files:**
- Create: `app/components/DetailDrawer.vue`
- Modify: `app/pages/enveloppes.vue`

**Interfaces:**
- Consumes: Nuxt UI's `USlideover` (existing, `@nuxt/ui` v3 — auto-imported, no explicit import needed); `GET /api/envelopes/:id/journal` (Task 4).
- Produces: `<DetailDrawer v-model:open="..." title="...">` with a `body` slot — a small reusable wrapper any future page can use for a right-side detail panel. Only `enveloppes.vue` uses it for now (not prematurely generalized beyond what one consumer needs).

- [ ] **Step 1: Write `app/components/DetailDrawer.vue`**

```vue
<script setup lang="ts">
defineProps<{
  title: string
}>()

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <USlideover v-model:open="open" :title="title" side="right" :ui="{ content: 'w-[380px]' }">
    <template #body>
      <slot />
    </template>
  </USlideover>
</template>
```

- [ ] **Step 2: Add row-click state and journal fetch to `app/pages/enveloppes.vue`**

In the `<script setup>` block, after the existing `progressPercent` function, add:

```ts
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

const selectedEnvelope = ref<BudgetEnvelopeLedger | null>(null)
const drawerOpen = computed({
  get: () => selectedEnvelope.value !== null,
  set: (value: boolean) => {
    if (!value) selectedEnvelope.value = null
  },
})

const journal = ref<Movement[]>([])
const journalError = ref(false)
const journalPending = ref(false)

watch(selectedEnvelope, async (envelope) => {
  if (!envelope) return
  journalPending.value = true
  journalError.value = false
  try {
    journal.value = await $fetch<Movement[]>(`/api/envelopes/${envelope.id}/journal`)
  } catch {
    journalError.value = true
  } finally {
    journalPending.value = false
  }
})

function openDrawer(envelope: BudgetEnvelopeLedger) {
  selectedEnvelope.value = envelope
}

function formatMovementAmount(movement: Movement) {
  const formatted = `${Math.abs(movement.amount).toFixed(2).replace('.', ',')} €`
  if (movement.sign === 'negative') return `-${formatted}`
  if (movement.sign === 'positive') return `+${formatted}`
  return formatted
}

function formatDate(isoDate: string) {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}
```

This uses `$fetch` directly inside a `watch`, not `useFetch` — matching the pattern already used by `ExpenseForm.vue`/`IncomeForm.vue`/`TransferForm.vue` for their own reference-data loading, rather than reaching for `useFetch`'s conditional-URL/lazy-fetch options, which have subtler semantics that are easy to get wrong. `journalError`/`journalPending` are managed by hand for the same reason — explicit and easy to verify by reading, at the cost of a few more lines than `useFetch` would take.

- [ ] **Step 3: Wire the row click and add the drawer to the template**

In the table's `<tr v-for="envelope in envelopes" ...>` element, add a click handler:

```vue
<tr
  v-for="envelope in envelopes"
  :key="envelope.id"
  class="cursor-pointer border-t border-divider hover:bg-app-bg"
  @click="openDrawer(envelope)"
>
```

At the very end of the template, right before the closing `</div>` of the page's root `<div class="flex flex-col gap-5">`, add:

```vue
<DetailDrawer v-if="selectedEnvelope" v-model:open="drawerOpen" :title="`${selectedEnvelope.emoji} ${selectedEnvelope.name}`">
  <div class="flex flex-col gap-4">
    <p class="text-[11px] font-semibold text-ink-muted">Septembre 2026 · {{ journal.length }} mouvements</p>

    <div>
      <p class="text-[12px] font-bold text-ink-muted">Reste à dépenser</p>
      <p class="mt-1 text-[26px] font-extrabold text-ink">{{ euro(selectedEnvelope.remaining) }}</p>
      <p class="text-[11px] font-medium text-ink-muted">sur {{ euro(selectedEnvelope.ceiling) }}</p>
      <div class="mt-2 h-[6px] w-full rounded-full bg-toggle-track">
        <div
          class="h-full rounded-full"
          :class="selectedEnvelope.remaining < 0 ? 'bg-warn-bar' : 'bg-mint-bar'"
          :style="{ width: `${progressPercent(selectedEnvelope)}%` }"
        />
      </div>
      <p v-if="selectedEnvelope.subtitle" class="mt-2 text-[11px] font-medium text-ink-muted">{{ selectedEnvelope.subtitle }}</p>
    </div>

    <div>
      <p class="text-[12px] font-bold text-ink">Journal</p>
      <p v-if="journalError" class="mt-2 text-[11px] font-semibold text-warn-ink">Impossible de charger le journal.</p>
      <p v-else-if="journalPending" class="mt-2 text-[11px] font-medium text-ink-muted">Chargement…</p>
      <ul v-else class="mt-2 flex flex-col gap-2">
        <li v-for="movement in journal" :key="movement.id" class="flex items-center justify-between text-[12px]">
          <div class="flex flex-col">
            <span class="font-semibold text-ink">{{ movement.label }}</span>
            <span class="text-[10.5px] text-ink-faint">{{ formatDate(movement.date) }} · {{ movement.origin }}</span>
          </div>
          <span
            class="font-bold"
            :class="movement.sign === 'negative' ? 'text-warn-ink' : movement.sign === 'positive' ? 'text-mint-ink' : 'text-ink'"
          >
            {{ formatMovementAmount(movement) }}
          </span>
        </li>
        <li v-if="journal.length === 0" class="text-[11px] font-medium text-ink-muted">Aucun mouvement ce mois-ci.</li>
      </ul>
    </div>
  </div>
</DetailDrawer>
```

- [ ] **Step 4: Build to verify everything compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 5: Run the unit suite (regression check)**

Run: `npx vitest run`
Expected: PASS — this task adds no new unit-tested logic, this confirms nothing else broke.

- [ ] **Step 6: Manually verify in the browser**

Run `npm run dev`, log in, navigate to `/enveloppes`. Confirm: clicking any table row opens the drawer on the right with that envelope's name in the header; the "Reste à dépenser" hero figure and progress bar match the row's own Restant/Plafond values; the Journal section shows that envelope's movements for the month (or "Aucun mouvement ce mois-ci." if genuinely empty), each with a correctly color-coded amount; the drawer's built-in close button (×, from `USlideover`'s default `close` prop) dismisses it; clicking a different row while the drawer is open switches its content to the new envelope without needing to close and reopen.

- [ ] **Step 7: Commit**

```bash
git add app/components/DetailDrawer.vue app/pages/enveloppes.vue
git commit -m "feat: add envelope detail drawer with per-envelope journal"
```

---

### Task 7: Wire the "⇄ Transférer" button to pre-open EntryPanel's Transfert tab

**Files:**
- Modify: `app/components/entry/EntryPanel.vue`

**Interfaces:**
- Consumes: `useRoute()` (Nuxt built-in).
- Produces: `EntryPanel` now initializes its `mode` ref from the route's `?mode=` query param (`'transfer'` maps to the panel's `'transfer'` mode; any other/missing value keeps the existing `'expense'` default) — completes what the Entry Panel Rebuild plan's self-review notes explicitly deferred to "each of those pages' own future task."

- [ ] **Step 1: Read the current `mode` ref declaration in `EntryPanel.vue`**

Run: `grep -n "const mode = ref" app/components/entry/EntryPanel.vue`

Confirm it currently reads `const mode = ref<'expense' | 'income' | 'transfer'>('expense')` with a hardcoded default.

- [ ] **Step 2: Change it to read the initial mode from the route query**

Replace:

```ts
const mode = ref<'expense' | 'income' | 'transfer'>('expense')
```

with:

```ts
const route = useRoute()
const initialMode = route.query.mode === 'transfer' ? 'transfer' : 'expense'
const mode = ref<'expense' | 'income' | 'transfer'>(initialMode)
```

This only reads the query param once, at component setup — if the user manually changes it after landing on the page via the toggle, that's normal toggle behavior, not something this task needs to keep syncing with the URL.

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 4: Run the unit suite (regression check)**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Manually verify in the browser**

Run `npm run dev`, log in, navigate to `/enveloppes`, click "⇄ Transférer". Confirm: you land on `/mouvements` with the entry panel's toggle already on "⇄ Transfert" (not the default "− Sortie"). Separately, confirm navigating to `/mouvements` directly (no query param) still defaults to "− Sortie" as before.

- [ ] **Step 6: Commit**

```bash
git add app/components/entry/EntryPanel.vue
git commit -m "feat: pre-open EntryPanel's Transfert tab from a ?mode=transfer query param"
```

---

## Self-Review Notes

- **Spec coverage:** §4.2 Enveloppes — `PageHeader` with month pill + "Modifier les plafonds"/"⇄ Transférer" actions (Task 5); `DataTable`-equivalent (hand-rolled, per the earlier deliberate decision) with the exact column set and Total footer row (Task 5); reserve-kind envelopes as two summary cards below the table, not table rows (Task 5); row click → `DetailDrawer` with hero figure + contextual note + Journal list + Dépensé net (the hero figure's "sur X€" line serves this — the spec's exact "Dépensé net" footer label isn't reproduced verbatim, but the equivalent figure is present via `remaining`/`ceiling`) (Task 6). "Sidebar ceilings widget total mirrors the table's Total row" — both derive from the same `listBudgetEnvelopeLedgers` function (Task 2), so this is true by construction, not a separately-built feature.
- **Placeholder scan:** no TBD/TODO. Every step has real, complete code.
- **Type consistency:** `BudgetEnvelopeLedger` (Task 2, now with `subtitle`) flows unchanged into `enveloppes.vue`'s local interface (Task 5) and is reused for `selectedEnvelope`'s type (Task 6) — checked field-by-field. `Movement` (existing, from `movementsFeed.ts`) flows through `fetchEnvelopeJournal` (Task 4) into `enveloppes.vue`'s local `Movement` interface (Task 6) unchanged — the same shape `mouvements.vue` already uses, checked against that file's own local copy.
- **Known scope limit, stated explicitly (not a gap):** the "Extras" reserve envelope's "remis à zéro à la clôture" behavior is not implemented — see Global Constraints. Task 5's manual verification step seeds this envelope with plain SQL rather than through a UI, since no UI for creating `reserve`-kind envelopes currently exists (Paramètres' envelope form may only support `kind: 'budget'` — Step 3 explicitly tells the implementer to check and fall back to SQL, rather than silently assuming).
- **`DataTable`/DetailDrawer note:** `DetailDrawer.vue` is genuinely the reusable component the original spec's component inventory calls for (§6) — unlike `DataTable`, which was deliberately deferred, there's no existing hand-rolled equivalent to match, so building it properly here (not inline in the page) costs nothing extra and pays off whenever a second page needs a slide-over.
