# Compte rendu — Design Spec

**Date:** 2026-10-13
**Parent spec:** `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md` (implements its milestone 5, minus the scheduled email — see §2)
**Layout reference:** `docs/superpowers/specs/2026-09-20-desktop-web-redesign-design.md` §4.7

## 1. Goal

Build `/compte-rendu`, the last unbuilt page (the sidebar links to it and 404s today). It
closes a finished month: every `budget` envelope's leftover gets a destination, the next
month's ceilings are written, the closed month is frozen, and a two-page PDF report is
archived and downloadable.

It also delivers the two pieces deliberately left out of earlier milestones: the
dashboard's "Clôturer le mois" entry point and the Épargne page's "Reliquats de clôture"
contribution row.

## 2. Decisions

Settled during brainstorming; each is final for this milestone.

| Question | Decision | Why |
|---|---|---|
| Scope | **Closure + PDF + archive. No scheduled email.** | Email needs a provider, an API key, Vercel Cron and a protected endpoint — a sub-project of its own. `monthly_reports.emailed_at` is kept for it. |
| Can a closure be undone? | **No. Closure is final**, behind a confirmation step that recaps everything. | Matches the parent spec, keeps the archived PDF truthful, and there are no delete endpoints to unwind with. Mistakes are corrected with a transfer or a manual savings entry in the next month. |
| Draft persistence | **None.** Destination choices live in page state until validation. | A single sitting is enough for ~9 envelopes; persistence would add a table and a sync problem for no real gain. |
| Which month can be closed? | **Strictly in order: the oldest finished, unclosed month**, starting from the first month that has any data. | A closure writes the next month's allocations; closing out of order would compute leftovers from ceilings that do not yet include the earlier month's carry-overs. |
| When is a month "finished"? | From 00:00 Europe/Paris on the 1st of the following month. | The household is in France; server time on Vercel is UTC. |
| A positive leftover left on "À décider" | **Blocks validation.** The "Non réparti" tile counts down to 0. | No silent default; the two shortcuts make deciding a one-click job. |
| Movements dated in a closed month | **Rejected (`409`)** on every create endpoint. | The only option that keeps the PDF and the leftovers true. Forms already have a "mois d'affectation" field to move the entry to an open month. |
| PDF approach | **Frozen JSON snapshot + server-side `pdfkit`**, rendered on demand. | Pure JS, light on Vercel cold starts, no file storage. The snapshot freezes names and figures, so an archive stays exact after a later rename. The renderer is swappable (`pdfmake` is the fallback — §6.3). |
| Mockup's "Compte rendu — aperçu" paginated PDF preview | **Replaced by a "Résumé du mois" card.** | A live paginated preview of the PDF is expensive and adds little over the summary figures it would show. |
| Full closure in E2E (parent spec §10) | **Deliberately not done.** | The E2E suite runs against the live database and closure is irreversible — a test would permanently close the household's real month. See §8. |

## 3. Domain logic (pure, unit-tested)

`server/utils/domain/closure.ts`

### 3.1 Closable month

```ts
export function closableMonth(input: {
  firstDataMonth: { year: number, month: number } | null
  closedMonths: { year: number, month: number }[]
  now: Date
}): { year: number, month: number } | null
```

- `firstDataMonth` is the earliest `(year_assigned, month_assigned)` across
  `expense_entries`, `income_entries` and `transfers`, and `(year, month)` across
  `savings_entries`. `null` when there is no data → nothing to close.
- Walk forward from `firstDataMonth`; return the first month that is not in
  `closedMonths` **and** is finished (its following month's 1st, 00:00 Europe/Paris, is
  `<= now`). Return `null` when that first unclosed month is not finished yet.

### 3.2 Leftovers

For every non-archived `budget` envelope of month M, `remaining` from
`computeEnvelopeLedger` (unchanged) is the leftover. Reserve envelopes never take part —
their balance already carries forward indefinitely.

| Leftover | Treatment |
|---|---|
| `> 0` | Needs a decision: `carry_over`, `savings` (+ goal) or `envelope` (+ target). |
| `= 0` | No decision, nothing written. |
| `< 0` | No decision allowed. `overspend_deduction = −leftover` on the envelope's own M+1 allocation. |

### 3.3 Planning the closure

```ts
export interface ClosureDecision {
  envelopeId: string
  destination: 'carry_over' | 'savings' | 'envelope'
  savingsGoalId?: string     // required iff destination = 'savings'
  targetEnvelopeId?: string  // required iff destination = 'envelope'
}

export function planClosure(input: {
  month: { year: number, month: number }
  envelopes: { id: string, defaultCeiling: number, leftover: number, hasAllocation: boolean }[]
  decisions: ClosureDecision[]
  savingsGoalIds: string[]
}): ClosurePlan   // throws ClosurePlanError with a French message on any invalid input
```

