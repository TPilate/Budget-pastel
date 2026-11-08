# Accounts, wider transfers, month navigation, reopening, feedback.md small items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver everything in `feedback.md`: entry reset, search by amount, receipt check, editable accounts with live balances, transfers between the month's budget / envelopes / accounts (incl. the LDDS), a closure destination "vers un compte", an app-wide month selector, and reopening a closed month.

**Architecture:** Nuxt 4 app, Nitro routes, Supabase Postgres. Reads go through the Supabase Data API (`createSupabaseServerClient(event)`), writes through Drizzle + `withDbTimeout`. Pure logic lives in `server/utils/domain/*` and is unit-tested; queries in `server/utils/*Query.ts`; one `/api/pages/*` (or page-level) call per page. Closure writes are a hand-written plpgsql function (`close_month`); reopening is a second one (`reopen_month`), tested against PGlite.

**Tech Stack:** Nuxt 4.5, Vue 3.5, Drizzle ORM 0.36 / drizzle-kit 0.28, Supabase, zod 3, Vitest 2, Playwright, pdfkit, `@electric-sql/pglite` (new, dev only).

**Spec:** `docs/superpowers/specs/2026-10-28-comptes-transferts-mois-design.md` (approved 2026-11-08). Read it first; this plan argues from it and cites its sections as §n.

## Global Constraints

- **No data loss (§2).** Migrations are additive or relaxations only. Generate with `npm run db:generate`; hand-written-only migrations with `npx drizzle-kit generate --custom --name=<name>`. **Never `drizzle-kit push`.**
- **Live database = production data.** Before the first `npm run db:migrate` of this plan, take the backup in Task 3 Step 1. **Stop and ask the user before every `npm run db:migrate`** (it targets the live database through `DATABASE_URL`).
- Every new write route on a movement calls `assertMonthOpen` / `assertMovable` — except `PATCH /api/expenses/:id/verified` (§13.3), which must not.
- Every pool call is wrapped in `withDbTimeout`. New read code uses the Data API only, never `./db` (`docs/HANDOFF.md` §4).
- One data call per page navigation; `useLazyFetch` + `<PageSkeleton />`; no top-level `await useFetch`. `tests/e2e/perf.spec.ts` stays green.
- Amounts render only through `formatEuro` / `formatEuroShort` (`app/utils/currency.ts`). Amount text inputs normalise a French comma (`.trim().replace(',', '.')`); server schemas use `z.coerce.number()` for amounts that come from text inputs.
- All UI copy is French. User-facing errors go through `userError(status, statusMessage, frenchMessage)`.
- E2E runs against the live database: every spec deletes every row it creates (in a `finally`); **no E2E closes or reopens a month**.
- September 2026's existing report snapshot must still render (`ReportSnapshotV1`: new fields optional, old fields still read).
- Forms keep the `isHydrated` + `isSubmitting` guards (`docs/HANDOFF.md` §4).
- A test that asserts nothing is a defect (`docs/HANDOFF.md` §4): every worked example of §5.2 and the §7.2 round trip are real assertions.
- Commit after each task with the attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A malformed or out-of-range `?mois=`** (`abc`, `2026-13`, `2031-01` in the future, a bookmark from before the first data month): pages must still load, on the current Paris month for invalid/future values. Pinned in Task 12.
2. **Editing a transfer so that its source becomes, stays, or stops being "Budget du mois"**: the cap applies to the new amount with the transfer's own old effect removed, and only when the new source is the budget. Pinned in Task 8.
3. **An existing transfer pointing to an account archived since**: it still displays the account's name and can be edited if the account is unchanged; a *new* transfer to it is refused. Pinned in Task 6.
4. **Reopening a month while the following month already has movements and carried-over ceilings**: the following month's carry-over and overspend deduction go back to 0, its movements are untouched. Pinned in Task 14.
5. **Search with thousands and signs** (`1 234,50`, `-12`, `12 €`): matches the amount. Pinned in Task 2.

---

## File structure (decided)

| File | Responsibility |
|---|---|
| `app/utils/movementSearch.ts` (new) | `matchesMovementSearch` |
| `server/api/expenses/[id]/verified.patch.ts` (new) | tick/untick an expense |
| `server/utils/domain/accountBalance.ts` (new) | `computeAccountBalance` |
| `server/utils/accountBalanceQuery.ts` (new) | `fetchAccountBalances(event)` (Data API) |
| `app/components/AccountEditForm.vue` (new) | edit one account in Paramètres |
| `shared/schemas/transfer.ts` | new endpoint-based input |
| `server/utils/transferRules.ts` (new) | endpoint validation, row values, budget-cap check |
| `server/utils/domain/transferFlows.ts` (new) | entering / leaving / savings / budget libre |
| `server/utils/budgetLibreQuery.ts` (new) | `fetchBudgetLibre(event, ym, opts)` |
| `drizzle/migrations/0008…0013` | see tasks |
| `server/utils/domain/monthParam.ts` (new) | `parseMonthParam` |
| `server/utils/monthContext.ts` (new) | `fetchMonthContext(event, selected)` |
| `app/composables/useSelectedMonth.ts` (new) | shared month selection from `?mois=` |
| `app/components/MonthSelector.vue`, `ClosedMonthBanner.vue`, `ReopenMonthConfirm.vue` (new) | month UI |
| `tests/unit/sql/pglite.ts` (new) | PGlite harness applying every migration |

---

## Part 0 — feedback.md small items (§13)

### Task 1: Reset entry forms after a successful creation (§13.1)

**Files:**
- Modify: `app/components/entry/ExpenseForm.vue`, `IncomeForm.vue`, `TransferForm.vue`, `SavingsForm.vue`
- Test: `tests/e2e/entry-reset.spec.ts` (new)

**Interfaces:**
- Consumes: `useAmountInput()` already returns `reset()` (`app/composables/useAmountInput.ts`).
- Produces: nothing new for later tasks. Task 9 rewrites `TransferForm` and must keep this behaviour.

