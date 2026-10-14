# User feedback, part A — fixes and entry — Design Spec

**Date:** 2026-10-14
**Parent spec:** `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md`

## 1. Goal

Answer the first wave of household feedback on the live app. The feedback was split into three
sub-projects, each with its own spec → plan → implementation cycle:

- **A — fixes and entry (this spec):** the "Salaire reçu" bug, editing and deleting movements,
  an optional category when an expense comes out of an envelope, and savings as a proper
  money-out entry.
- **B — month navigation:** pick a month on the dashboard and on Mouvements, among months that
  already have data, to go back and correct them.
- **C — visualisations:** planned vs. actual (fixed charges, envelopes, total), history across
  previous months, a forecast view of fixed charges.

B and C are out of scope here (§8).

The feedback, verbatim in substance:

1. "Salaire reçu" on the dashboard stays at 0 although the salary was entered.
2. Movements can be neither edited nor deleted.
3. An expense must have a category even when it comes out of an envelope.
4. Savings cannot be taken out of the salary "in the money-out entries".

## 2. Decisions

Settled during brainstorming; each is final for this sub-project.

| Question | Decision | Why |
|---|---|---|
| How does the app know an income is a salary? | **A "C'est un salaire" flag and an expected amount on the income type**, set in Paramètres. | Today `summariseIncome` counts an income as salary only when it has an `expected_amount`, and no form ever sets one — so the figure is always 0. Setting it once per type, not per entry, is the only option that needs no extra typing at each payday. |
| How is the expected amount carried to entries? | **Copied by the server into `income_entries.expected_amount`** at creation. | Every downstream reader (dashboard, Épargne's salary-variance row, closure, PDF snapshot) already reads that column. Nothing else changes. |
| Incomes already entered before the flag | **Back-filled in open months only** when a type's flag or expected amount changes. | Fixes the household's current month; closed months are frozen and their reports must stay true. |
| Category when an envelope is chosen | **The Catégorie row disappears; the expense has no category.** Without an envelope, a category stays mandatory. | The envelope is already the more specific intent everywhere (`partitionExpenses`, 50/30/20, the feed). |
| How to edit / delete a movement | **Click a row on Mouvements → `DetailDrawer` with the prefilled entry form, "Enregistrer les modifications" and "Supprimer".** All four kinds: expense, income, transfer, savings. | Reuses the drawer and the forms; keeps the list uncluttered on mobile. |
| Delete confirmation | **Inline in the drawer** ("Supprimer définitivement ? Oui / Annuler"). | Browser `confirm()` dialogs are avoided across the app. |
| Movements in a closed month, closure versements | **Read-only drawer**, "Mois clôturé — non modifiable". | Closed months are frozen (see `assertMonthOpen`). |
| Savings semantics | **Each entry is an additive versement** (100 € on the 5th + 50 € on the 20th = 150 € this month), with a date. Replaces today's one-figure-per-poche-per-month upsert. | Consistent with every other money-out entry; each versement is a line that can be corrected. |
| Where savings are entered | **A 4th "Épargne" tab in the entry panel.** The dashboard's savings form is removed; the "Épargne versée" tile stays. | The feedback looked for it among the money-out entries and did not find the dashboard block. |

## 3. Schema changes

One Drizzle-generated migration (`npm run db:generate`, then `db:migrate`). **Never
`drizzle-kit push`** — it would disable RLS (see `docs/HANDOFF.md` §4).

- `income_types`
  - `is_salary boolean NOT NULL DEFAULT false`
  - `expected_amount numeric(10,2) NULL`
- `expense_entries`
  - `category_id` becomes nullable.
  - `CHECK (category_id IS NOT NULL OR envelope_id IS NOT NULL)` — named
    `expense_entries_category_or_envelope`. Drizzle cannot express it in the schema file, so it
    is appended by hand to the generated SQL, as `0002_enable_rls.sql` was.
- `savings_entries`
  - `date date NULL`. Set on every new manual versement; stays NULL on closure versements
    (written by `close_month`, unchanged) and on existing rows.

`close_month` is not touched: it inserts savings rows without a date, which the nullable column
allows.

## 4. API

Every endpoint keeps `requireUser`, `validateBody` and `withDbTimeout` as the existing ones do.

### 4.1 Salary

- `POST /api/incomes`: after validation, read the income type; if `is_salary` and
  `expected_amount` is set, write it into the entry's `expected_amount`. The request body does
  not change.
- `PATCH /api/income-types/[id]` accepts `isSalary` and `expectedAmount`. When either changes,
  update `expected_amount` of that type's entries **in open months only**: set to the type's
  expected amount if `is_salary`, to NULL otherwise. Open months are those without a `closed`
  status in the closure table (same source as `assertMonthOpen`).
- `GET /api/income-types` and the entry reference data return both new fields.

### 4.2 Optional category

- `shared/schemas/expenseEntry.ts`: `categoryId` becomes optional/nullable, with a refinement
  rejecting an input that has neither `categoryId` nor `envelopeId` (message in French:
  "Choisissez une catégorie ou une enveloppe.").
- **Every reader that joins `categories` from an expense must handle a missing category.**
  Known readers: `movementsFeed` (label falls back to the envelope, as it already prefers it),
  `dashboardQuery` (`categoryIsFixed` → false), `closureQuery` / `reportSnapshot`,
  `accountsOverview` (fixed-charge settlement ignores uncategorised expenses), `envelopeLedger`.
  The implementation plan must grep for all of them.

### 4.3 Savings versements

- `POST /api/savings` takes `{ savingsGoalId, date, amount }`. It always inserts a new
  `manual` row; `year` / `month` derive from `date`. The read-then-update logic is removed.
- Readers summing a month's savings (dashboard, Épargne) already sum rows, so additive entries
  need no change there.

### 4.4 Edit and delete

New routes, one pair per kind:

| Route | Edits |
|---|---|
| `PATCH` / `DELETE /api/expenses/[id]` | same fields as creation |
| `PATCH` / `DELETE /api/incomes/[id]` | same fields as creation; the salary copy of §4.1 re-applies if the type changes |
| `PATCH` / `DELETE /api/transfers/[id]` | same fields as creation |
| `PATCH` / `DELETE /api/savings/[id]` | poche, date, amount |

Rules, shared by all eight handlers:

- `404` if the row does not exist.
- `assertMonthOpen` on the row's **current** month; on a `PATCH` that changes the assigned
  month, also on the **destination** month.
- Month fields are re-derived exactly as the create endpoint derives them.
- A savings row with `source = 'closure'` is rejected (`409`, "Versement de clôture — non
  modifiable").
- `PATCH` bodies reuse the creation Zod schemas (full replacement, not partial), so validation
  stays in one place.

### 4.5 Movements feed

`movementsFeed` gains a `savings` kind (label: poche name, amount negative like other money out,
date: the row's `date`, or the 1st of its month when NULL). Every feed item carries `id`,
`kind` (`expense` | `income` | `transfer` | `savings`) and `editable` (false for closed months
and closure versements), so the page knows what to open and how.

## 5. Interface

### 5.1 Paramètres → Types de revenu

Each type gets a "C'est un salaire" checkbox and, shown only when checked, "Montant prévu (€)".

### 5.2 Entry panel

- New **Épargne** tab (`app/components/entry/SavingsForm.vue`): poche, amount (numeric keypad),
  date. Same structure and styling as the three existing forms.
- **Dépense**: when an envelope is selected, the Catégorie row is hidden and no `categoryId` is
  sent. Back to "Aucune" → the row reappears and is required again.
- All four forms accept an optional `initial` prop (an existing movement). With it, the submit
  button reads "Enregistrer les modifications" and the form sends a `PATCH`; it emits `saved`
  either way.

### 5.3 Mouvements

- A row click opens `DetailDrawer` with the matching form, prefilled.
- At the bottom: "Supprimer" → inline confirmation "Supprimer définitivement ? Oui / Annuler" →
  `DELETE`.
- `editable === false` → the drawer shows the movement read-only with "Mois clôturé — non
  modifiable".
- After save or delete: the drawer closes and the page data refreshes.
- API errors are shown in the drawer through `apiErrorMessage`, as the forms already do.

### 5.4 Dashboard

- The savings entry block is removed; "Épargne versée" stays.
- "Salaire reçu" needs no template change: it shows the real figure once §4.1 is in, and the
  "vs prévu" variance appears as soon as a salary type has an expected amount.

## 6. Testing

### 6.1 Unit (Vitest, `tests/unit`)

- `summariseIncome`: a salary-type income with an expected amount counts in "Salaire reçu"; the
  variance is correct.
- Salary copy at income creation; back-fill on type change touches open months and leaves
  closed months alone.
- `partitionExpenses` and `movementsFeed` with an envelope-only expense (no category), and with
  savings versements in the feed.
- Expense Zod schema: rejects neither-category-nor-envelope, accepts envelope-only.
- Edit/delete rules: rejected when the current or destination month is closed; rejected on a
  closure versement.
- Two versements for the same poche and month add up instead of replacing each other.

### 6.2 E2E (Playwright, live database)

In `entry.spec.ts` and `movements.spec.ts`:

- Enter a salary → "Salaire reçu" on the dashboard shows it.
- Enter an expense with an envelope and no category.
- Enter savings from the Épargne tab → it appears in Mouvements.
- Open a movement, edit it, then delete it.

Each test **deletes the rows it created** through the new `DELETE` routes — an improvement on
today, where `entry.spec` leaves permanent rows in the live database.

## 7. Rollout

1. Run the migration on Supabase (`npm run db:migrate`), checking RLS is still enabled on the
   three altered tables afterwards.
2. In Paramètres, flag the salary income type(s) and set the expected amount — this back-fills
   the current month and fixes the dashboard immediately.

## 8. Out of scope

- **Month selection** on the dashboard and Mouvements — sub-project B.
- **Charts**: planned vs. actual, multi-month history, fixed-charge forecast — sub-project C.
- Editing or deleting anything in a closed month, or a closure versement.
- Bulk edit or bulk delete.