Validation (each a `ClosurePlanError`):
- every envelope with `leftover > 0` has exactly one decision;
- no decision for an envelope with `leftover <= 0`, or for an unknown envelope;
- `savingsGoalId` exists; `targetEnvelopeId` is another non-archived `budget` envelope,
  never the source itself.

Output (`ClosurePlan`):
- **`decisions`** — one row per positive leftover, for `closure_envelope_decisions`.
- **`nextAllocations`** — one row per budget envelope for M+1:
  `base_ceiling = defaultCeiling` (at closure time),
  `carried_over_amount = ` sum of leftovers sent to this envelope (its own `carry_over`
  plus any `envelope` destinations pointing at it),
  `overspend_deduction = ` its own overspend, else 0.
- **`freezeAllocations`** — for every envelope with `hasAllocation = false` in M:
  `{ base_ceiling: defaultCeiling, carried_over_amount: 0, overspend_deduction: 0 }`.
  Without it, M's ceiling is read live from `default_ceiling`, and editing that later
  would rewrite a closed month's history.
- **`savingsEntries`** — one row per savings goal receiving leftovers, summed, dated
  **month M**, `source = 'closure'`.
- **`totals`** — `{ carriedOver, toSavings, toOtherEnvelopes, overspendDeducted }` for
  the confirmation recap and the snapshot.

### 3.4 Report snapshot

`server/utils/domain/reportSnapshot.ts` — `buildReportSnapshot(...)` assembles a
plain, fully-denormalised object (names and emojis copied, amounts as numbers):

```ts
export interface ReportSnapshotV1 {
  version: 1
  month: { year: number, month: number, label: string }   // "Septembre 2026"
  closedAt: string                                          // ISO
  summary: { income: number, spent: number, saved: number, remaining: number }
  rule503020: { targets: Record<Bucket5030, number>, actuals: Record<Bucket5030, number> }
  incomes:   { date: string, label: string, typeName: string, typeEmoji: string, amount: number, targetEnvelopeName: string | null }[]
  expenses:  { date: string, label: string, categoryName: string, categoryEmoji: string, envelopeName: string | null, financedBy: string, amount: number }[]
  transfers: { date: string, fromName: string, toName: string, reason: string | null, amount: number }[]
  envelopes: { name: string, emoji: string, ceiling: number, netSpent: number, leftover: number, destinationLabel: string | null }[]
  savings:   { goalName: string, manual: number, fromClosure: number }[]
  closure:   ClosurePlan['totals']
}
```

Figures reuse the existing pure functions (`summariseIncome`, `compute503020`,
`computeEnvelopeLedger`) so the PDF agrees with the dashboard to the cent.

## 4. Schema changes

One generated migration (`npm run db:generate`; **never** `drizzle-kit push` — it would
silently disable RLS) plus one hand-written SQL migration.

- `monthly_reports.snapshot jsonb NOT NULL` (table has 0 rows, so no default needed).
- `monthly_reports.pdf_path` becomes nullable — no file is stored.
- Unique index on `monthly_reports.month_closure_id` (one report per closure).
- `savings_entries.source` — new enum `savings_entry_source` (`manual` | `closure`),
  `NOT NULL DEFAULT 'manual'`. Existing rows become `manual`.
- `POST /api/savings`'s read-then-write upsert adds `source = 'manual'` to its lookup,
  so a manual save never overwrites a closure contribution.

### 4.1 `close_month` (hand-written migration)

A `plpgsql` function, `SECURITY INVOKER` (RLS still applies), called through
`supabase.rpc('close_month', { payload })`. Drizzle does not manage functions, so a later
`db:generate` will not drop it.

`payload`: `{ year, month, decisions, nextAllocations, freezeAllocations, savingsEntries, snapshot }`.

In one transaction it:
1. raises `MONTH_ALREADY_CLOSED` if a `closed` row exists for `(year, month)`;
2. raises `PREVIOUS_MONTH_OPEN` if the previous month has data and no `closed` row
   (the database-side twin of §3.1, closing the race between two tabs);
3. inserts `month_closures` (`status = 'closed'`, `closed_at = now()`);
4. inserts `closure_envelope_decisions`;
5. inserts `freezeAllocations` for M `ON CONFLICT (envelope_id, year, month) DO NOTHING`;
6. upserts `nextAllocations` for M+1 `ON CONFLICT … DO UPDATE` of
   `carried_over_amount` and `overspend_deduction` only (an existing `base_ceiling` is kept);
7. inserts `savings_entries` with `source = 'closure'`;
8. inserts `monthly_reports` (`snapshot`, `generated_at = now()`).

Any failure rolls everything back.

## 5. API

