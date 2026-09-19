# Budget Planner PWA — Design Spec

**Date**: 2026-09-19
**Source material**: `Septembre 2026.xlsx` (the current spreadsheet), the girlfriend's written brief, and the Figma file
[Laura Budget](https://www.figma.com/design/E6CGJ59EuSDp5s0ovq1aXK/Laura-Budget?node-id=6-2522&m=dev) (section "Final", node `6:2522`), which contains a full set of mockup screens plus a written page-by-page answer to every point in the brief.

## 1. Overview & goals

Replace an annual budget-tracking spreadsheet with a installable, mobile-first web app (PWA) for a single user (the user's girlfriend). It is hosted on Vercel, so "single user" does not mean "low security" — there is no public sign-up, and every request is authenticated server-side.

The Figma file is treated as the source of truth for product decisions. Where it deliberately deviates from the original written brief (e.g. one entry screen with a Sortie/Entrée/Transfert toggle instead of two separate tabs), that deviation is final. Three points the brief left open are resolved by the Figma file and treated as final: partial reimbursement across multiple income entries on one envelope is allowed; the destination of an envelope's month-end leftover is chosen per envelope (with two global shortcuts); the "Cadeaux" envelope means only gifts the user gives, never gifts received.

This is planned as **one unified build** (not a strict MVP/Phase-2 split), sequenced internally so early milestones are usable end-to-end before later ones (see §12).

## 2. Tech stack

- **Framework**: Nuxt 4 (Vue 3), deployed on Vercel.
- **Auth + DB**: Supabase — Postgres database, Supabase Auth for the single account (email + password, no public sign-up route).
- **ORM**: Drizzle, against the Supabase Postgres connection string.
- **All data access goes through Nitro server API routes** (`server/api/*.ts`). No Supabase client calls from the browser, no Row-Level-Security policies to maintain — every route independently verifies the session and that the row belongs to the seeded user id (defense in depth, in case a second account is ever added).
- **UI**: Nuxt UI + Tailwind CSS. No existing Figma-generated component library yet — scaffold with Nuxt UI now (Tailwind-based, so Figma-derived tokens/components can replace pieces later without a rewrite).
- **Validation**: Zod schemas shared between client forms and server route input validation.
- **State/data fetching**: Nuxt composables + `useState`, `useFetch`/`useAsyncData`. No Pinia — the app isn't state-heavy enough to need it.
- **PWA**: `@vite-pwa/nuxt` — installable (manifest, icons, add-to-home-screen). No offline data entry or background sync; the app requires connectivity.
- **PDF generation**: server-side in the closure-validation route. Exact library (`puppeteer-core` + `@sparticuz/chromium` for HTML-to-PDF vs. a programmatic library like `pdfkit`) to be decided during implementation planning based on how visually rich the page-3 expense listing needs to be.
- **Email**: a transactional email API (e.g. Resend) sends the closure PDF/link on the 1st of the month.
- **Scheduling**: Vercel Cron hitting a protected Nitro endpoint for the automatic monthly email reminder. Closure itself is always a manual user action.
- **Testing**: Vitest for domain logic (pure functions), Playwright for critical end-to-end flows.

## 3. Architecture

All business logic (envelope ceiling math, transfers, 50/30/20 targets, net-spent calculations, closure application) lives in a single server-side domain module, called from Nitro API routes. This keeps the logic in one typed, unit-testable place instead of spread across client code and database policies — important given the spreadsheet's 50/30/20 box broke precisely because this kind of calculation was scattered across fragile formulas.

Route protection: a Nuxt middleware redirects unauthenticated requests to `/login`; every `server/api/*` handler re-verifies the Supabase session independently (never trusts middleware alone for API security).

Navigation is a bottom tab bar matching the Figma: **Accueil / Enveloppes / Épargne / Plus** (Plus contains Comptes, Envies, Cadeaux, Paramètres, Compte rendu).

## 4. Data model

### Reference tables (editable via Paramètres)

- **`categories`**: `id`, `name`, `emoji`, `is_fixed` (bool), `default_target` (nullable, mainly for fixed categories — e.g. Loyer), `fifty_thirty_twenty_bucket` (`besoins` | `envies` | `epargne`), `sort_order`, `archived_at`.
- **`envelopes`**: `id`, `name`, `emoji`, `kind` (`budget` | `reserve`), `default_ceiling` (numeric, 0 allowed, null for `reserve`), `fifty_thirty_twenty_bucket` (nullable — null for `reserve` kind, since those are excluded from the rule), `carry_over_default` (bool), `show_on_home` (bool — flags envelopes like Voyage/Sport that should also surface in the home dashboard's variable-charges view), `sort_order`, `archived_at`.
- **`income_types`**: `id`, `name`, `emoji`, `requires_details_text` (bool — true only for "Autre"), `default_target_envelope_id` (nullable FK to `envelopes`, pre-fills the entry form), `sort_order`, `archived_at`.
- **`accounts`**: `id`, `name`, `emoji`, `current_balance` (numeric, manually updated), `sort_order`, `archived_at`.
- **`savings_goals`**: `id`, `name`, `receives_salary_variance` (bool — true only for "Long terme"), `sort_order`. Seeded with the three goals: Long terme, Cadeaux & fêtes, Vacances & imprévus.

A category and an envelope may share a name/emoji by convention (e.g. both called "Restaurants") but are administratively independent lists, exactly as in the current spreadsheet's separate "Catégories" and "Enveloppes" columns. An expense entry references a category (required, for classification/50-30-20) and, independently, an optional envelope (which budget pool it draws down).

### Transactional tables

- **`expense_entries`**: `id`, `date`, `category_id`, `label`, `amount`, `account_id` (nullable — null when `financed_by = 'gift_received'`), `envelope_id` (nullable — the budget pool this draws down, which for `financed_by = 'gift_received'` is the reserve envelope itself), `financed_by` (`budget` | `gift_given` | `gift_received`, default `budget`), `month_assigned` (derived from `date` unless overridden), `created_at`.
- **`income_entries`**: `id`, `income_type_id`, `label`, `amount`, `date_received`, `month_assigned` (distinct from `date_received` — user-selectable, matching the spreadsheet's original "mois d'affectation" behavior), `details_text` (nullable, only meaningful when the income type requires it), `target_envelope_id` (nullable — when set, credits that envelope's ledger and is **excluded** from the month's total income used for the dashboard/50-30-20 calculations; when null, counts as normal monthly income), `created_at`.
- **`transfers`**: `id`, `date`, `from_envelope_id`, `to_envelope_id`, `amount`, `reason`, `month_assigned`, `created_at`. A transfer never changes the sum of all envelope ceilings — it only moves ceiling between two `budget` envelopes for the current month.
- **`monthly_envelope_allocations`**: `id`, `envelope_id`, `year`, `month`, `base_ceiling` (snapshot at month start — either the envelope's `default_ceiling` or the result of a prior closure decision), `carried_over_amount`, `overspend_deduction` (auto-applied from the previous month's closure if it was overspent). The **current ceiling** for a month = `base_ceiling + carried_over_amount - overspend_deduction + transfers in - transfers out`; **net spent** = `sum(expense_entries where envelope_id = this, month = this) - sum(income_entries where target_envelope_id = this, month = this)`; **remaining** = current ceiling − net spent. This is computed on read, not stored.
- **`savings_entries`**: `id`, `savings_goal_id`, `year`, `month`, `amount`. When a month's payroll variance (received − expected salary) is positive, it is automatically added to whichever goal has `receives_salary_variance = true`, on top of whatever the user manually enters for that goal that month.
- **`livrets`**: `id`, `name`, `opening_balance`, `sort_order`, `archived_at`.
- **`livret_contributions`**: `id`, `livret_id`, `date`, `amount`. Current balance = opening balance + sum of contributions for the current year.
- **`livret_yearly_history`**: `id`, `livret_id`, `year`, `closing_balance` — populated at the annual reset (mirrors the spreadsheet's "Historique des soldes au 31 décembre").
- **`wishlist_items`**: `id`, `label`, `price`, `product_url` (nullable), `priority` (`haute` | `moyenne` | `basse`), `note` (nullable), `purchased_at` (nullable). Size bucket (petite/moyenne/grosse) is derived from `price` (< 50 / 50–150 / > 150), not stored.
- **`month_closures`**: `id`, `year`, `month`, `closed_at`, `status`.
- **`closure_envelope_decisions`**: `id`, `month_closure_id`, `envelope_id`, `leftover_amount`, `destination` (`carry_over` | `savings` | `envelope`), `destination_savings_goal_id` (nullable), `destination_envelope_id` (nullable). Applied on validation to create the next month's `monthly_envelope_allocations` rows and any resulting `savings_entries`.
- **`monthly_reports`**: `id`, `month_closure_id`, `pdf_path`, `generated_at`, `emailed_at` (nullable).

### Payroll tracking

- **`salary_entries`** (or reuse `income_entries` with a dedicated income type "Salaire fixe" plus two extra fields `expected_amount` and `expected_date` for the écart calculation) — kept as an extension of `income_entries` rather than a separate table, to avoid duplicating the income model. The salary variance (`amount − expected_amount`) feeds `savings_entries` for the goal with `receives_salary_variance = true`.

## 5. Auth & security

- Supabase Auth, email + password. The single account is created directly (Supabase dashboard or a one-off seed script) — there is no sign-up UI in the app.
- Nuxt middleware redirects unauthenticated navigation to `/login`.
- Every Nitro API route independently verifies the Supabase session server-side, and scopes every query to the seeded user id (belt-and-braces even though there's only one user today).
- All secrets (Supabase URL/keys, email API key) live in Vercel environment variables. The Postgres service-role connection string used by Drizzle is server-only and never reaches the client bundle.
- No client-side Supabase calls and no Row-Level-Security policies to maintain — all access control is enforced in the Nitro layer.

## 6. Feature breakdown, mapped to the brief

| Brief ask | Resolution (per Figma) |
|---|---|
| "Autre" income type + free-text details | `income_types.requires_details_text`; the entry form shows a "Détails" field only for that type. |
| Fix the broken 50/30/20 box | Target amount is computed as `% × base` (not left blank/erroring); the unallocated share is shown explicitly rather than folded into 100%. |
| Transfer envelope leftovers mid-month | The `⇄ Transfert` entry type — available any time in the month, not just at closing — reallocates ceiling between two envelopes and logs the movement in both. |
| Two "cadeaux" boxes (given vs. received) | Two separate envelopes: `Cadeaux` (`kind = budget`, what the user gives) and `Anniversaire et fêtes` (`kind = reserve`, funded by gift income). The expense form's `financed_by` field (`budget` / `gift_given` / `gift_received`) tags which case an expense belongs to. |
| 0€-budget variable category still tracked | Any `budget` envelope can have `default_ceiling = 0`; the UI shows the overrun in € (never %, avoiding divide-by-zero) and flags it in red on the home dashboard when `show_on_home = true`. |
| Pie chart should exclude planned savings | The home dashboard subtracts planned savings from salary **before** computing "reste à dépenser" and the usage breakdown — savings is a deduction shown above the chart, not a slice within it. |
| Two tabs "saisie des entrées"/"saisie des sorties" | **Deliberately overridden** in the Figma: one entry screen with a `− Sortie / + Entrée / ⇄ Transfert` toggle, so the "Enveloppe associée" field and layout are shared. This is treated as final. |
| Envelope replenishment via reimbursement | `income_entries.target_envelope_id` — any income (typically `income_type = Remboursement`) can be directed to credit an envelope; the credit reduces net spent without inflating the month's income total. This is the Coline/Airbnb example verbatim. |
| Downloadable end-of-month report | Validating a `month_closure` generates a 2-page PDF (income, expenses incl. transfers/envelope movements, envelopes, savings, 50/30/20, closure summary), archived per month, downloadable, and auto-emailed on the 1st of the following month. |
| Always-visible envelope ceilings | A quick bottom-sheet, reachable from any screen (swipe-up gesture or a persistent widget/button), listing every envelope's ceiling and remaining amount. |
| Emojis throughout | Every reference table (`categories`, `envelopes`, `income_types`, `accounts`) carries an `emoji` field, rendered everywhere the item appears — matching the spreadsheet's existing visual language. |

Two points the brief left ambiguous, resolved by the Figma and treated as final (per your confirmation): partial reimbursement across multiple income entries targeting the same envelope is allowed; leftover destination at closure is chosen per envelope (plus two global shortcuts, "Tout reporter" / "Tout épargner").

## 7. Domain logic details

- **50/30/20**: base = total monthly income excluding any income with a `target_envelope_id` set and excluding planned savings. Target amount per bucket = `bucket % × base`. Real amount per bucket = sum of fixed-charge + variable-category + budget-envelope spend tagged with that bucket (`gift_received`-financed expenses are excluded entirely, since their envelope has no bucket). The unallocated remainder is shown explicitly.
- **Home "reste à dépenser"**: `salaire du mois − épargne prévisionnelle = budget du mois`; the usage ring/percentage is `dépensé / budget du mois`, not `dépensé / salaire`.
- **Envelope closure**: for every `budget` envelope, compute the month's leftover (`remaining`, which may be negative). Present each with a destination choice; two shortcuts pre-fill "Tout reporter" (destination = carry_over for all with leftover ≥ 0) or "Tout épargner" (destination = savings, default goal = Long terme, for all with leftover ≥ 0). Overspent envelopes (`remaining < 0`) always get an automatic `overspend_deduction` applied to the next month's `base_ceiling` — no destination choice needed for those. Validating writes the `closure_envelope_decisions`, generates next month's `monthly_envelope_allocations`, creates any resulting `savings_entries`, generates the PDF, and marks the closure `closed_at`.
- **Reserve envelopes**: never appear in a closure — their balance simply carries forward indefinitely.

## 8. Assumptions flagged for confirmation

These are reasonable interpretations where the Figma mockup content didn't fully spell out the mechanism. Worth a quick confirmation with your girlfriend before or during implementation, but they don't block starting the build:

1. **Transfer scope**: the mockup shows a "Portée: Ce mois seulement" pill with no alternative visible elsewhere in the file. v1 assumes transfers only ever apply to the current month (no "permanent" reallocation of an envelope's `default_ceiling`).
2. **Comptes "prévisionnel" balance**: the spreadsheet had a full daily balance-projection sheet that doesn't appear in the Figma file. v1 computes "upcoming" as unpaid fixed charges this month plus remaining envelope ceilings not yet spent, rather than reproducing the old day-by-day projection.
3. **PDF/email library**: exact packages (e.g. `puppeteer-core`+`@sparticuz/chromium` vs. `pdfkit`, and the email provider) will be pinned down during implementation planning, not in this spec.

## 9. Out of scope for this build

- Multi-user support, sharing, or any invite/permission system.
- Offline data entry / background sync (the PWA is installable but requires connectivity).
- CSV/Excel export (only the PDF report is in scope; could be added later if still wanted after the PDF ships).
- Editing/duplicating the app annually the way the spreadsheet required — the app is designed to hold history indefinitely across years, so this concern doesn't apply.

## 10. Testing strategy

- **Vitest** for the domain logic module: envelope ceiling/net-spent computation, transfer application, 50/30/20 target math, closure application (including the overspend-deduction and carry-over paths) — this is exactly the class of calculation that broke silently in the spreadsheet, so it gets the heaviest test coverage.
- **Playwright** for critical end-to-end flows: login, add an expense (all three `financed_by` variants), add a reimbursement income that credits an envelope, perform a transfer, run a month closure end-to-end and confirm the PDF is generated.

## 11. Deployment

- Hosted on Vercel. Supabase project for Postgres + Auth. Environment variables for Supabase keys and the email API key configured in the Vercel project, never committed.
- Drizzle Kit migrations run as part of the deployment pipeline (or manually before each deploy during early development).
- Vercel Cron for the monthly auto-email trigger.

## 12. Suggested build order (single plan, staged milestones)

1. Project scaffold: Nuxt 4 + Supabase Auth + Drizzle schema + Nitro API skeleton + PWA manifest + login flow.
2. Paramètres (all reference tables) + the unified Sortie/Entrée/Transfert entry screen.
3. Envelopes tab (ceiling/net-spent/journal) + Accueil dashboard (fixed/variable charges, 50/30/20, home usage breakdown).
4. Épargne (goals, salary variance, annual progress) + Livrets.
5. Month closure flow + PDF report generation + archive + scheduled email.
6. Comptes + Liste d'envies v2.
7. Always-visible envelope ceiling quick-sheet (can land any time after milestone 3, since it just reads existing envelope data).

This build order is a starting point for the implementation plan, not a hard commitment — `writing-plans` may refine it further once it breaks the work into concrete tasks.
