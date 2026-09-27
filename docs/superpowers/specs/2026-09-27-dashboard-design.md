# Dashboard (Tableau de bord) — Design Spec

**Date:** 2026-09-27
**Parent spec:** `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md` (implements its milestone 3 dashboard half, and §7's domain rules)
**Figma:** `https://www.figma.com/design/E6CGJ59EuSDp5s0ovq1aXK/Laura-Budget` — dashboard frame `22:2688`

## 1. Goal

Replace `app/pages/index.vue`, currently a 19-line stub reading "Connecté 🎉" with a
logout button, with the real dashboard. It is the first screen after login and the
only one that answers "how is this month going?".

Every table it reads already exists. The work is one aggregate endpoint, one domain
module, the page, and a minimal way to record savings — without which one slice of the
dashboard's central chart could never be filled.

## 2. Scope decisions

| Figma shows | Decision | Why |
|---|---|---|
| `‹ ›` month navigation | **Out of scope.** Current month only. | Every query module already takes `(year, month)`, so browsing is cheap to add later. Adding it now means a URL param, shared state and E2E coverage across every page. |
| `Clôturer le mois` button | **Out of scope.** Not rendered at all. | That is the month-closure subsystem (`/compte-rendu`, parent spec milestone 5). A visible dead button reads as broken, not forthcoming. |
| `du salaire affecté` in the donut centre | **Copy changed to `du revenu affecté`.** | The base is all income received, not only salary (see §3.2). With a Prime in the month, "salaire" would be false. |
| Savings goal names "Long terme / Sécurité / Projets" | Render whatever `savings_goals` rows exist. | The mockup is illustrative; the seeded goals are "Long terme", "Cadeaux et fêtes", "Vacances et imprévus". |

**Two conflicts with the parent spec, both resolved in the Figma's favour**, consistent
with how the size-bucket conflict was handled in the Envies & Comptes milestone:

1. **50/30/20 base.** Parent spec §7 says the base excludes planned savings. The
   Figma's actual percentages are `51 / 18 / 15`, which sum to 84 — exactly the
   `84 %` in the donut centre. Those reconcile only if the base is the full income
   received, savings included. This spec supersedes the parent on that point.
2. **Salary identification.** The parent spec §4 suggests a dedicated income type
   ("Salaire fixe"). Matching on a type name breaks the moment the user renames it,
   and adding an `is_salary` column would repeat the `accounts.kind` mistake — a
   column nothing in the product can set. Instead, salary is **derived**: an income
   entry counts as salary when it has a non-null `expected_amount` (§3.3).

## 3. Domain logic (pure, unit-tested)

`server/utils/domain/dashboard.ts`

### 3.1 The expense partition

Every expense in the month lands in exactly one bucket. Verified against the Figma:
`861 + 424 + 318 + 345 + 368 = 2 316`, the income received.

```ts
export type SpendBucket = 'fixed' | 'envelope' | 'variable'

export interface PartitionExpense {
  amount: number
  envelopeId: string | null
  categoryIsFixed: boolean
  financedBy: 'budget' | 'gift_given' | 'gift_received'
}

export function partitionExpenses(expenses: PartitionExpense[]): {
  fixed: number
  envelope: number
  variable: number
}
```

Rules, in order:
- `financedBy === 'gift_received'` → **excluded entirely**, counted in no bucket. Parent
  spec §7 and the reserve card both place gift-funded spend outside the month's budget
  and outside 50/30/20.
- `envelopeId !== null` → `envelope`. The envelope is the more specific intent, so it
  wins over the category's `is_fixed` flag.
- else `categoryIsFixed` → `fixed`.
- else → `variable`.

### 3.2 Income base and the salary slice

```ts
export interface PartitionIncome {
  amount: number
  expectedAmount: number | null
  targetEnvelopeId: string | null
}

export function summariseIncome(incomes: PartitionIncome[]): {
  received: number        // the donut base
  salaryReceived: number
  salaryExpected: number
  salaryVariance: number  // salaryReceived - salaryExpected
}
```

- `received` sums every income **except** those with a `targetEnvelopeId`. Income
  directed at an envelope is a reimbursement replacing money already spent, not new
  money; counting it would inflate the base and shrink every percentage.
- `salaryReceived` / `salaryExpected` sum only entries with a non-null
  `expectedAmount`. `salaryVariance` is the `+16 € vs prévu` line, and may be negative.

### 3.3 The month summary

```ts
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
  slices: { key: 'fixed' | 'envelope' | 'variable' | 'savings' | 'unspent', amount: number, percent: number }[]
}
```

- `unspent = incomeReceived - fixed - envelope - variable - savings`. It may be
  negative, and is rendered as-is; overspending is real information.
- `perDay = daysRemaining > 0 ? unspent / daysRemaining : unspent`. Callers pass
  `daysRemaining` with a floor of 1 (§3.5), so the zero branch is defensive only.
- `allocatedPercent = 100 - unspentPercent`, rounded. The Figma's `84 %`.
- Each slice's `percent` is `amount / incomeReceived * 100`, rounded.
- **When `incomeReceived === 0`, every `percent` is 0 and `allocatedPercent` is 0.**
  No division by zero, no `NaN`. The page renders a hint instead of the chart (§6).

### 3.4 50/30/20

```ts
export type Bucket5030 = 'besoins' | 'envies' | 'epargne'

export function compute503020(input: {
  incomeReceived: number
  taggedSpend: { bucket: Bucket5030 | null, amount: number }[]
  savings: number
}): {
  // Percentage points, not euros — the Figma renders "50 / 30 / 20" against "51 / 18 / 15".
  targets: { besoins: 50, envies: 30, epargne: 20 }
  actuals: { besoins: number, envies: number, epargne: number }
  // Euros, not a percentage: spend carrying no bucket tag, excluded from the actuals.
  untagged: number
}
```

- `taggedSpend` entries carry the `fifty_thirty_twenty_bucket` of the expense's
  **envelope** when it has one, otherwise of its **category**. Both tables carry the
  column and both are nullable.
- `savings` is added to the `epargne` actual. The Figma's `15` is savings as a share of
  income.
- Spend whose bucket is `null` accumulates in `untagged` and is excluded from all three
  actuals, which is why the actuals need not sum to 100.
- `targets` are the constants 50 / 30 / 20, shown as `50 / 30 / 20` beside the actuals.
- With `incomeReceived === 0`, all actuals are 0.

### 3.5 Days remaining

```ts
export function daysRemainingInMonth(today: Date): number
```

Returns `daysInMonth - today.getDate() + 1`, counting today as remaining, so the last
day of the month yields 1 and never 0. The Figma's "11 jours restants" in a 30-day
September puts the mockup on the 20th (`30 - 20 + 1 = 11`), which is consistent with its
most recent movement being dated 19 September.

## 4. Recording savings

`savings_entries` exists (`id`, `savings_goal_id`, `year`, `month`, `amount`) but nothing
in the product can write it, so the donut's `épargne` slice and the `Épargne` card could
never be filled. That slice is 15% of the chart; leaving it permanently 0 would fold it
into `unspent` and overstate what is free to spend.

**Schema:** unchanged, but note what it does *not* give us. `savings_entries` carries no
unique index (unlike `monthly_envelope_allocations`, which is unique on
`(envelope_id, year, month)`, and `livret_yearly_history` on `(livret_id, year)`).
Nothing at the database level stops two rows for the same goal and month.

The endpoint therefore enforces one figure per goal per month itself: it looks for an
existing row on `(savings_goal_id, year, month)` and updates it, inserting only when
none exists. This is a read-then-write, so two simultaneous submissions could still
produce duplicates; that is acceptable for a single-household app with one writer, and
the alternative — adding a unique index — is a migration this milestone does not need.
If duplicates ever appear, `GET /api/savings` sums rows per goal rather than assuming
one, so the displayed total stays correct.

**API:**
- `GET /api/savings?year&month` → `{ goalId, goalName, amount }[]` for the month, via
  the Data API with an embed on `savings_goals`.
- `POST /api/savings` → body `{ savingsGoalId, year, month, amount }`, validated by
  `shared/schemas/savings.ts`. Replaces any existing row for that goal and month rather
  than adding a second.

```ts
export const savingsInputSchema = z.object({
  savingsGoalId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.coerce.number().min(0),
})
```

**UI:** a compact form inside the dashboard's `Épargne` card — a goal selector, an
amount field, and a save button — not a new page. The richer savings screen is the
`/epargne` milestone. The amount field accepts a French decimal comma, normalised the
way `app/pages/envies.vue` does.

## 5. API

`GET /api/dashboard` — one endpoint composing the whole page, following
`/api/accounts/overview`:

```ts
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
  summary: {
    unspent: number
    perDay: number
    allocatedPercent: number
    slices: { key: 'fixed' | 'envelope' | 'variable' | 'savings' | 'unspent', amount: number, percent: number }[]
  }
  ruleOfThumb: { targets: { besoins: number, envies: number, epargne: number }, actuals: { besoins: number, envies: number, epargne: number }, untagged: number }
  recentMovements: Movement[]   // fetchMovements, most recent 5
}
```

Reads follow the established split: new reads (income entries, savings entries, the
tagged-spend join) go through the Supabase Data API with `AbortSignal.timeout(10000)`
and an `assertOk` that throws rather than returning partial data; the existing
pool-backed `listBudgetEnvelopeLedgers`, `listReserveEnvelopeBalances` and
`fetchMovements` are reused unchanged.

**One additive change to an existing module.** `BudgetEnvelopeLedger` does not expose
`incomeCreditsTotal`, which the envelope cards need for their `+20 € reçus` line. Add
that field to `listBudgetEnvelopeLedgers`. It is purely additive, so `/enveloppes` and
`/comptes` are unaffected, and their existing tests must still pass.

## 6. Page

`app/pages/index.vue`, replacing the stub. `useFetch('/api/dashboard', { key: 'dashboard' })`
with an explicit key and a visible error branch, as every other page does.

- **Header:** month label, days remaining, `+ Nouvelle saisie` linking to `/mouvements`.
  No month arrows, no closure button (§2).
- **Four KPI cards:** `Salaire reçu` with the variance line, `Épargne versée`,
  `Enveloppes` (`{netSpent} sur {ceiling} de plafonds`), and `Reste à dépenser`
  highlighted, with `soit {perDay} / jour`.
- **Utilisation du revenu:** a hand-rolled SVG donut — five `<circle>` elements with
  `stroke-dasharray` offsets, no chart dependency for five slices — the percentage in
  the centre, a two-column legend, and the `50 / 30 / 20` versus actuals row.
- **Enveloppes du mois:** a card per budget envelope with a progress bar, headed
  `{totalRemaining} encore disponibles · {overspentCount} dépassements`. Overspent
  envelopes use `warn` tokens. A zero-ceiling envelope must not divide by zero: the bar
  is 0% width, as `app/pages/comptes.vue` already does.
- **Right column:** `Derniers mouvements` (5, linking to `/mouvements`), the `Épargne`
  card with its per-goal breakdown and the entry form from §4, and a card per reserve
  envelope.

**The zero-income state is a first-class case, not an afterthought.** With no income
recorded, percentages are meaningless. The donut is replaced by a short prompt to record
the month's income, linking to `/mouvements`; the KPI cards still render with `0 €`.
This is the same lesson as `/comptes`, where a permanently negative `Vraiment libre`
was worse than showing nothing.

All money is rendered through `formatEuro` / `formatEuroShort` from
`app/utils/currency.ts`. No new formatter.

## 7. Testing

**Unit (vitest)** — the domain module, where the real logic lives:
- `partitionExpenses`: envelope beats `is_fixed`; `gift_received` excluded from all
  three buckets; an expense with neither an envelope nor a fixed category is variable.
- `summariseIncome`: income with a `targetEnvelopeId` excluded from `received`; salary
  identified by a non-null `expectedAmount`; a negative variance when salary underpays.
- `computeMonthSummary`: the Figma's own figures (2 316 / 861 / 424 / 318 / 345 → 368
  unspent, 84 %); a negative `unspent` when spending exceeds income; **zero income
  yielding 0 percentages and no `NaN`**.
- `compute503020`: untagged spend excluded from the actuals but reported; savings added
  to `epargne`; zero income yielding zero actuals.
- `daysRemainingInMonth`: the last day of the month returns 1, never 0; a 31-day month;
  February in a leap year.

**Query module** — mocked Supabase client as in
`tests/unit/server/utils/movementsQuery.test.ts`: filters scoped to the month, embeds
resolved, a failed request throwing rather than returning partial data.

**E2E (Playwright)** — signed in: the dashboard renders and survives a reload; the
savings form records an amount that then appears in the `Épargne` card; `/api/dashboard`
returns 401 without a session. The reload matters — it is where the pool-exhaustion bug
used to surface.

## 8. Out of scope

Month navigation; the `Clôturer le mois` action and everything behind it; the
`/epargne` and `/compte-rendu` pages; editing or deleting savings entries once recorded
(the POST replaces a goal's figure for the month, which is enough to correct a mistake);
bank synchronisation; and any change to how expenses, income or transfers are entered.
