# Accounts, wider transfers, month navigation, reopening a month — Design Spec

**Date:** 2026-10-28 (§13 added 2026-11-07)
**Parent spec:** `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md`
**Related:** `docs/superpowers/specs/2026-10-14-retours-utilisateurs-a-design.md` §1 listed
"B — month navigation" as a future sub-project; this spec delivers it, in a wider form.

## 1. Goal

Answer the household's second wave of feedback, in their words:

1. "Rajouter livret LDDS pour retirer de l'argent du mois." They have just opened an LDDS.
   It already exists in the live database as an account named "Livret LDDS" (kind `courant`,
   balance 0), created by hand in Paramètres.
2. "Rajouter des catégories dans les transferts, notamment budget du mois en général pour
   pouvoir solder le budget à la fin du mois."
3. "Possibilité de changer le mois" — and act on past months, not just look at them:
   "il nous faut pouvoir interagir sur des mois précédents au cas où", "même clôturé je dois
   l'éditer", "j'ai besoin de pouvoir réimprimer / retélécharger le compte rendu".
4. "Impossible d'éditer les comptes à l'heure actuelle." Paramètres can create and archive
   an account, nothing in the UI can edit one (`PATCH /api/accounts/:id` already exists and
   accepts `name`, `emoji`, `kind`, `archivedAt` via `accountPatchSchema`, but Paramètres only
   uses it to archive, and it does not accept a balance), and nothing can set `accounts.current_balance`, so every
   balance on Comptes reads 0.

The household said in brainstorming: "je dois pouvoir gérer les comptes comme bon me semble".

**What success looks like:** at the end of October the household opens the transfer form,
moves "Budget du mois → Livret LDDS" for the money that sits in no envelope, then closes
October and sends the envelopes' leftovers to the LDDS too. The LDDS balance on Comptes rises
on its own, the amounts count as October's savings, and nothing is counted twice. If they spot a mistake in September
(already closed), they switch the app to September, reopen it, fix the movement, close it
again from Compte rendu and download the new PDF.

## 2. Hard constraint: no data loss

The live database holds real data: movements since September 2026, September 2026 **closed**
(one `month_closures` row, one `monthly_reports` row), four accounts, eleven envelopes,
three poches.

- Every schema change is **additive or a relaxation** (new nullable columns, new columns with
  defaults that describe existing rows correctly, a NOT NULL dropped). No table or column is
  dropped or recreated; no existing row is rewritten except where stated below.
- Migrations are generated (`npm run db:generate`) and applied (`npm run db:migrate`).
  **Never `drizzle-kit push`** — it would disable RLS (`docs/HANDOFF.md` §4). Hand-written
  SQL (CHECK constraints, the new function) is appended to the generated file or added as a
  separate hand-written migration, as `0002`/`0006` were.
- Before applying the migration to the live database, take a backup (Supabase dashboard
  backup, or `pg_dump` of the data) and record in the plan how to restore it.
- September 2026's existing report snapshot was written with the current snapshot shape. The
  PDF route must still render it after this work (any snapshot shape change is
  backwards-compatible: new fields optional, old fields still read).

## 3. Decisions

Settled with the household during brainstorming, unless marked *(builder's call, made in
this spec)* — those were proposed by the spec author and are open to the household's review.

