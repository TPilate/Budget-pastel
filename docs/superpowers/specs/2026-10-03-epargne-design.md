# Épargne — Design Spec

**Date:** 2026-10-03
**Parent spec:** `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md` (implements its milestone 4, minus livrets — see §2)
**Figma:** `https://www.figma.com/design/E6CGJ59EuSDp5s0ovq1aXK/Laura-Budget` — Épargne frame `22:3967`

## 1. Goal

Build `/epargne`, the sixth of seven pages. It answers "how much have we put aside, where
is it going, and are we saving enough?" — the three *poches* with their targets and
progress, six months of history, the 50/30/20 position, and the month's contributions.

It also makes savings goals manageable. They are currently three seeded rows with no way
to create, rename or retarget them.

## 2. Scope decisions

| Figma shows | Decision | Why |
|---|---|---|
| Nothing about livrets | **Livrets are out of scope.** | The parent spec's milestone 4 says "+ Livrets", but the Épargne frame has no livrets section and the file has no livret screen. `livrets`, `livret_contributions` and `livret_yearly_history` are 0 rows with no endpoints, no UI and no design. Building a screen for them would mean inventing one with nothing to check against. Recorded as unused so their fate can be decided deliberately. |
| `Reliquats de clôture · 30 sept · en attente` | **Omitted entirely.** | Closure leftovers come from the month-closure flow, which is `/compte-rendu` (milestone 5). Rendering a permanently-pending row reads as broken rather than forthcoming — the same call made for the dashboard's `Clôturer le mois` button. |
| `4,1 mois de charges couverts` | **Recomputed, not reproduced.** | See §3.4. The mockup's own figure does not reconcile with any combination of its other numbers; the definition below is the defensible one and will print a different value. |

**Everything else in the mockup reconciles**, and the arithmetic is what fixes the
definitions below:
- `5 184 + 2 340 + 888 = 8 412`, the sidebar's *Épargne totale*.
- `216 + 80 + 49 = 345`, the header's *345 € répartis chaque mois*.
- `Sécurité objectif 2 583 = 3 × 861`, and 861 € is exactly the fixed-charges total from
  `/comptes`. So "mois de charges" means **monthly fixed charges**, not total spending.
- `20 % − 15 % = 5 points`, and `5 % × 2 316 = 116 €`, the *"environ 116 € de plus par
  mois"* advice.

## 3. Domain logic (pure, unit-tested)

`server/utils/domain/savings.ts`

### 3.1 Poche balances and progress

```ts
export interface PocheInput {
  id: string
  name: string
  targetAmount: number | null
  monthlyAmount: number
  note: string | null
  receivesSalaryVariance: boolean
}

export interface PocheView {
  id: string
  name: string
  note: string | null
  balance: number          // every savings_entries row for this goal, all time
  monthlyAmount: number
  targetAmount: number | null
  progressPercent: number | null   // null when there is no target
  receivesSalaryVariance: boolean
}

export function summarisePoches(
  poches: PocheInput[],
  entries: { savingsGoalId: string, amount: number }[],
): { poches: PocheView[], totalBalance: number, totalMonthly: number }
```

- `balance` sums **all** entries for the goal, not just this month: the design's `5 184 €`
  is a running total, while `345 €` is the month's contribution.
- `progressPercent` is `balance / targetAmount × 100`, rounded, clamped to 0–100 for the
  bar. **It is `null` when `targetAmount` is null or 0**, and the page then renders the
  balance with no bar rather than dividing by zero. A poche without a target is a valid
  state — "sans échéance" in the mockup.
- `totalMonthly` is the sum of `monthlyAmount`, which is the header's *345 € répartis
  chaque mois*.

### 3.2 Six-month history

```ts
export function monthlyHistory(
  entries: { year: number, month: number, amount: number }[],
  through: { year: number, month: number },
  months: number,
): { year: number, month: number, label: string, amount: number }[]
```

Returns exactly `months` entries ending at `through`, oldest first, **including months
with no savings at all as zero**. Without that the bar chart would silently compress a
gap and misrepresent the trend. `label` is the French three-letter month (`Avr`, `Mai`,
…) as the mockup shows.

### 3.3 Savings gap advice