- [ ] **Step 1: Write the failing E2E** `tests/e2e/entry-reset.spec.ts`, using the same credential guard, `typeAmount` and local `today()` helpers as `tests/e2e/movement-edit.spec.ts`:
  - `test('after saving an expense the form is empty and cannot be saved again')`: open `/mouvements`, wait for `#__nuxt.__vue_app__` and for `[data-testid="entry-loading"]` to disappear, type `7` `3`, fill Libellé `E2E reset sortie`, click "Enregistrer". Wait for the POST `/api/expenses` response and keep its `id`. Then `expect(page.getByText(/^0 €|^0\s*€/)).toBeVisible()` on the amount display. Also check the Libellé input has value `''` and the submit button is disabled. In `finally`: `DELETE /api/expenses/{id}`.
  - `test('after saving an income the form is empty')`: same with the "+ Entrée" tab, label `E2E reset entrée`, then `DELETE /api/incomes/{id}`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/entry-reset.spec.ts`. Expected: FAIL (amount still `73`).
- [ ] **Step 3: Implement.** In each form, after a successful `$fetch` and **only when `!props.editing`**, reset before `emit('saved')`:
  - Expense: amount (`reset()`), `label`, `envelopeId`.
  - Income: amount, `label`, `detailsText`, `targetEnvelopeId`.
  - Transfer: amount, `reason`. The endpoints are reset to the form's initial defaults.
  - Savings: amount.
  - Keep date, category, account, "financé par", income type and poche (§13.1 builder's call). Nothing is reset on error.
- [ ] **Step 4: Run** the spec again. Expected: PASS. Run `npm test`. Expected: all green.
- [ ] **Step 5: Commit** `fix(entry): empty the form after saving so the same entry cannot be saved twice`.

### Task 2: Search by amount in Mouvements (§13.2)

**Files:**
- Create: `app/utils/movementSearch.ts`
- Modify: `app/pages/mouvements.vue:27-33` and the placeholder at `:88`
- Test: `tests/unit/app/movementSearch.test.ts`

**Interfaces:**
- Produces: `matchesMovementSearch(movement: { label: string, amount: number }, query: string): boolean`. Task 3 adds a filter next to it.

- [ ] **Step 1: Write the failing test.**

```ts
const m = (label: string, amount: number) => ({ label, amount })
it.each([
  ['12', m('Courses', -12.5), true],
  ['12,5', m('Courses', -12.5), true],
  ['12.50', m('Courses', -12.5), true],
  ['12 €', m('Courses', -12.5), true],
  ['-12', m('Courses', -12.5), true],
  ['1 234,50', m('Loyer', -1234.5), true],
  ['13', m('Courses', -12.5), false],
  ['ticket', m('Ticket 12', -3), true],
  ['12', m('Ticket 12', -3), true],   // label match still counts
  ['', m('X', 1), true],
])('%s → %s', (query, movement, expected) => expect(matchesMovementSearch(movement, query)).toBe(expected))
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/app/movementSearch.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the matching rule from §13.2. The label matches case-insensitively. When the query, after removing whitespace (including NBSP), `€` and a leading `-`/`+`, matches `^\d+([.,]\d{0,2})?$`, the amount also matches: compare against `Math.abs(amount).toFixed(2).replace('.', ',')` containing the query with `.` → `,`. Use it in `filteredMovements`. Set the placeholder to `Rechercher un libellé ou un montant…`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mouvements): search a movement by its amount`.

### Task 3: "Vérifié avec le ticket" on expenses (§13.3) — plus the backup routine

**Files:**
- Modify: `drizzle/schema/transactions.ts` (`expenseEntries`), `shared/types/movement.ts`, `server/utils/domain/movementsFeed.ts`, `server/utils/movementsQuery.ts` (`EXPENSE_SELECT`), `app/pages/mouvements.vue`
- Create: `drizzle/migrations/0008_*.sql` (generated), `server/api/expenses/[id]/verified.patch.ts`, `shared/schemas/expenseVerified.ts`, `backups/.gitignore` (content `*` + `!.gitignore`)
- Test: `tests/unit/server/api/expenseVerified.test.ts`, `tests/unit/server/utils/domain/movementsFeed.test.ts` (extend), `tests/e2e/expense-verified.spec.ts`

**Interfaces:**
- Produces: column `expense_entries.verified_at timestamptz NULL`, i.e. `expenseEntries.verifiedAt` (the spec says `expenses`; the table is `expense_entries`). `Movement.verified?: boolean`, set for `type === 'expense'` only. `RawExpenseMovement.verified: boolean`. `expenseVerifiedSchema = z.object({ verified: z.boolean() })`.

- [ ] **Step 1: Back up the live database (once for the whole plan).** Ask the user to confirm first. Run `set -a; source .env; set +a; pg_dump "$DATABASE_URL" --data-only --schema=public -Fc -f backups/$(date +%F)-before-comptes-transferts.dump`, then check the file is non-empty. Record in `docs/HANDOFF.md` §6 how to restore it: `pg_restore --data-only --disable-triggers -d "$DATABASE_URL" <file>` into a schema at the same migration level, or Supabase dashboard → Database → Backups.
- [ ] **Step 2: Write failing tests.**
  - `expenseVerified.test.ts` uses the mock style of `tests/unit/server/api/movementWrite.test.ts` and imports `server/api/expenses/[id]/verified.patch.ts`:
    - `it('sets verified_at when verified is true')`: the `set` call receives `verifiedAt` as an instance of `Date`.
    - `it('clears verified_at when verified is false')`: `verifiedAt: null`.
    - `it('does not check the month lock')`: `lock.assertMonthOpen` was not called.
    - `it('404s with "Ce mouvement n\'existe plus." when the row is gone')`.
  - `movementsFeed.test.ts`: `it('carries verified on expenses only')`. An expense raw row with `verified: true` gives `verified: true`. Income, transfer and savings movements have `verified` undefined.
- [ ] **Step 3: Run** `npx vitest run tests/unit/server/api/expenseVerified.test.ts tests/unit/server/utils/domain/movementsFeed.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - Schema column `verifiedAt: timestamp('verified_at', { withTimezone: true })`, then `npm run db:generate`. Check the SQL is a single `ALTER TABLE "expense_entries" ADD COLUMN "verified_at" timestamp with time zone;`.
  - The route: `requireUser`, `requireId`, validate, `loadRowOr404`, `updateRow(expenseEntries, id, { verifiedAt: verified ? new Date() : null })`, and return `{ id, verified }`.
  - Add `verified_at` to `EXPENSE_SELECT` and map it to `verified: row.verified_at !== null`.
  - `PATCH /api/expenses/:id` must not touch `verifiedAt`. `expenseRowValues` doesn't include it, so just keep it that way.
- [ ] **Step 5: UI in `mouvements.vue`.**
  - Add a last column with a checkbox, only for `movement.type === 'expense'`. Use `@click.stop`, `aria-label="Vérifié avec le ticket — {label}"`, and a green ✓ (`text-mint-ink`) when checked. It is enabled even when `movement.editable` is false.
  - The toggle is optimistic: flip `movement.verified`, call `PATCH /api/expenses/{id}/verified`. On error, flip it back and show `apiErrorMessage(error) ?? 'Impossible de mettre à jour la vérification.'` above the table. Don't call `refreshNuxtData`.
  - Add a filter option `{ value: 'to_verify', label: 'À vérifier' }` that keeps `type === 'expense' && !verified`.
  - Add a counter under the header: `{n} sorties à vérifier`, or `Toutes les sorties sont vérifiées` when n = 0. It counts the month's expenses that are not ticked.
- [ ] **Step 6: E2E** `tests/e2e/expense-verified.spec.ts`: `test('ticking an expense survives a reload and updates the counter')`.
  - Create an expense via `POST /api/expenses` (label `E2E ticket`, today) and read the counter number.
  - Tick its row checkbox and check the counter dropped by 1.
  - Reload, then check the checkbox is still checked and "À vérifier" doesn't list the row.
  - Untick it.
  - In `finally`: `DELETE /api/expenses/{id}`.
- [ ] **Step 7: Ask the user, then `npm run db:migrate`.** Run `npm test` and the new E2E. Expected: PASS.
- [ ] **Step 8: Commit** `feat(mouvements): tick an expense once checked against its receipt`.

---

## Part 1 — Accounts (§4)

### Task 4: Balance model and balance editing on the server (§4.2)

**Files:**
- Modify: `drizzle/schema/reference.ts` (`accounts`), `shared/schemas/account.ts`, `server/api/accounts/[id].patch.ts`, `server/utils/accountsOverviewQuery.ts`, `server/utils/pageData.ts` (`getParametresPage`)
- Create: `drizzle/migrations/0009_*.sql`, `server/utils/domain/accountBalance.ts`, `server/utils/accountBalanceQuery.ts`
- Test: `tests/unit/server/utils/domain/accountBalance.test.ts`, `tests/unit/shared/schemas/patchSchemas.test.ts` (extend), `tests/unit/server/api/accountPatch.test.ts` (new), `tests/unit/server/utils/accountsOverviewQuery.test.ts` (adapt)

**Interfaces:**
- Produces:
  - Column `accounts.reference_set_at timestamptz NOT NULL DEFAULT now()`, i.e. `accounts.referenceSetAt`. The default back-fills existing rows to the migration time, which §4.2 requires.
  - `computeAccountBalance(input: { referenceBalance: number, referenceSetAt: string, transfers: { fromAccountId: string | null, toAccountId: string | null, amount: number, createdAt: string }[] }, accountId: string): number`
  - `fetchAccountBalances(event: H3Event): Promise<Map<string, number>>`. It covers every account, archived included, through the Data API. In this task it calls `computeAccountBalance` with an empty transfer list, since no transfer can touch an account yet; Task 6 makes it read the account-side transfers.
  - `accountPatchSchema` gains `balance: z.coerce.number().optional()`.
  - `getParametresPage` returns `accountBalances: Record<string, number>`.