Every route stays on the Supabase Data API, like `/api/epargne`: no pool slot, every
request under `AbortSignal.timeout(10000)`, errors logged before they are thrown. None of
them may import `listBudgetEnvelopeLedgers`.

| Route | Returns / does |
|---|---|
| `GET /api/closure/status` | `{ closableMonth: { year, month, label } \| null }`. Cheap: closures + first-data-month only. Used by the dashboard header. |
| `GET /api/closure` | `closableMonth`, `envelopes` (id, name, emoji, ceiling, netSpent, leftover), `summary` + `rule503020` for "Résumé du mois", `savingsGoals` and `budgetEnvelopes` (destination options), `nextOpening` (date the next closure becomes possible, for the empty state), `archives` (`[{ year, month, label, generatedAt }]`, newest first). |
| `POST /api/closure` | Body `{ year, month, decisions }` (zod). Rejects with `409` unless `(year, month)` equals `closableMonth`. Recomputes leftovers server-side — never trusts client amounts — then `planClosure` → `buildReportSnapshot` → `rpc('close_month')`. `ClosurePlanError` → `400`; `MONTH_ALREADY_CLOSED` / `PREVIOUS_MONTH_OPEN` → `409`. Returns `{ year, month }`. |
| `GET /api/reports/[year]/[month]` | `400` on an invalid month, `404` if no report. Otherwise renders the snapshot (§6) and responds `application/pdf`, `Content-Disposition: attachment; filename="budget-2026-09.pdf"`. |

The envelope-ledger computation for a single month on the Data API lives in
`server/utils/closureQuery.ts`, feeding the unchanged `computeEnvelopeLedger`.

### 5.1 Closed-month lock

`server/utils/monthLock.ts` — `assertMonthOpen(event, year, month)` queries
`month_closures` through the Data API and throws `409` with
`"Septembre 2026 est clôturé. Affectez ce mouvement à un mois ouvert."` when closed.

Called by `POST /api/expenses`, `POST /api/incomes`, `POST /api/transfers` (on the
assigned month) and `POST /api/savings` (on `year`/`month`). The entry forms and the
Épargne form already render server messages in their error banner; this is verified,
not assumed (§8).

Envelope ceiling edits need no lock: `PATCH /api/envelopes/[id]` writes only
`default_ceiling`, and §3.3's freeze makes closed months independent of it.

### 5.2 Default ceiling edits reach open months

A closure writes month M+1's allocation with a `base_ceiling` snapshot, so the default
ceiling alone no longer reaches M+1. `PATCH /api/envelopes/[id]`, when it changes
`defaultCeiling`, also updates `base_ceiling` on that envelope's allocations for every
month that is **not** closed. Closed months keep the figure their report used.

## 6. PDF

`server/utils/reportPdf.ts` — `renderReportPdf(snapshot: ReportSnapshotV1): Promise<Buffer>`.

### 6.1 Content (A4, two pages)

- **Page 1** — header "Compte rendu — Septembre 2026" with the closure date; four tiles
  (Revenus, Dépensé, Épargné, Reste); 50/30/20 actual vs target; incomes list;
  envelopes table (Plafond, Dépensé, Reliquat, Destination).
- **Page 2** — expenses grouped by category with subtotals; transfers; savings per poche
  (manual + from closure); closure summary (reporté, épargné, vers d'autres enveloppes,
  déduit).
- Overflowing lists continue on additional pages rather than being truncated.

### 6.2 Look

Palette tokens from `app/assets/css/main.css` (`ink`, `ink-muted`, `ink-faint`,
`divider`, `toggle-track`, `warn-ink`, `mint-ink`). Plus Jakarta Sans 600/700/800 TTF
files committed under `server/assets/fonts/` (SIL OFL) and loaded through Nitro server
assets. Amounts formatted by the same rules as `formatEuro` (fr-FR, space before `€`).

### 6.3 Known risk — verify first

`pdfkit` reads its built-in AFM font files from disk at construction, which commonly
breaks once Nitro bundles the server for Vercel. **The plan's first task is a spike**:
render a one-page PDF with the embedded font, `npm run build`, and download it from a
Vercel preview deployment. If it cannot be made to work cleanly, switch to `pdfmake`
(fonts embedded as data) — §3.4's snapshot and §5's API are unaffected.

## 7. Page

`app/pages/compte-rendu.vue`, two columns as in the desktop redesign §4.7.

### 7.1 Header

`PageHeader`: "Clôture de septembre 2026"; pill "124 € de reliquats à répartir" (sum of
positive leftovers); secondary "Télécharger le PDF" — disabled, since the month on screen
is by definition not yet closed (archived PDFs are downloaded from §7.3); primary
"Clôturer et ouvrir octobre", disabled until "Non réparti" reaches 0.