```ts
export function savingsGapAdvice(input: {
  targetPercent: number     // 20, from the 50/30/20 rule
  actualPercent: number     // the epargne actual already computed for the dashboard
  incomeReceived: number
}): { pointsShort: number, euroPerMonth: number } | null
```

Returns `null` when the target is already met (`actualPercent >= targetPercent`) or when
`incomeReceived` is 0 — there is no meaningful advice in either case, and the page shows
nothing rather than "il manque -3 points". Otherwise `pointsShort` is the difference and
`euroPerMonth` is `pointsShort % × incomeReceived`, matching the mockup's 5 points → 116 €.

### 3.4 Months of charges covered

```ts
export function monthsOfChargesCovered(totalSaved: number, monthlyFixedCharges: number): number | null
```

`totalSaved / monthlyFixedCharges`, rounded to one decimal, and **`null` when
`monthlyFixedCharges` is 0** so the sidebar omits the line rather than printing `Infinity`.

**On the mockup's figure.** The Sécurité poche's target is `2 583 = 3 × 861`, and 861 € is
the fixed-charges total, which fixes the divisor as monthly fixed charges. By that
definition the mockup's own `8 412 €` total yields **9.8 months**, not the `4,1` printed
beside it. No combination of the mockup's numbers produces 4.1, so the printed value is
treated as illustrative. This spec implements the definition the Sécurité target implies;
the page will show a different number from the mockup, deliberately.

### 3.5 Month contributions

```ts
export function monthContributions(input: {
  entries: { savingsGoalId: string, amount: number }[]
  poches: { id: string, name: string, receivesSalaryVariance: boolean }[]
  salaryVariance: number
}): { kind: 'contribution' | 'variance', label: string, detail: string, amount: number }[]
```

Two kinds only — closure leftovers are out of scope (§2):
- one `contribution` row for the month's total across all poches, when it is non-zero;
- one `variance` row when `salaryVariance` is non-zero, labelled with the poche that has
  `receivesSalaryVariance`, or "vers l'épargne" when no poche is marked. A negative
  variance is shown as such rather than hidden: an underpaid month is information.

## 4. Schema change

`savings_goals` gains three columns, all nullable or defaulted so existing rows stay valid:

```ts
targetAmount: numeric('target_amount', { precision: 10, scale: 2 }),
monthlyAmount: numeric('monthly_amount', { precision: 10, scale: 2 }).notNull().default('0'),
note: text('note'),
```

`shared/schemas/savingsGoal.ts` gains input and patch schemas. `targetAmount` and
`monthlyAmount` are **`z.coerce.number()`**, because every form in this app submits
amounts from a text input — the non-coerced version has now caused a 400 on envelopes and
again on categories, and there is no reason to repeat it a third time.

RLS needs no work: `savings_goals` is already covered by the `authenticated` policy from
`drizzle/migrations/0002_enable_rls.sql`, and adding columns does not change that.

## 5. API

`GET /api/epargne` — one endpoint composing the page:

```ts
interface EpargnePayload {
  month: { year: number, month: number, label: string }
  income: { received: number }
  poches: PocheView[]
  totals: { balance: number, monthly: number, monthsOfChargesCovered: number | null }
  history: { year: number, month: number, label: string, amount: number }[]
  ruleOfThumb: {
    targets: { besoins: number, envies: number, epargne: number }
    actuals: { besoins: number, envies: number, epargne: number }
    advice: { pointsShort: number, euroPerMonth: number } | null
  }
  contributions: { kind: 'contribution' | 'variance', label: string, detail: string, amount: number }[]
}
```

`POST /api/savings-goals` and `PATCH /api/savings-goals/[id]` create and edit poches,
following the existing `requireUser` → `validateBody` → `insertRow`/`patchRow` pattern.

`income.received` is carried explicitly because the page cannot infer "no income yet" from
the 50/30/20 actuals: those are zero both when nothing has been earned and when nothing has
been spent, and only the first case should swap the panel for a prompt.

**Reused unchanged, not reimplemented:** `compute503020` from
`server/utils/domain/dashboard.ts` for the 50/30/20 panel, and `summariseFixedCharges` from
`server/utils/domain/accountsOverview.ts` for the charges divisor.