- [ ] **Step 1: Write failing tests.**
  - `accountBalance.test.ts`:
    - `it('adds transfers in and subtracts transfers out created after the reference')`: ref 1000 set `2026-11-01T10:00Z`. In: 150 created `11-02`. Out: 40 created `11-03`. Expect 1110.
    - `it('ignores transfers created before or exactly at the reference')`: a 500 transfer created `2026-10-31` is ignored. Expect 1000.
    - `it('ignores transfers of other accounts')`.
  - `patchSchemas.test.ts`: `accountPatchSchema.parse({ balance: '1234,5'.replace(',', '.') }).balance === 1234.5`, and `{ name: 'X' }` has no `balance`.
  - `accountPatch.test.ts` mocks db like `movementWrite.test.ts`:
    - `it('writes current_balance and reference_set_at together when balance is sent')`: the `set` receives `currentBalance: '250'` and `referenceSetAt` as an instance of `Date`.
    - `it('leaves both untouched when only name, emoji or kind change')`.
- [ ] **Step 2: Run** these tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Schema column, then `npm run db:generate`. Check the SQL is one `ADD COLUMN ... DEFAULT now() NOT NULL`.
  - The PATCH maps `balance` to `{ currentBalance: String(balance), referenceSetAt: new Date() }` and strips `balance` from the rest.
  - `fetchAccountsOverview` uses `fetchAccountBalances` for each account's `balance` (in its `Promise.all`; Data API only).
  - `getParametresPage` adds `accountBalances`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Ask the user, then `npm run db:migrate`.** Commit `feat(comptes): account balance = hand-set reference + later transfers; editable through PATCH`.

### Task 5: Edit an account in Paramètres (§4.1)

**Files:**
- Create: `app/components/AccountEditForm.vue`
- Modify: `app/pages/parametres.vue` (Comptes section, `:233-252`)
- Test: `tests/e2e/comptes-edit.spec.ts` (extend; read it first, it already exists)

**Interfaces:**
- Consumes: `PATCH /api/accounts/:id` with `{ name?, emoji?, kind?, balance? }` (Task 4); `page.accountBalances` (Task 4).

- [ ] **Step 1: Write the failing E2E** `test('an account can be renamed, switched to épargne and given a balance')`.
  - Create an account via `POST /api/accounts` (`zz-e2e-compte`).
  - In Paramètres, click its chip and set name `zz-e2e-compte-2`, kind "Épargne", balance `123,45`, then save.
  - On `/comptes`, check the row shows `123,45 €`.
  - In `finally`, archive it via `PATCH { archivedAt }`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** `AccountEditForm.vue`. Follow `PocheEditForm.vue`'s pattern (props `account`, `balance`; emits `saved`, `cancel`; `isHydrated` + `isSubmitting`).
  - Fields: emoji, name, kind (`courant` → "Courant", `epargne` → "Épargne"), "Solde actuel" (text, comma-normalised).
  - Send `balance` only if the field changed.
  - Help line under the balance: "Le solde saisi devient le point de départ ; les transferts saisis ensuite s'y ajoutent."
  - In `parametres.vue`, clicking a chip opens the form inline below the chips. Archiving keeps working.
- [ ] **Step 4: Run** the E2E and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(parametres): edit an account's name, emoji, kind and balance`.

---

## Part 2 — Wider transfers (§5)

### Task 6: Transfer schema, input and write rules (§5.1, §5.3 date, §3 reserves)

**Files:**
- Modify: `drizzle/schema/enums.ts`, `drizzle/schema/transactions.ts` (`transfers`), `shared/schemas/transfer.ts`, `server/api/transfers/index.post.ts`, `[id].patch.ts`, `[id].delete.ts`, `server/utils/movementWrite.ts` (`assertNotClosureVersement`), `server/utils/accountBalanceQuery.ts` (read account-side transfers: `select('from_account_id,to_account_id,amount,created_at').or('from_kind.eq.account,to_kind.eq.account')`)
- Create: `drizzle/migrations/0010_*.sql` (generated + appended CHECKs), `server/utils/transferRules.ts`
- Test: `tests/unit/server/schemas/transfer.test.ts` (rewrite), `tests/unit/server/api/transferWrite.test.ts` (new), `tests/unit/server/api/movementWrite.test.ts` (adapt transfer inputs), `tests/unit/drizzle-schema.test.ts` (extend)

**Interfaces:**
- Produces:
  - Enum `transfer_endpoint_kind` = `envelope | budget | account` (`transferEndpointKindEnum`).
  - New `transfers` columns:
    - `fromKind`, `toKind`: NOT NULL, default `'envelope'`.
    - `fromAccountId`, `toAccountId`: nullable, FK to `accounts`.
    - `fromEnvelopeId`, `toEnvelopeId`: now nullable.
    - `source`: `savingsEntrySourceEnum`, NOT NULL, default `'manual'`.
  - CHECKs appended by hand:
    - `transfers_from_endpoint`: `(from_kind='envelope' AND from_envelope_id IS NOT NULL AND from_account_id IS NULL) OR (from_kind='account' AND from_account_id IS NOT NULL AND from_envelope_id IS NULL) OR (from_kind='budget' AND from_envelope_id IS NULL AND from_account_id IS NULL)`.
    - `transfers_to_endpoint`: the same for `to_`.
    - `transfers_distinct_endpoints`: `NOT (from_kind='budget' AND to_kind='budget') AND (from_envelope_id IS DISTINCT FROM to_envelope_id OR from_envelope_id IS NULL) AND (from_account_id IS DISTINCT FROM to_account_id OR from_account_id IS NULL)`.
  - `shared/schemas/transfer.ts`:

```ts
export const transferEndpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('envelope'), envelopeId: z.string().uuid() }),
  z.object({ kind: z.literal('budget') }),
  z.object({ kind: z.literal('account'), accountId: z.string().uuid() }),
])
export type TransferEndpoint = z.infer<typeof transferEndpointSchema>
export const transferInputSchema = z.object({
  from: transferEndpointSchema,
  to: transferEndpointSchema,
  amount: z.coerce.number().positive(),
  reason: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((d) => !sameEndpoint(d.from, d.to), { message: 'Choisissez deux côtés différents.', path: ['to'] })
export function sameEndpoint(a: TransferEndpoint, b: TransferEndpoint): boolean
export function endpointKey(e: TransferEndpoint): string   // 'budget' | 'envelope:<id>' | 'account:<id>'
```

  - `server/utils/transferRules.ts`:
    - `transferRowValues(input: TransferInput): { date, fromKind, fromEnvelopeId, fromAccountId, toKind, toEnvelopeId, toAccountId, amount: string, reason, monthAssigned, yearAssigned }`. The month and year come from `date`, as in `expenseRowValues`.
    - `assertTransferEndpoints(event: H3Event, input: TransferInput, current?: TransferRow): Promise<void>`. It reads through the Data API.
    - `assertNotClosureRow(row: { source: string }, message: string): void`. It replaces `assertNotClosureVersement`, and the savings routes pass `'Versement de clôture — non modifiable.'`.