### 7.2 "Répartition des reliquats" card

- One sentence of explanation; shortcuts **Tout reporter** (every positive leftover →
  `carry_over`) and **Tout épargner** (→ `savings`, goal Long terme, i.e. the goal with
  `receives_salary_variance = true`).
- Four tiles: Reporté sur octobre · Vers l'épargne · Autre enveloppe · Non réparti.
- Table: Enveloppe · Reliquat · Destination. Destination is a `PillSelector`
  (`Reporter` / `Épargne` / `Enveloppe`), unset ("À décider") by default. Choosing
  `Épargne` or `Enveloppe` reveals a second selector on the row for the goal or target
  envelope (`Épargne` pre-selects Long terme).
- Overspent rows: `warn-bg`, leftover in `warn-ink`, destination replaced by
  "−12 € déduits du plafond d'octobre". Zero-leftover rows: "Rien à répartir".

### 7.3 Right column

- **"Résumé du mois"** — Revenus, Dépensé, Épargné, 50/30/20 actual vs target.
- **"Archives"** — closed months, newest first, each with a PDF link to §5's route.
  Empty: "Aucun mois clôturé pour l'instant."

### 7.4 Confirmation

The primary button opens a modal recapping per-envelope carry-overs, totals per savings
goal, transfers to other envelopes and overspend deductions, then
"Cette clôture est définitive : septembre ne pourra plus recevoir de mouvements."
with "Annuler" and "Confirmer la clôture". On success the page refetches and shows the
next closable month, or the empty state.

### 7.5 States

- Loading; error banner (`warn-bg`/`warn-ink`, one sentence).
- Nothing to close: "Rien à clôturer. Prochaine clôture possible le 1er novembre."
  (from `nextOpening`) — archives still shown.
- No positive leftover: tiles at 0, button enabled immediately.
- Every form carries the project's `isHydrated` + `isSubmitting` guards.

### 7.6 Entry points

- **Dashboard** header: a "Clôturer septembre" button linking to `/compte-rendu`,
  rendered **only** when `/api/closure/status` returns a month. Nothing otherwise.
- **Épargne**: `epargneQuery` selects `source`; `monthContributions` emits a
  "Reliquats de clôture" row for `closure` entries of the month, separate from manual
  contributions.
- **Sidebar**: the existing `/compte-rendu` link now resolves.

## 8. Testing

### 8.1 Unit (vitest)

- `closableMonth`: first month; several overdue months; current month unfinished;
  the Europe/Paris midnight boundary (31 Oct 22:59 UTC vs 23:00 UTC); no data; all
  caught up.
- `planClosure`: each destination; two leftovers sent to the same target summing;
  overspend; zero leftover; missing decision, decision on an overspent envelope,
  self-targeted envelope, unknown goal — each rejected; freeze rows only for envelopes
  without an M allocation.
- `buildReportSnapshot`: totals asserted against **hard-coded expected values**, never
  re-derived with the reduce under test.
- `buildReportLayout` (the pure snapshot → layout step the renderer draws): title,
  tiles, envelope rows and the closure summary asserted as exact strings; amounts use
  plain spaces, never U+202F/U+00A0.
- `renderReportPdf` on a fixture snapshot: output starts with `%PDF`, has 2 pages, and a
  long expense list continues onto extra pages instead of being cut.
- `assertMonthOpen`; the manual savings upsert ignoring `closure` rows;
  `monthContributions` emitting the closure row.

### 8.2 E2E (Playwright, live database)

Closure is irreversible and the suite runs on the live database, so **E2E never
validates a closure**:
- `/compte-rendu` loads with the real closable month; shortcuts fill destinations;
  "Non réparti" counts down and gates the button; choosing `Épargne`/`Enveloppe`
  reveals the second selector; the modal opens with the recap; **Annuler** closes it;
  a reload shows nothing was written.
- Dashboard shows the "Clôturer …" button while a month is closable.

### 8.3 First real closure (manual, with verification)

September 2026 is closable from today. The household performs that first closure
themselves, with the implementer checking afterwards that:
- `month_closures`, `closure_envelope_decisions`, both allocation sets, the closure
  `savings_entries` and `monthly_reports` rows match the recap;
- `/enveloppes` for October shows the carried amounts and deductions;
- the archived PDF downloads and reads correctly;
- creating an expense assigned to September returns the `409` message in the form.

A second, read-only E2E file is then added covering the PDF download and the `409`.

## 9. Out of scope

- Scheduled email of the report (next sub-project; uses `emailed_at`).
- Reopening a closed month.
- Persisted closure drafts.
- Livrets (still undesigned — see `docs/HANDOFF.md` §6).
- Mobile layout (tracked separately in `context-design.md`).