| Question | Decision |
|---|---|
| Is the LDDS a special object (the unused `livrets` tables)? | **No. It is an account like any other.** The household wants to manage accounts freely; the LDDS is just one of them. The `livrets`, `livret_contributions`, `livret_yearly_history` tables stay untouched and unused. |
| What can be edited on an account? | **Name, emoji, kind (courant / épargne) and balance.** Create and archive stay as they are. |
| Does an account balance move by itself? | **Yes, with transfers only.** A transfer into an account raises its balance, a transfer out lowers it. |
| Do expenses (which carry an `account_id`) move balances? | **No.** Only transfers do. Making expenses count would require an account on every income too, turning the app into a bank ledger. Out of scope. |
| What does editing a balance by hand mean? | **It resets the starting point.** The typed amount becomes the balance as of that moment; only transfers *created* after it are added on top. *(builder's call, made in this spec — matches "recaler sur la banque")* |
| What can a transfer move between? | **Three kinds of endpoint on each side: an envelope (as today), the "Budget du mois", or an account.** Any pair is allowed except the same endpoint on both sides. *(The set of kinds was agreed; allowing every pair, including account → account, is the builder's call made in this spec.)* |
| What is the "Budget du mois"? | **The part of "Reste à dépenser" that is in no envelope** ("budget libre", §5.2). A transfer out of "Budget du mois" is capped at that amount. "Solder le budget" = "Budget du mois → (an account)" for the whole budget libre. Envelope leftovers are not soldered by hand: they are distributed at the closure, which gains a fourth destination, **"vers un compte"** (§5.4). Chosen by the household over "solder everything and let the closure find nothing" and "solder only after the closure", because otherwise envelope leftovers are counted twice. |
| Does money sent to an épargne account count as savings? | **Yes.** Net transfers from the month to an account of kind `epargne` count as the month's savings everywhere savings are shown: "Épargne versée", the donut's savings slice, the 50/30/20 savings share, the Épargne page's month contributions and its gap advice. A withdrawal from an épargne account into the month is deducted. Courant accounts never count as savings. |
| Reserve envelopes as transfer endpoints | **Not offered** *(builder's call, revised 2026-11-07)*. The household never asked for it, and today spending from a reserve already counts as month spending (`partitionExpenses` counts every expense with an envelope), so treating reserves as "outside the month" would count money twice. Today nothing stops a reserve being picked in the transfer form; this work filters reserves out of the form's lists and makes the server refuse a reserve on either side (no transfer exists in the live database, so nothing to migrate). Reserves keep working exactly as now. |
| Month navigation | **One month selector shared by the whole app**: "‹ Octobre 2026 ›" in the page header, plus "Revenir au mois en cours" when away from the current month. *(The shared, app-wide behaviour and the arrows are the spec author's proposal, accepted by the household without change.)* |
| Can past months be acted on? | **Yes: entering, editing and deleting movements in any open past month.** |
| Closed months | **Read-only, with a "Mois clôturé" banner and a "Rouvrir le mois" button.** Reopen → correct → close again from Compte rendu, which recomputes leftovers and produces a new report. Editing a closed month in place (without reopening) was rejected: the leftovers it already distributed would silently become wrong. |
| Reopening a month that has later closed months | **Reopens every later closed month too**, because their figures depend on it. The button says so before confirming. |
| Re-downloading a report | **Every closed month's PDF stays downloadable from Compte rendu → Archives** (this already exists; see §8 for the production check). |

## 4. Accounts

### 4.1 Behaviour

- Paramètres → Comptes: each account row becomes editable — name, emoji, kind, balance.
  The UI pattern follows the other editable reference rows on that page (the builder picks
  the closest existing pattern; inline edit or a small form are both fine).
- Comptes page: the "Modifier les comptes" link keeps going to Paramètres. The "solde à
  renseigner" hint (today shown when every balance is 0) keeps its meaning.
- Archiving an account does not delete its transfers; an archived account is not offered as
  a transfer endpoint, but existing transfers to it still display its name.

### 4.2 Balance model *(builder's call, made in this spec)*

An account stores a **reference balance** and the **moment it was set**:

```
balance(account) = reference_balance
                 + Σ transfers into the account created after reference_set_at
                 − Σ transfers out of the account created after reference_set_at
```

- Uses `transfers.created_at` (when the transfer was entered), not its `date`. A transfer
  backdated into September but entered today still counts if it was entered after the last
  hand-set balance. A transfer entered before the reset is assumed to be already reflected in
  the hand-typed figure.
- Editing or deleting a transfer changes the computed balance accordingly (it is computed,
  never stored as a running total).
- Existing data: `accounts.current_balance` becomes the reference balance (all four are 0
  today). The new `reference_set_at` column is back-filled to the migration time, so no
  existing transfer (all envelope ↔ envelope anyway) affects a balance.
- Setting the balance in Paramètres writes both columns. Editing only name, emoji or kind
  does not touch them.
- Part 1 extends the existing `PATCH /api/accounts/:id` with the balance (writing
  `current_balance` and `reference_set_at` together) and adds the edit UI; no new route.
- The live "Livret LDDS" is of kind `courant`. No data step changes it: the household switches
  it to épargne themselves in Paramètres once editing ships, and the hand-off notes tell them
  to. *(builder's call)*
- **Reopen and hand-set balances** *(builder's call, accepted drift)*: if an account's balance
  was typed by hand after a month was closed, reopening and re-closing that month creates a
  new closure transfer after the reset, so the leftover is counted again in that account. This
  is rare and accepted; the reopen confirmation (§7.1) warns "Les soldes de comptes saisis à
  la main depuis la clôture seront à vérifier" when any account's `reference_set_at` is later
  than the month's closure. §7.2's acceptance criterion on account balances holds when no
  balance was hand-set in between.
- **Changing an account's kind** reclassifies its transfers as savings or not in every month,
  including closed ones shown live; a closed month's frozen report keeps the figures of its
  closure. Accepted *(builder's call)*: the report is the record of the closure.
- The balance is per-account and **not** per-month: the month selector does not change what
  Comptes shows for balances. *(builder's call)*

## 5. Wider transfers

### 5.1 Schema *(shape is the builder's call, made in this spec)*

`transfers` gains, additively:

- `from_kind`, `to_kind` — a new enum `transfer_endpoint_kind` with values `envelope`,
  `budget`, `account`; `NOT NULL DEFAULT 'envelope'` (so every existing row is correctly
  described without rewriting it).
- `from_account_id`, `to_account_id` — nullable FKs to `accounts`.
- `from_envelope_id`, `to_envelope_id` — **become nullable** (a relaxation).
- Hand-written CHECK constraints, per side: `envelope` ⇒ envelope id set and account id null;
  `account` ⇒ account id set and envelope id null; `budget` ⇒ both null. Plus "the two sides
  are not the same endpoint" (budget → budget is invalid; same envelope or same account on
  both sides is invalid).

A different shape (e.g. a single polymorphic endpoint column) is acceptable if it is equally
additive and constraint-checked.

### 5.2 Effects on the month's figures

The model (the household agreed with the examples; the general rule is the builder's
formalisation):

"The month" means the Budget du mois and the **budget** envelopes. Accounts are outside it.
(Reserve envelopes are not transfer endpoints, §3.)

- **Money entering the month:** (an account) → (Budget du mois or a budget
  envelope).
- **Money leaving the month:** (Budget du mois or a budget envelope) → (an account).
- **Inside the month:** Budget du mois ↔ budget envelope, budget envelope ↔ budget envelope.
- **Outside the month:** between accounts (moves balances only).

Definitions, for a given month:

```
reste à dépenser = income received − spending − poche versements
                   + money entering the month − money leaving the month
budget libre     = reste à dépenser − Σ max(0, remaining) over active budget envelopes
savings          = poche versements
                   + money leaving the month to épargne accounts
                   − money entering the month from épargne accounts
```

"Reste à dépenser" is computed once with the formula above; the savings figure re-labels
part of what already left the month, it is **not subtracted a second time**.

| Figure | Change |
|---|---|
| "Reste à dépenser" (`computeMonthSummary`'s `unspent`) | Formula above. Inside-the-month transfers do not change it (today, envelope ceilings don't either — only actual spending does). |
| Budget libre | New figure. Shown in the transfer form when "Budget du mois" is the source ("Disponible : 150 €"). A transfer **out of** Budget du mois (to an envelope or an account) is refused by the server above it, with a French message. *(builder's call: the cap also applies to Budget du mois → envelope, since it is the same pool.)* Editing such a transfer re-checks the cap with the transfer's own amount added back. |
| Budget envelope ceiling (`computeEnvelopeLedger`) | `transfersIn` / `transfersOut` now include transfers whose other side is the budget or an account. |
| Account balance | §4.2. |
| Savings | Formula above, used by "Épargne versée", the donut's savings slice, `compute503020`, `savingsGapAdvice` and the Épargne page's month contributions (an épargne account appears there as its own line next to the poches). |
| Closure leftovers (`computeLeftovers`) | Follow from the envelope ledger, so they include these transfers automatically; the closure's `MonthData.transfers` must carry the new endpoint kinds. |
| Donut / 50/30/20 | Must stay internally consistent: today the slices "partition income exactly". With money entering from outside, the base must include it (or show it as its own slice). A month whose net savings is negative (more withdrawn from the LDDS than put in) must not draw a negative slice. The builder picks the presentation; the constraint is that the slices add up and nothing displays a negative or > 100 % share. |

Worked examples (each is a test case). LDDS is of kind `epargne`, Compte courant of kind
`courant`. Starting point for 1–4: October, income 2 000 €, spending 1 770 €, no poche
versement → "Reste à dépenser" 230 €; Restaurants has 50 € left and Sorties 30 €, so budget
libre is 150 €.

1. "Budget du mois → Livret LDDS 150 €" → "Reste à dépenser" 80 €, budget libre 0 €,
   LDDS +150 €, savings 150 €. A transfer of 230 € instead is refused (above 150 €).
2. Mid-month, "Livret LDDS → Budget du mois 100 €" → "Reste à dépenser" +100 €, budget libre
   +100 €, LDDS −100 €, savings −100 € for the month (deducted from any versement).
3. "Livret LDDS → Voyage 300 €" → Voyage ceiling +300 €, "Reste à dépenser" +300 €, budget
   libre unchanged, LDDS −300 €.
4. "Restaurants → Budget du mois 40 €" → Restaurants ceiling −40 €, "Reste à dépenser"
   unchanged, budget libre +40 €.
5. "Compte courant → Livret LDDS 500 €" → courant −500 €, LDDS +500 €, month figures and
   savings unchanged.
6. "Budget du mois → Compte joint 50 €" (courant) → "Reste à dépenser" −50 €, savings
   unchanged.

### 5.3 Form, feed, report

- `TransferForm`: "Retirer à" and "Verser à" each list, grouped: "Budget du mois", then
  envelopes, then active accounts. The subtitle "Entre deux enveloppes" changes to fit.
- The form gains a **date** field (today it has none and the server dates every transfer
  "today, Paris"). Default: today when the selected month is the current month; the last day
  of the selected month otherwise *(builder's call — the last day suits "solder à la fin du
  mois")*. The month assigned follows the date, as for expenses. Editing a transfer can move
  it to another open month (both months must be open — `assertMovable`).
- Mouvements feed label: "Transfert {from} → {to}", where the budget side reads "Budget du
  mois" and an account reads its emoji + name.
- Report snapshot / PDF: transfers list the same names. The snapshot stays
  backwards-compatible (§2).
- When "Budget du mois" is the source, the form shows the budget libre ("Disponible :
  150 €") and disables submit above it; the server is the authority (§5.2).

### 5.4 Closure destination "vers un compte"

The closure modal today offers three destinations per envelope leftover: carry over,
savings (a poche), another envelope. It gains a fourth: **an account** (active accounts,
any kind; the LDDS is the expected use).

- Schema: `closure_destination` enum gains the value `account` (`ALTER TYPE … ADD VALUE`,
  additive — note it cannot be used in the same transaction that adds it);
  `closure_envelope_decisions` gains a nullable `destination_account_id` FK to `accounts`.
- Effect: the closure writes, in the closed month, a **transfer** "envelope → account" for
  the leftover, dated the last day of that month. So the account balance rises (§4.2), the
  amount counts as savings if the account is of kind `epargne` (§5.2), and the report lists
  it. To let reopening find and remove these rows, `transfers` gains `source` with the
  existing enum's values `manual` / `closure` (`NOT NULL DEFAULT 'manual'`, mirroring
  `savings_entries.source`) *(builder's call)*. A closure transfer is read-only in
  Mouvements, like closure versements today.
- `close_month` is replaced by a new hand-written migration (`CREATE OR REPLACE FUNCTION`)
  that also inserts these transfers. `planClosure`, the closure input schema, the closure
  modal's totals ("par destination") and the report snapshot gain the account destination.
- The household's "Solder le budget" at month end is therefore: transfer the budget libre by
  hand (§5.2 example 1), then at closure send envelope leftovers to the LDDS.

## 6. Month navigation

### 6.1 Behaviour

- The page header of the month-based pages shows "‹ {Mois année} ›". Previous / next move
  one month. "Revenir au mois en cours" appears when the selected month is not the current
  Paris month.
- The selection is **shared across pages** and survives navigation and a page reload
  *(builder's call: a URL query parameter such as `?mois=2026-09`, carried by the sidebar
  links, is suggested so a reload or a shared link keeps the month; any mechanism meeting
  the requirement is fine)*.
- Pages that follow the selected month: Tableau de bord, Enveloppes (including the envelope
  journal drawer), Mouvements, Comptes (fixed charges and variable spend — not balances,
  §4.2), Épargne (month contributions; its six-month history ends at the selected month), and
  the sidebar ceilings widget. Paramètres, Envies and Compte rendu do not take a month.
  *(builder's call on Envies/Épargne details)*
- Range: back to the first month with data; forward up to the current month *(builder's
  call — no future months)*.
- Entering a movement while a past month is selected: the date fields of every entry form
  (expense, income, transfer, savings) default into that month (§5.3's rule), and stay
  editable.
- A month ≤ the latest closed month is read-only everywhere it is shown: entry is disabled
  or refused with the existing message, Mouvements rows open read-only as today, and a
  banner "{Mois} est clôturé" carries the "Rouvrir le mois" action (§7).

### 6.2 Constraints

- **One call per page** (`docs/HANDOFF.md` §4, `tests/e2e/perf.spec.ts`): each
  `/api/pages/*` endpoint (and the other page-level endpoints listed in the grep of
  `new Date()` under `server/api`) accepts the selected year/month instead of computing it
  from `new Date()`. Changing month is one request, not several. `useLazyFetch` +
  `<PageSkeleton />` as today; no top-level `await useFetch`.
- The server validates the requested month (integer year, 1–12, not in the future) and
  falls back to the current Paris month when absent.
- Writes keep `assertMonthOpen` as the authority; the UI's read-only state is a courtesy.

## 7. Reopening a closed month

### 7.1 Behaviour

- "Rouvrir le mois" appears on the closed-month banner (§6.1) and on each row of Compte
  rendu → Archives.
- An inline confirmation (the app avoids `confirm()`) explains: the report will be deleted
  and regenerated at the next closure; leftovers carried over, sent to a poche or sent to an
  account will be undone; and, if later months are closed, "Octobre 2026 et Novembre 2026 seront aussi
  rouverts".
- After reopening, the months are ordinary open months: movements can be entered, edited and
  deleted. Compte rendu then offers to close the earliest reopened month, as today
  (`closureWindow` already walks forward from the first unclosed month with data).

### 7.2 What reopening undoes

For the target month M and every closed month after it, in one transaction — a new
hand-written SQL function (`reopen_month`, SECURITY INVOKER like `close_month`, granted to
`authenticated` only):

- delete the `monthly_reports` row(s);
- delete the `closure_envelope_decisions` rows;
- delete `savings_entries` with `source = 'closure'` for those months (manual versements are
  untouched);
- delete `transfers` with `source = 'closure'` for those months (§5.4; manual transfers are
  untouched);
- undo the next-month effects written by `close_month`: the carried-over amount and
  overspend deduction it wrote on the following month's `monthly_envelope_allocations`;
- **keep** the "freeze" allocation rows `close_month` wrote for the closed month itself, so a
  reopened month keeps the ceilings it was lived with even if a default ceiling changed
  since *(builder's call)*;
- remove the `month_closures` row(s), so that `close_month`'s INSERT works again (the table
  has a unique index on (year, month); flipping `status` back to `open` would make the next
  closure fail).

**Acceptance criterion:** after reopening, every figure of the reopened months and of the
month after the last one (envelope ceilings, leftovers, "Reste à dépenser", savings, account
balances) equals what it was just before those closures, given unchanged movements. (The
kept freeze rows hold exactly the ceilings in force at closure time, so this holds even if a
default ceiling changed in between.) The builder determines exactly which allocation
rows/columns `close_month` wrote (it inserts or upserts next-month rows) and how to restore
them; a test closes a month, reopens it, and compares against the pre-closure figures.

Expenses, incomes, manual transfers and manual savings versements are never touched by
reopening. Account balances move back only by the closure transfers that are removed.

### 7.3 Server rules

- `POST /api/closure/reopen` (or similar) with `{ year, month }`; 409 with a French message
  if that month is not closed.
- The existing rules stay: months close strictly in order, a closed month is frozen,
  `assertMonthOpen` treats every month up to the latest closed one as frozen.

## 8. Report download check

The PDF link already exists in Compte rendu → Archives (`/api/reports/:year/:month`) but has
never been verified in production (`docs/HANDOFF.md` §6, step 5: fonts loaded from Nitro's
server-assets mount on Vercel). Part of this work: download September 2026's PDF from the
deployed site and confirm it opens with its fonts. If it fails, fixing it is in scope.

## 9. Order of delivery

Five parts, one spec, one plan, delivered in this order (each leaves the app working):

0. The three small items of §13 (entry reset, search by amount, receipt check) — independent
   of everything else, and §13.1 is a bug that can cause duplicate entries today.
1. Account editing and the balance model (§4).
2. Wider transfers, budget libre, savings to épargne accounts (§5.1–5.3) — depends on 1 for
   balances; then the closure's "vers un compte" destination (§5.4).
3. Month navigation (§6).
4. Reopening a month (§7) and the report download check (§8) — the reopen button lives on
   the banner from 3.

## 10. Non-goals

- Expenses or incomes moving account balances; per-account bank reconciliation.
- Anything with the `livrets*` tables.
- Editing a closed month without reopening it.
- Keeping old versions of a report after reopening (only the latest closure's report exists).
- The scheduled email, and part C (visualisations) from the 2026-10-14 spec.

## 11. Anti-goals (would be a failure even if it "works")

- Losing or rewriting existing data, or running `drizzle-kit push`.
- A reopened-then-reclosed month whose figures differ from a month closed once with the same
  movements.
- September 2026's existing report no longer downloading.
- A page making more than one data call per navigation, or month changes feeling slow.
- Tests that pass while asserting nothing (`docs/HANDOFF.md` §4) — each worked example in
  §5.2 and the reopen criterion in §7.2 are real assertions.

## 12. Testing

- Unit: the balance formula (§4.2), the six transfer examples (§5.2) through the dashboard
  summary, the envelope ledger, the budget libre cap and the savings
  figure (dashboard, 50/30/20, Épargne), the transfer schema refinements, the closure plan
  with an account destination (§5.4), the month parameter parsing, the reopen/close round
  trip (§7.2).
- E2E: they run against the live database (`docs/HANDOFF.md` §5). Specs must delete every
  row they create; **no E2E may close or reopen a real month**. Reopen is covered by unit /
  integration tests on the SQL function, or by a test that runs only against a disposable
  database.
- `tests/e2e/perf.spec.ts` stays green, including with a month selected.

## 13. Small additions from `feedback.md` (added 2026-11-07)

`feedback.md` at the repo root repeats items 1–4 of §1 and adds three more. They are
independent of §4–§8 and are delivered first (§9, part 0).

### 13.1 Reset the entry form after saving (bug)

Feedback: "quand la saisie d'entrée ou de sorties a été faite et enregistrée au moment des
mouvements, reset les montants et les enveloppes renseignés pour éviter d'enregistrer la même
saisie deux fois."

Today `EntryPanel.handleSaved` resets its own draft refs (`draftAmount`, `draft*EnvelopeId`,
…) but the mounted form (`ExpenseForm`, `IncomeForm`, `TransferForm`, `SavingsForm`) keeps
its own `amount`, envelope and other fields, so pressing "Enregistrer" again saves the same
movement twice.

- After a **successful creation**, every entry form returns to its empty state: amount 0,
  envelope(s) / transfer endpoints / poche cleared, label cleared. *(builder's call: date,
  category, account and "financé par" are kept, which suits entering a pile of receipts one
  after another.)* The preview lines in `EntryPanel` disappear with it.
- On a failed save nothing is reset.
- The edit drawer (`MovementEditor`, `editing` prop) is unaffected: it closes on success.
- The builder picks the mechanism (e.g. a `reset()` exposed by each form, or re-keying the
  form component so it remounts). It must cover all four forms, including the transfer form
  of §5.3 and its date field.
- Test: an E2E (or component test) that saves an expense, then checks the amount reads 0 and
  the submit button is disabled; same for an income. E2E rows are deleted afterwards (§12).

### 13.2 Search by amount in Mouvements

Feedback: "rendre possible de rechercher un montant aussi."

Today the Mouvements search box matches the label only (`app/pages/mouvements.vue`).

- The same box also matches amounts. *(builder's call on the matching rule:)* when the query,
  once spaces and "€" are removed, looks like a number ("12", "12,5", "12.50"), a movement
  matches if its absolute amount written with two decimals and a comma ("12,50") contains
  the query normalised to a comma; a label match still counts, so "12" also finds "Ticket 12".
  Signs are ignored ("-12" finds the 12 € expense).
- Client-side, on the month's list already loaded (no new request). Placeholder becomes
  "Rechercher un libellé ou un montant…".
- Unit test on the matching function (12 / 12,5 / 12.50 / "12 €" / -12 / a label).

### 13.3 "Vérifié avec le ticket" on expenses

Feedback: "encart à rajouter sur les sorties pour pouvoir cocher ok quand on a vérifié avec
les tickets." Agreed with the household (2026-11-07):

- In **Mouvements**, every expense row has a checkbox at the end of the row. Ticking it does
  not open the edit drawer (the click must not bubble to the row). A ticked row shows a green
  ✓. Incomes, transfers and savings versements have no checkbox.
- Above the list, a counter "{n} sorties à vérifier" for the displayed month, and a filter
  "À vérifier" next to the existing ones (Tous / Sorties / …) that shows only unticked
  expenses. When n = 0 the counter reads "Toutes les sorties sont vérifiées".
- It can be unticked at any time.
- **It works in closed months too**: ticking changes no budget figure, it is only a check
  mark. So the endpoint does **not** call `assertMonthOpen`, and the read-only state of
  closed-month rows (§6.1) does not disable the checkbox.
- Schema (additive): `expenses.verified_at timestamptz NULL` (null = not checked; existing
  rows stay unchecked). *(builder's call: a timestamp rather than a boolean, free extra
  information.)*
- API: a dedicated endpoint, e.g. `PATCH /api/expenses/:id/verified` with
  `{ verified: boolean }`, that touches only that column. Editing an expense through the
  normal form keeps its check state. *(builder's call)*
- The movements feed (`shared/types/movement.ts`) carries `verified` for expenses. The tick
  updates the row optimistically and rolls back with an error message if the request fails;
  it does not need to refresh the dashboard or ceilings.
- Not shown in the report / PDF, the dashboard or anywhere else. *(builder's call)*
- Tests: unit on the endpoint's validation; an E2E that ticks its own test expense, reloads,
  sees it ticked and counted, unticks it, then deletes the row (§12).