- [ ] **Step 1: Write failing tests.**
  - `transfer.test.ts`:
    - It accepts each of the 8 allowed kind pairs, budget→budget excluded.
    - It refuses budget→budget and the same envelope or same account on both sides, with the message `Choisissez deux côtés différents.`.
    - It refuses a missing or invalid `date`.
    - It coerces `'12.5'` to `12.5`.
  - `transferWrite.test.ts`, with the mock pattern of `movementWrite.test.ts` and a mocked Data API for envelopes/accounts:
    - `it('POST writes kinds, ids and the month from the date')`: `{ from: budget, to: account a1, date: '2026-10-31' }` inserts `fromKind 'budget'`, both from ids null, `toAccountId 'a1'`, `monthAssigned 10`, `yearAssigned 2026`.
    - `it('POST checks the month of the date, not today')`: `assertMonthOpen` is called with `(…, 2026, 10)`.
    - `it('refuses a reserve envelope on either side')`: 400 `Les enveloppes de réserve ne peuvent pas recevoir de transfert.`
    - `it('refuses an archived or unknown account on a new transfer')`: 400 `Ce compte n'est plus disponible.`
    - `it('lets an edit keep an account archived since')` (Review Focus 3): `current.toAccountId === 'a1'` (archived) and the input keeps `account a1`, so the update happens.
    - `it('PATCH checks both months when the date moves')`: `assertMovable` with `{2026,10}` and `{2026,11}`.
    - `it('PATCH and DELETE refuse a closure transfer')`: 409 `Transfert de clôture — non modifiable.`
  - `drizzle-schema.test.ts`: `transfers` has the columns `fromKind, toKind, fromAccountId, toAccountId, source`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Schema, then `npm run db:generate`. Check the generated SQL creates the enum, adds the 5 columns, and only does `DROP NOT NULL` on the two envelope ids. Then append the three CHECKs by hand, separated by `--> statement-breakpoint`.
  - The routes use `transferRowValues`, `assertTransferEndpoints` and `assertMovable`. Remove the `PARIS_DATE` "today" logic; the date now comes from the form.
  - Make `fetchAccountBalances` read the account-side transfers.
  - Task 9 adapts the client for the new body shape; until then `TransferForm` is broken. Keep the task branch-local and do Tasks 6–9 back to back before any deploy.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Ask the user, then `npm run db:migrate`.** Commit `feat(transferts): budget, envelope or account on each side, dated, closure rows read-only`.

### Task 7: Month figures with transfers (§5.2 table, examples 1–6)

**Files:**
- Create: `server/utils/domain/transferFlows.ts`
- Modify: `server/utils/domain/dashboard.ts` (`SliceKey`, `computeMonthSummary`), `server/utils/dashboardQuery.ts`, `app/pages/index.vue` (slice colour/label, "Épargne versée")
- Test: `tests/unit/server/utils/domain/transferFlows.test.ts`, `tests/unit/server/utils/domain/dashboard.test.ts` (extend), `tests/unit/server/utils/dashboardQuery.test.ts` (adapt), `tests/unit/server/utils/envelopeCeilingsQuery.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
export interface TransferFlow { fromKind: 'envelope'|'budget'|'account', toKind: …, fromAccountId: string|null, toAccountId: string|null, amount: number }
export interface MonthTransferTotals {
  entering: number            // account → budget|envelope
  leaving: number             // budget|envelope → account
  toSavingsAccounts: number   // part of `leaving` going to kind 'epargne'
  fromSavingsAccounts: number // part of `entering` coming from kind 'epargne'
  toOtherAccounts: number     // leaving − toSavingsAccounts
}
export function summariseMonthTransfers(transfers: TransferFlow[], accountKinds: Map<string, 'courant'|'epargne'>): MonthTransferTotals
export function netSavings(pocheVersements: number, t: MonthTransferTotals): number   // poche + toSavings − fromSavings
export function budgetLibre(unspent: number, budgetEnvelopeRemaining: number[]): number  // unspent − Σ max(0, r)
```

  - `computeMonthSummary` input gains `transfers: MonthTransferTotals`. `savings` stays the poche versements. `SliceKey` gains `'accounts'`.
    - `unspent = income − fixed − envelope − variable − savings + entering − leaving` (§5.2).
    - Percent base = `income + entering`.
    - The `savings` slice amount = `savings + toSavingsAccounts`, and the new `accounts` slice amount = `toOtherAccounts`. Slices sum to the base, and the new slices are never negative.
  - `DashboardPayload.savings.total` becomes `netSavings(...)`. `byGoal` is unchanged, plus `byAccount: { accountId, name, emoji, amount }[]` for épargne accounts with a non-zero net.
  - `compute503020` gets `savings: Math.max(0, netSavings)`.
  - Ledgers need no formula change: `to_envelope_id` / `from_envelope_id` are only set on envelope sides, so `listBudgetEnvelopeLedgers` already counts budget/account transfers (§5.2 row "Budget envelope ceiling"). Add a test that proves it.

- [ ] **Step 1: Write failing tests**, all from §5.2. The starting point is income 2000 and spending 1770 split as fixed 1000 / envelope 770; Restaurants has 50 left, Sorties 30. LDDS is `epargne` and Compte courant is `courant`.
  - `it('example 1: Budget → LDDS 150')`: unspent 80; `budgetLibre(80, [50, 30]) === 0`; `netSavings(0, t) === 150`.
  - `it('example 2: LDDS → Budget 100')`: unspent 330; budget libre 250; `netSavings(0, t) === -100`; no slice amount < 0.
  - `it('example 3: LDDS → Voyage 300')`: unspent 530. Budget libre with Voyage's remaining +300 (`[50, 30, 300]`) is 150, unchanged.
  - `it('example 4: Restaurants → Budget 40')`: unspent 230. `budgetLibre(230, [10, 30]) === 190`, so +40.
  - `it('example 5: Compte courant → LDDS 500')`: totals are all 0, so unspent 230 and net savings 0.
  - `it('example 6: Budget → Compte joint 50')`: unspent 180, net savings 0, `accounts` slice 50.
  - `it('slices add up to income + entering')` for examples 1, 2 and 6.
  - `it('ledger counts a budget → envelope transfer as transfersIn')` in `envelopeCeilingsQuery.test.ts`: a row with `from_envelope_id: null` and `to_envelope_id: 'voyage'` raises Voyage's ceiling.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `dashboardQuery` also reads the month's transfers (`from_kind,to_kind,from_account_id,to_account_id,amount`) and `accounts(id,name,emoji,kind)` (all, archived included, for names), through the Data API in its `Promise.all`.
  - In `index.vue`, add `SLICE_COLOR.accounts` (pick an existing token) and `SLICE_LABEL.accounts = 'Vers les comptes'`. Show "Épargne versée" from `savings.total`, which can be negative.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(dashboard): transfers to and from accounts change "Reste à dépenser" and savings`.

### Task 8: Budget libre cap (§5.2 row "Budget libre")

**Files:**
- Create: `server/utils/budgetLibreQuery.ts`
- Modify: `server/utils/envelopeCeilingsQuery.ts` (`listBudgetEnvelopeLedgers` options), `server/utils/transferRules.ts`, `server/api/transfers/index.post.ts`, `[id].patch.ts`, `server/utils/pageData.ts` (`getMouvementsPage` returns `budgetLibre`)
- Test: `tests/unit/server/utils/budgetLibreQuery.test.ts`, `tests/unit/server/api/transferWrite.test.ts` (extend)

**Interfaces:**
- Consumes: `summariseMonthTransfers`, `budgetLibre`, `computeMonthSummary` (Task 7).
- Produces:
  - `listBudgetEnvelopeLedgers(event, year, month, options?: { excludeTransferId?: string })`. It adds `id` to its transfers select and filters out the excluded row.
  - `fetchBudgetLibre(event: H3Event, ym: YearMonth, options?: { excludeTransferId?: string }): Promise<number>`. It reuses the same reads and formula as `fetchDashboard`; factor the shared "month figures" part out of `dashboardQuery` instead of copying it.
  - `assertWithinBudgetLibre(event, input: TransferInput, excludeTransferId?: string): Promise<void>`. It is a no-op unless `input.from.kind === 'budget'`. Otherwise, if `input.amount > budgetLibre + 0.005`, it throws 400 `Le budget du mois n'a que {formatEuro(libre)} de disponible.` Use a server-side euro formatter: copy `formatEuro`'s `Intl` options into `server/utils/userError.ts` as `formatEuroServer`.
  - `getMouvementsPage` returns `budgetLibre: number`.