**Deliberately *not* reused, despite the obvious names:**
- `partitionExpenses` — `compute503020` takes `taggedSpend`, not a partition. The besoins /
  envies partition feeds the *dashboard's* expense breakdown, and `EpargnePayload` has no
  such field, so computing one here would be dead work.
- `fetchSavings` from `server/utils/savingsQuery.ts` — it is month-scoped
  (`fetchSavings(event, year, month)`), while §3.1 needs each poche's balance to sum **all**
  entries for all time: the design's 5 184 € is a running total, not a month's figure. This
  route reads `savings_entries` unfiltered and derives the month's rows in memory, which
  also avoids a second round trip.

**Pool budget.** This route needs the fixed-charge categories and the month's expenses,
both of which already come from the Data API on `/comptes`. It must **not** call
`listBudgetEnvelopeLedgers` or `listReserveEnvelopeBalances`: those are the pool-backed
helpers that make `/api/dashboard` and `/api/accounts/overview` the heaviest routes, and
nothing on this page needs envelope ledgers. Keeping `/api/epargne` entirely on the Data
API leaves the pool untouched by a sixth page.

## 6. Page

`app/pages/epargne.vue`, with `useFetch('/api/epargne', { key: 'epargne' })` — an explicit
key, and a visible error branch distinct from an empty state, as every other page has.

- **Header:** `Épargne`, a badge reading `{totalMonthly} € répartis chaque mois`, and
  `+ Nouvelle poche`.
- **Les trois poches:** one card per poche with name, note, balance, target and a progress
  bar; a poche with no target shows no bar. Each card edits inline — name, note, montant
  mensuel, objectif — through a small `PocheEditForm` component rather than inline markup,
  keeping the page readable.
- **Six derniers mois:** a hand-rolled bar chart, built from flex-sized `<div>` bars. Six
  bars do not justify a charting dependency, which is the same call made for the dashboard
  donut — but the donut uses SVG out of necessity, because arcs cannot be drawn with divs,
  not as a house style for every chart. Plain divs need no viewBox arithmetic and reflow
  with the card, so they are the simpler choice for bars. The tallest bar scales to the
  maximum in the window; an all-zero window renders flat bars with their labels rather than
  dividing by zero.
- **Règle 50 / 30 / 20:** targets against actuals, plus the gap advice when there is any.
- **Versements du mois:** the contribution and variance rows from §3.5.
- **Sidebar-style total:** `Épargne totale`, `+{month} € ce mois`, and the months-covered
  line when it is not null.

**Zero states are first-class.** With no income the 50/30/20 panel shows a prompt instead
of percentages; with no savings entries the history renders six zero bars and the poches
show 0 € against their targets. Both are reachable today — `savings_entries` has one row
and `income_entries` has none — so they are the default view, not an edge case.

All money renders through `formatEuro` / `formatEuroShort` from `app/utils/currency.ts`.
Forms carry the `isHydrated` and `isSubmitting` guards and the comma-decimal
normalisation standardised after the login incident.

## 7. Testing

**Unit** — the domain module, where the logic is:
- `summarisePoches`: balance sums all months not just the current one; `progressPercent`
  is null for a null or zero target; the mockup's three poches produce 8 412 € and 345 €.
- `monthlyHistory`: a month with no entries appears as zero rather than being skipped;
  the window is exactly six long and ends at the requested month; year boundaries.
- `savingsGapAdvice`: 20 vs 15 over 2 316 € income gives 5 points and ~116 €; null when
  the target is met; null at zero income.
- `monthsOfChargesCovered`: null when charges are 0; one-decimal rounding.
- `monthContributions`: the variance row names the poche that receives it; falls back when
  none is marked; a negative variance is preserved.

**Query module** — mocked Supabase client as in `movementsQuery.test.ts`: filters scoped
to the month, a failed request throwing rather than returning partial data, and an
assertion that no pool-backed helper is called (§5's pool constraint, pinned by a test
rather than left as prose).

**E2E** — signed in: the page renders and survives a reload; creating a poche makes it
appear and persist; editing its target changes the progress bar; `/api/epargne` returns
401 without a session.

## 8. Out of scope

Livrets and their two companion tables; closure leftovers; deleting or archiving a poche
(the three seeded ones plus creation is enough, and archiving needs a column that does not
exist); month navigation; and any change to how savings entries are recorded — the
dashboard's form remains the single writer.