- [ ] **Step 1: Write failing tests.**
  - `it('POST refuses Budget → LDDS above budget libre')`, with mocked `fetchBudgetLibre` → 150: 230 gives 400 and a message containing `150,00`. 150 passes.
  - `it('PATCH re-checks with the transfer itself excluded')` (Review Focus 2): `fetchBudgetLibre` is called with `excludeTransferId: 'm1'`.
  - `it('PATCH from budget to an account source skips the cap')`: when the new `from` is an account, `fetchBudgetLibre` isn't called.
  - `it('POST Budget → envelope is capped too')`.
  - `budgetLibreQuery.test.ts`: `it('excludes the given transfer from both unspent and ledgers')`. The Data API is mocked with the example 1 numbers plus a Budget→LDDS 150 row `t1`: without exclusion 0, with `excludeTransferId: 't1'` 150.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** as specified. Call `assertWithinBudgetLibre` after `assertTransferEndpoints`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(transferts): money taken from the month's budget is capped at the budget libre`.

### Task 9: Transfer form, feed labels, report names (§5.3)

**Files:**
- Modify: `app/components/entry/TransferForm.vue`, `app/components/entry/EntryPanel.vue`, `app/components/MovementEditor.vue`, `app/pages/mouvements.vue` (pass `budgetLibre`), `server/utils/movementsQuery.ts` (`TRANSFER_SELECT`, mapping), `server/utils/domain/movementsFeed.ts` (`RawTransferMovement`, transfer mapping)
- Test: `tests/unit/server/utils/domain/movementsFeed.test.ts` (extend), `tests/unit/server/utils/movementsQuery.test.ts` (adapt), `tests/e2e/transfer-wide.spec.ts` (new)

**Interfaces:**
- Consumes: `TransferInput`, `endpointKey`, `sameEndpoint` (Task 6); `page.budgetLibre` (Task 8).
- Produces:
  - `RawTransferMovement` = `{ id, date, reason, amount, fromLabel, toLabel, source: 'manual'|'closure', fields: TransferInput }`.
  - The feed label is `Transfert {fromLabel} → {toLabel}`, where the budget reads `Budget du mois`, an account reads `{emoji} {name}`, and an envelope reads `{name}`.
  - `envelopeLabel: '⇄ Transfert'`, `origin: source === 'closure' ? 'Clôture' : reason`, `editable: monthOpen && source === 'manual'`.
  - `TransferForm` props: `{ envelopes: (ReferenceItem & { kind: 'budget'|'reserve' })[], accounts: ReferenceItem[], budgetLibre: number | null, defaultDate: string, editing? }`. Its emits replace `from-envelope-change` / `to-envelope-change` with `from-change: [TransferEndpoint|null]` and `to-change: [TransferEndpoint|null]`.

- [ ] **Step 1: Write failing tests.**
  - `movementsFeed.test.ts`:
    - `it('labels budget and account sides')`: budget→account LDDS 🏦 gives `Transfert Budget du mois → 🏦 Livret LDDS`.
    - `it('closure transfers are read-only with origin Clôture')`.
  - `movementsQuery.test.ts`:
    - It maps `from_kind 'account'` + the `from_account` embed into `fields.from = { kind: 'account', accountId }` and the label.
    - The envelope-journal `or` filter is unchanged.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement the server side.**
  - `TRANSFER_SELECT` adds `from_kind,to_kind,from_account_id,to_account_id,source,from_account:accounts!from_account_id(name,emoji),to_account:accounts!to_account_id(name,emoji)` and keeps the envelope embeds.
  - Archived accounts still resolve through the embed.
- [ ] **Step 4: Implement the form.**
  - "Retirer à" and "Verser à" are `<select>`s with `<optgroup>`s: "Budget du mois" (a single option), "Enveloppes" (`kind === 'budget'` only; reserves filtered out), "Comptes" (active accounts). Option values are `endpointKey`s.
  - Defaults: from = budget, to = first account if any, otherwise first envelope.
  - Add a "Date" row (`type="date"`, default `defaultDate`).
  - The subtitle becomes `Entre le budget, les enveloppes et les comptes`. Remove the "Portée : ce mois seulement" line.
  - When from = budget and `budgetLibre !== null`, show `Disponible : {formatEuro(budgetLibre)}` and disable submit when `amount > budgetLibre`. When editing a budget-sourced transfer, add its original amount back.
  - The body is `{ from, to, amount, reason, date }`.
  - Keep Task 1's reset.
  - `EntryPanel` passes `accounts`, `budgetLibre` and `defaultDate` (today until Task 13). It shows envelope preview lines only for envelope sides.
  - `MovementEditor` passes the same props from `reference`. Give `budgetLibre` as null there; the server still enforces the cap.
- [ ] **Step 5: E2E** `transfer-wide.spec.ts`: `test('Budget du mois → an account shows in the feed and raises the account balance')`.
  - Create a `zz-e2e-livret` account via the API.
  - Read its balance from `/api/accounts/overview`.
  - In the form, pick Budget du mois → zz-e2e-livret, amount `1`, motif `E2E solde`, and submit. If the budget libre is < 1, skip with a clear message.
  - Check the feed shows `Transfert Budget du mois → … zz-e2e-livret` and that the overview balance went up by 1.
  - In `finally`, delete the transfer (`DELETE /api/transfers/{id}`, id from the POST response) and archive the account.
- [ ] **Step 6: Run** `npm test` and the E2E. Expected: PASS.
- [ ] **Step 7: Commit** `feat(transferts): pick the budget, an envelope or an account on each side, with a date and the budget libre`.

### Task 10: Savings to épargne accounts on Épargne and in the report (§5.2 "Savings")

**Files:**
- Modify: `server/utils/epargneQuery.ts`, `server/utils/domain/savings.ts` (`monthContributions`, `monthlyHistory` input), `server/utils/closureQuery.ts` (`fetchMonthData`), `server/utils/domain/closure.ts` (`MonthData`), `server/utils/domain/reportSnapshot.ts` (`summariseMonth`, transfer names), `app/pages/epargne.vue` (render the account rows)
- Test: `tests/unit/server/utils/domain/savings.test.ts`, `tests/unit/server/utils/epargneQuery.test.ts`, `tests/unit/server/utils/domain/reportSnapshot.test.ts`, `tests/unit/server/utils/closureQuery.test.ts`

**Interfaces:**
- Consumes: `summariseMonthTransfers`, `netSavings` (Task 7).
- Produces:
  - `MonthData.transfers[]` = `{ date, fromKind, toKind, fromEnvelopeId: string|null, toEnvelopeId: string|null, fromAccountId: string|null, toAccountId: string|null, amount, reason, source }`, and `MonthData.accounts: { id, name, emoji, kind }[]`. `computeLeftovers` keeps working unchanged (it matches envelope ids).
  - `ContributionRow.kind` gains `'account'`: one row per épargne account with a non-zero net for the shown month. The label is `{emoji} {name}`, the detail `transferts du mois`, and the amount is the net, closure transfers included *(builder's call)*.
  - The Épargne `history` and 50/30/20 `savedThisMonth` include the net épargne-account transfers of each month. Read all account-side transfers through the Data API: `.or('from_kind.eq.account,to_kind.eq.account')`.
  - `summariseMonth(data, closure: { toSavings: number, toAccounts: { accountId: string, amount: number }[] })`:
    - `saved = netSavings(manual poche + closure.toSavings, t)`, where `t = summariseMonthTransfers(data.transfers plus closure.toAccounts treated as envelope→account rows, kinds from data.accounts)`.
    - `remaining = income − spent − (manual poche + closure.toSavings) + t.entering − t.leaving`, the dashboard's "Reste à dépenser" formula.
    - Snapshot fields are unchanged.
  - Snapshot `transfers[].fromName/toName` use the Task 9 label rules.

- [ ] **Step 1: Write failing tests.**
  - `savings.test.ts`: `it('lists an épargne account as its own contribution row')`.
  - `epargneQuery.test.ts`: `it('counts Budget → LDDS 150 in the month savings, history and 50/30/20')`. With income 2000, epargne actual is 8 (%).
  - `reportSnapshot.test.ts`:
    - `it('report saved includes net épargne-account transfers')` (example 1 gives saved 150, remaining 80).
    - `it('names budget and account sides in the transfer list')`.
    - `it('an old V1 snapshot fixture still builds the PDF layout')`, using `tests/unit/fixtures/reportSnapshot.ts` unchanged through `reportLayout`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Update the existing call sites of `summariseMonth` (`closureService.getClosurePage` passes `{ toSavings: 0, toAccounts: [] }`).
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(epargne): money sent to an épargne account counts as the month's savings`.

### Task 11: Closure destination "vers un compte" (§5.4) — with the PGlite harness

**Files:**
- Modify: `drizzle/schema/enums.ts` (`closureDestinationEnum` + `'account'`), `drizzle/schema/closure.ts` (`destinationAccountId`), `shared/schemas/closure.ts`, `server/utils/domain/closure.ts` (`planClosure`, types), `server/utils/closureService.ts`, `server/utils/domain/reportSnapshot.ts` (`destinationLabel`, `closure.toAccounts`), `server/utils/reportLayout.ts` (totals line), `app/utils/closureTotals.ts`, `app/pages/compte-rendu.vue`, `package.json` (devDependency)
- Create: `drizzle/migrations/0011_*.sql` (generated), `drizzle/migrations/0012_close_month_accounts.sql` (custom), `tests/unit/sql/pglite.ts`, `tests/unit/sql/closeMonth.test.ts`
- Test: `tests/unit/server/utils/domain/closure.test.ts`, `tests/unit/shared/schemas/closure.test.ts`, `tests/unit/app/closureTotals.test.ts`, `tests/unit/server/utils/domain/reportSnapshot.test.ts`

**Interfaces:**
- Produces:
  - `closureDecisionSchema.destination` adds `'account'` and `accountId: z.string().uuid().nullable().optional()`.
  - `ClosureDestination` adds `'account'`, and `PlannedDecision.accountId: string | null`.
  - `planClosure(input: { leftovers, decisions, savingsGoalIds, accountIds: string[] })`. An account destination without a valid active account id throws `Choisissez un compte pour « {name} ».`
  - `ClosurePlan.accountTransfers: { envelopeId: string, accountId: string, amount: number }[]` and `totals.toAccounts: number`.
  - The closure page payload gains `accounts: { id, name, emoji }[]` (active).
  - `ReportSnapshotV1.closure.toAccounts?: number` is optional. The PDF reads `?? 0`, and its destination label is `Vers {emoji} {name}`.
  - `closureTotals` returns `accounts: number`. `Choice` gains `accountId`.
  - `close_month(payload)` also reads `payload->'accountTransfers'` and inserts into `transfers` with:
    - `date` = the last day of M (`(make_date(p_year,p_month,1) + interval '1 month - 1 day')::date`)
    - `from_kind 'envelope'`, `from_envelope_id`, `to_kind 'account'`, `to_account_id`, `amount`
    - `reason 'Reliquat de clôture'`, `month_assigned`/`year_assigned` = M, `source 'closure'`
    
    It also writes `destination_account_id` into `closure_envelope_decisions` from `d->>'accountId'`.
  - `tests/unit/sql/pglite.ts`: `createTestDb(): Promise<PGlite>`. It runs `CREATE ROLE anon; CREATE ROLE authenticated;`, then every file of `drizzle/migrations/*.sql` in journal order, split on `--> statement-breakpoint`, skipping `NOTIFY` statements.

- [ ] **Step 1: Add the dev dependency** with `npm i -D @electric-sql/pglite`, and pin the installed exact version in `package.json`. Write `pglite.ts`, plus a smoke test `it('applies every migration')` that runs `select count(*) from accounts` and gets 0.
- [ ] **Step 2: Write failing tests.**
  - `closure.test.ts`:
    - `it('plans an account destination as a closure transfer')`: Restaurants leftover 50 → account a1 gives `accountTransfers [{ envelopeId, accountId: 'a1', amount: 50 }]`, `totals.toAccounts 50`, and Restaurants' next-month carry-over 0.
    - `it('refuses an unknown account')`.
  - `closureTotals.test.ts`: account choices sum into `accounts`.
  - `reportSnapshot.test.ts`:
    - `it('labels an account destination')`.
    - `it('counts an account destination of kind epargne in saved')` (via `summariseMonth`'s `toAccounts`).
  - `closeMonth.test.ts` against PGlite:
    - Seed one budget envelope, one épargne account, and an October expense.
    - Call `select close_month($1::jsonb)` with a payload holding one account transfer of 50.
    - Expect one `transfers` row with `source = 'closure'`, `date = '2026-10-31'`, `to_account_id` = the account, and `month_assigned = 10`.
    - Expect the decision row to have `destination = 'account'` and `destination_account_id` set.
- [ ] **Step 3: Run** them. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - Enum and column, then `npm run db:generate`. Check the SQL is `ALTER TYPE "closure_destination" ADD VALUE 'account'` plus `ADD COLUMN "destination_account_id" uuid` with its FK.
  - `npx drizzle-kit generate --custom --name=close_month_accounts`, then write `CREATE OR REPLACE FUNCTION public.close_month(payload jsonb)`: the body of `0006_close_month.sql` plus the two inserts above. Repeat the `REVOKE` / `GRANT` / `NOTIFY` lines.
  - `closeMonth` in `closureService` passes `accountIds` (active accounts, read through the Data API), and sends `accountTransfers` in the payload. `buildReportSnapshot` gives `summariseMonth` `toAccounts: plan.accountTransfers`.
  - In `compte-rendu.vue`, `destinationOptions` gains `{ value: 'account', label: 'Vers un compte' }` with an account `<select>`. The confirmation modal shows `vers {emoji} {name}`, and the totals tiles show "Vers les comptes".
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Ask the user, then `npm run db:migrate`.** Check `close_month` still has `prosecdef = false` with `select prosecdef from pg_proc where proname = 'close_month'`.
- [ ] **Step 7: Commit** `feat(cloture): send an envelope's leftover to an account`.

---

## Part 3 — Month navigation (§6)

### Task 12: Month parameter on every month-based endpoint (§6.2)

**Files:**
- Create: `server/utils/domain/monthParam.ts`, `server/utils/monthContext.ts`
- Modify: `server/utils/pageData.ts` (`getDashboardPage`, `getMouvementsPage`, `getEnveloppesPage` take a `YearMonth`), `server/api/pages/dashboard.get.ts`, `mouvements.get.ts`, `enveloppes.get.ts`, `server/api/accounts/overview.get.ts`, `server/api/epargne.get.ts`, `server/api/envelopes/ceilings.get.ts`, `server/api/envelopes/[id]/journal.get.ts`, `server/api/dashboard.get.ts`, `server/api/movements/index.get.ts`, `server/api/savings/index.get.ts`, `server/utils/dashboardQuery.ts` (`daysRemaining`)
- Test: `tests/unit/server/utils/domain/monthParam.test.ts`, `tests/unit/server/utils/monthContext.test.ts`, `tests/unit/server/utils/pageData.test.ts` (adapt)

**Interfaces:**
- Produces:
  - `parseMonthParam(raw: unknown, now: Date): YearMonth`. It accepts `'YYYY-MM'` with month 1–12, not after `parisYearMonth(now)`, and year ≥ 2000. Anything else (absent, malformed, future) gives `parisYearMonth(now)`; this is the Review Focus 1 decision: fall back, never 400. The page reads the month actually used back from `monthContext.selected`.
  - `formatMonthParam(ym: YearMonth): string` returns `'2026-09'`.
  - `MonthContext = { selected: YearMonth & { label: string }, current: YearMonth, firstDataMonth: YearMonth | null, latestClosed: YearMonth | null, closed: boolean }`.
  - `fetchMonthContext(event, selected, now): Promise<MonthContext>`. It uses `fetchClosureState` and `isMonthOpen`.
  - Each of `/api/pages/dashboard|mouvements|enveloppes`, `/api/accounts/overview` and `/api/epargne` reads `getQuery(event).mois`, and adds `monthContext` to its payload by fetching it in the same `Promise.all`.
  - `/api/envelopes/ceilings` and `/api/envelopes/:id/journal` take `mois` and do not return a context.
  - Dashboard: `month.daysRemaining` is `daysRemainingInMonth(today)` for the current month and `0` otherwise. `perDay` is then just `unspent` and the UI hides the "par jour" line when `daysRemaining === 0` (Task 13).

- [ ] **Step 1: Write failing tests.**
  - `monthParam.test.ts`, with `now = 2026-11-08T12:00Z`:
    - `'2026-09'` gives `{2026,9}`.
    - `undefined`, `'abc'`, `'2026-13'`, `'2026-00'`, `'2026-12'` (future) and `'1999-01'` all give `{2026,11}`.
    - `['2026-09','2026-10']` (array query) gives `{2026,11}`.
    - At `now = 2026-10-31T23:30Z` (already November in Paris), `'2026-11'` gives `{2026,11}`.
  - `monthContext.test.ts`: with the closed months `[{2026,9}]`, selecting September gives `closed: true`, `latestClosed {2026,9}`, `label 'Septembre 2026'`.
  - `pageData.test.ts`: `getMouvementsPage(event, {year:2026, month:9}, now)` calls `fetchMovements` with `(…, 2026, 9)` and returns `monthContext`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Replace every server-clock `now.getFullYear()/getMonth()` in the routes listed with `parseMonthParam(getQuery(event).mois, new Date())`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mois): month-based endpoints take ?mois=YYYY-MM and return the month context`.

### Task 13: Month selector, closed-month read-only state, entry dates (§6.1)

**Files:**
- Create: `app/composables/useSelectedMonth.ts`, `app/components/MonthSelector.vue`, `app/components/ClosedMonthBanner.vue`
- Modify: `app/components/PageHeader.vue` (optional `monthContext` prop), `app/components/AppSidebar.vue` (links carry `mois`), `app/components/SidebarCeilingsWidget.vue` (query `mois`), `app/pages/index.vue`, `enveloppes.vue` (incl. journal drawer fetch), `mouvements.vue`, `comptes.vue`, `epargne.vue`, `app/components/entry/EntryPanel.vue` + the four forms (`defaultDate` / income month defaults, `disabled`), `app/utils/dates.ts`
- Test: `tests/unit/app/dates.test.ts` (extend), `tests/unit/app/selectedMonth.test.ts` (new, pure helpers), `tests/e2e/perf.spec.ts` (add a month-change test), `tests/e2e/month-navigation.spec.ts` (new)

**Interfaces:**
- Consumes: `MonthContext` (Task 12).
- Produces:
  - `useSelectedMonth(): { mois: ComputedRef<string | undefined>, query: ComputedRef<{ mois?: string }>, go(ym: YearMonth | null): Promise<void> }`. It reads `route.query.mois`, and `go(null)` drops the param, meaning the current month.
  - Pure helpers in `app/utils/dates.ts`:
    - `shiftMonth(ym, delta): YearMonth`
    - `defaultEntryDate(selected: YearMonth, todayIso: string): string` returns today if `todayIso` falls in `selected`, else the last day of `selected` (§5.3).
    - `lastDayOfMonth(ym): string`
  - `MonthSelector` (props `context: MonthContext`) renders `‹ {label} ›`:
    - "‹" is disabled at or before `firstDataMonth` (or always when it is null).
    - "›" is disabled at `current`.
    - It shows a "Revenir au mois en cours" button when `selected ≠ current`.
  - `ClosedMonthBanner` (props `context`) shows `{label} est clôturé` and leaves a slot for Task 15's button.
  - `EntryPanel` gains props `monthContext: MonthContext | null`. When `closed`, it renders `{label} est clôturé — saisie impossible.` instead of the forms. Otherwise it passes `defaultDate = defaultEntryDate(selected, todayLocalIso())` to every form; `IncomeForm` defaults `monthAssigned` / `yearAssigned` to `selected`. Envelope preview lines show only when the selected month is the current one (the sidebar ceilings are the selected month's anyway, so keep them when equal).

- [ ] **Step 1: Write failing unit tests.**
  - `defaultEntryDate({2026,9}, '2026-11-08') === '2026-09-30'`.
  - `defaultEntryDate({2026,11}, '2026-11-08') === '2026-11-08'`.
  - `lastDayOfMonth({2028,2}) === '2028-02-29'`.
  - `shiftMonth({2026,1}, -1)` gives `{2025,12}`.
- [ ] **Step 2: Run** them. Expected: FAIL. Then implement the helpers and run until PASS.
- [ ] **Step 3: Implement the UI.**
  - Pages follow the month by passing `query: computed(() => selected.query.value)` to their `useLazyFetch`. Keys stay the same; Nuxt refetches when the query changes.
  - Pages that follow: Tableau de bord, Enveloppes (incl. the journal drawer), Mouvements, Comptes (fixed charges and variable spend; balances stay per account), Épargne.
  - Sidebar `NuxtLink`s use `{ path, query: selected.query.value }` for every item, and the active-item test stays `route.path`.
  - `SidebarCeilingsWidget` passes the same query. It is excluded from the perf count already (`perf.spec.ts:39`).
  - Mouvements rows are already read-only in closed months via `editable`. Add the banner on all five pages.
  - Hide "par jour" when `daysRemaining === 0`, and the "{n} jours restants" chip too.
- [ ] **Step 4: E2E.**
  - `perf.spec.ts`: `test('changing month on Mouvements costs one page call')`.
    - Open `/mouvements` and wait for idle.
    - Start `apiCallsDuring`, click "‹", wait for the `/api/pages/mouvements` response and `networkidle`.
    - `expect(calls).toEqual(['/api/pages/mouvements'])`, and the URL contains `mois=`.
  - `month-navigation.spec.ts`:
    - `test('the selected month survives navigation and reload')`: go to the previous month on Mouvements, click "Tableau de bord" in the sidebar, check the header label is the same month, reload, check it again.
    - `test('a closed month shows the banner and no entry form')`: run it only if `/api/pages/mouvements` reports a `latestClosed` (September 2026 is closed in the live DB). Open `/mouvements?mois=<latestClosed>` and check `est clôturé` is visible and `Nouvelle saisie` has no submit button.
    - `test('"Revenir au mois en cours" drops the parameter')`.
- [ ] **Step 5: Run** `npm test` and `npx playwright test tests/e2e/perf.spec.ts tests/e2e/month-navigation.spec.ts`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(mois): app-wide month selector, closed-month banner, entry dates in the selected month`.

---

## Part 4 — Reopening (§7) and report check (§8)

### Task 14: `reopen_month` SQL function and the close/reopen round trip (§7.2)

**Files:**
- Create: `drizzle/migrations/0013_reopen_month.sql` (via `npx drizzle-kit generate --custom --name=reopen_month`)
- Test: `tests/unit/sql/reopenMonth.test.ts`

**Interfaces:**
- Produces: `public.reopen_month(p_year int, p_month int) RETURNS int` (number of months reopened). `SECURITY INVOKER`, `SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated`, `NOTIFY pgrst, 'reload schema'`.
  - It raises `MONTH_NOT_CLOSED` if `(p_year, p_month)` has no closed `month_closures` row.
  - Then, for every closed month `(y,m) >= (p_year,p_month)`, in one transaction (the function body):
    1. Delete `monthly_reports` and `closure_envelope_decisions` by `month_closure_id`.
    2. Delete `savings_entries` with `source='closure'` and `(year,month)=(y,m)`.
    3. Delete `transfers` with `source='closure'` and `(year_assigned,month_assigned)=(y,m)`.
    4. `UPDATE monthly_envelope_allocations SET carried_over_amount = 0, overspend_deduction = 0` for the month after `(y,m)`. `close_month` only ever writes those two columns there by upsert, and `PATCH /api/envelopes/:id` keeps `base_ceiling` of open months in line with the default.
    5. Keep the freeze rows of `(y,m)` (§7.2 builder's call).
    6. Delete the `month_closures` row.

- [ ] **Step 1: Write failing tests** against PGlite (`createTestDb()` from Task 11). Seed:
  - Two budget envelopes: Restaurants 200, Sorties 100.
  - One épargne account LDDS, one poche.
  - For September: expenses Restaurants 150 and Sorties 120 (overspend 20), a manual Budget→LDDS transfer of 30, a manual versement of 10.
  - An October expense, so October has data.

  Build the payload with the real `computeLeftovers` / `planClosure` / `buildReportSnapshot`: Restaurants leftover 50 → LDDS (account destination). Use `fetchMonthData`-shaped objects built from SQL selects in a small test helper.
  - `it('undoes everything a closure wrote')`:
    - Snapshot the September and October ledgers before closing: `computeEnvelopeLedger` over rows read back from SQL.
    - Close September and check the closure rows exist.
    - Call `reopen_month(2026, 9)`.
    - Expect 0 rows in `month_closures`, `monthly_reports`, `closure_envelope_decisions`, closure `savings_entries` and closure `transfers`.
    - The manual transfer of 30 and the versement of 10 are still there.
    - The September freeze rows are still there.
    - October allocations have carry 0 and deduction 0.
    - The recomputed September and October ledgers equal the pre-closure snapshot.
    - The LDDS balance (`computeAccountBalance` over the remaining transfers) equals the pre-closure value.
  - `it('reopens later closed months too')`: close September then October, `reopen_month(2026, 9)` returns 2, and no closure rows remain.
  - `it('refuses a month that is not closed')`: it raises `MONTH_NOT_CLOSED`.
  - `it('closing again after reopening gives the same rows as closing once')`: close, reopen, close again with the same decisions. The decisions, the closure transfer amount and the October allocations equal those of the first closure (anti-goal §11).
- [ ] **Step 2: Run** `npx vitest run tests/unit/sql/reopenMonth.test.ts`. Expected: FAIL (function missing).
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run** it. Expected: PASS. Then run `npm test`.
- [ ] **Step 5: Ask the user, then `npm run db:migrate`.** Check `reopen_month` has `prosecdef = false`. **Do not call it on the live database.**
- [ ] **Step 6: Commit** `feat(cloture): reopen_month undoes a closure and every later one`.

### Task 15: Reopen from the app (§7.1, §7.3)

**Files:**
- Create: `server/api/closure/reopen.post.ts`, `server/api/closure/reopen-preview.get.ts`, `app/components/ReopenMonthConfirm.vue`
- Modify: `server/utils/closureService.ts` (`reopenMonth`, `reopenPreview`), `app/components/ClosedMonthBanner.vue`, `app/pages/compte-rendu.vue` (archives rows)
- Test: `tests/unit/server/utils/closureService.test.ts` (extend)

**Interfaces:**
- Consumes: `reopen_month` (Task 14), `MonthContext` (Task 12), `fetchClosureState`.
- Produces:
  - `reopenMonth(event, ym: YearMonth): Promise<{ reopened: number }>`. It runs `supabase.rpc('reopen_month', { p_year, p_month })` with a 10 s abort. `MONTH_NOT_CLOSED` maps to 409 `{Label} n'est pas clôturé.`, anything else to a logged 500.
  - `reopenPreview(event, ym): Promise<{ months: string[], balanceWarning: boolean }>`.
    - `months` are the labels of `ym` and every later closed month, in order.
    - `balanceWarning` is true if any account's `reference_set_at` is later than `month_closures.closed_at` of `ym` (§4.2 builder's call).
  - `POST /api/closure/reopen` takes `{ year, month }` (`reportParamsSchema`). `GET /api/closure/reopen-preview?mois=YYYY-MM` (an invalid value gives 400; this route is not a page).
  - `ReopenMonthConfirm` (props `month: YearMonth`; emits `done`) is an inline confirmation, never `confirm()`. It opens on click and fetches the preview. Its copy:
    - `Le compte rendu de {mois} sera supprimé et refait à la prochaine clôture. Les reliquats reportés, versés à une poche ou envoyés vers un compte seront annulés.`
    - `{Octobre 2026 et Novembre 2026} seront aussi rouverts.` when there are more than one month.
    - `Les soldes de comptes saisis à la main depuis la clôture seront à vérifier.` when `balanceWarning`.
    - Buttons `Rouvrir` and `Annuler`.
    
    On success it calls `refreshNuxtData()` (all keys) and emits `done`.

- [ ] **Step 1: Write failing tests** in `closureService.test.ts`, mocking the Supabase client:
  - `it('reopenMonth calls reopen_month with year and month')`.
  - `it('maps MONTH_NOT_CLOSED to a French 409')`.
  - `it('reopenPreview lists the month and every later closed month')`: closed `[9, 10]`, reopening 9 gives `['Septembre 2026', 'Octobre 2026']`.
  - `it('reopenPreview warns when a balance was hand-set after the closure')`.
- [ ] **Step 2: Run** them. Expected: FAIL. Then implement and run until PASS.
- [ ] **Step 3: UI.**
  - `ClosedMonthBanner` gets a `Rouvrir le mois` button that shows `ReopenMonthConfirm`.
  - Each Compte rendu → Archives row gets `Rouvrir` next to `PDF`.
  - No E2E clicks the final "Rouvrir" (Global Constraints). Instead, add to `tests/e2e/month-navigation.spec.ts` the test `test('the reopen confirmation explains what will be undone')`. It opens the confirmation on the latest closed month, checks the copy, and clicks `Annuler`.
- [ ] **Step 4: Run** `npm test` and that E2E. Expected: PASS.
- [ ] **Step 5: Commit** `feat(cloture): reopen a closed month from its banner or from the archives`.

### Task 16: Report download check in production (§8) and hand-off

**Files:**
- Create: `tests/e2e/report-download.spec.ts`
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: Write the read-only spec** `test('the latest archived report downloads as a PDF with embedded fonts')`. It reads `/api/closure`, takes `archives[0]` (skipping if there is none), and GETs `/api/reports/{year}/{month}`. Then check:
  - status 200 and a `content-type` containing `application/pdf`
  - the body starts with `%PDF`
  - the body contains `PlusJakartaSans` (the embedded font name)
- [ ] **Step 2: Run it locally** with `npx playwright test tests/e2e/report-download.spec.ts`. Expected: PASS.
- [ ] **Step 3: Ask the user to deploy.** Pushing `main` deploys to Vercel; only push when they say so. Then run `PERF_BASE_URL=https://budget-pastel.vercel.app npx playwright test tests/e2e/report-download.spec.ts tests/e2e/perf.spec.ts`. Expected: PASS. If the PDF fails, fixing the font loading in `server/pdf/pdfFonts.ts` is in scope.
- [ ] **Step 4: Update `docs/HANDOFF.md`.** Cover:
  - the migrations 0008–0013 applied, and the backup file and how to restore it
  - the household switching "Livret LDDS" to Épargne in Paramètres (§4.2)
  - the new E2E specs, all self-cleaning
  - the drift accepted on hand-set balances after a reopen
  - the test count from `npm test`
- [ ] **Step 5: Commit** `test(e2e): report download check; handoff for comptes/transferts/mois`.
