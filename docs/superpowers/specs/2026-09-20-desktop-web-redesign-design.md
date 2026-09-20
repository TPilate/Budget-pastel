# Desktop Web Redesign — Design Spec

**Date**: 2026-09-20
**Source material**: `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md` (original spec, still authoritative for domain logic and data model except where this doc overrides it), and the Figma file [Laura Budget](https://www.figma.com/design/E6CGJ59EuSDp5s0ovq1aXK/Laura-Budget?node-id=22-4621&m=dev), section "Final - web" (node `22:4621`), which contains 7 full desktop mockup screens at 1440×900.

## 1. Overview & goals

The product direction changes from an installable mobile-first PWA to a **desktop-only web app**. The original spec's domain logic, data model, auth model, and tech stack are unaffected; this document supersedes only the navigation/layout and view-level design, and adds one small data-model extension (§5).

Rationale: the Figma file now has a dedicated "Final - web" section built specifically for a 1440×900 desktop viewport, replacing the mobile-first mockups the original spec was built from. The user (product owner) has confirmed this is the new direction, not an additional responsive breakpoint.

## 2. What's dropped

- **PWA install-ability**: remove `@vite-pwa/nuxt`, the manifest config in `nuxt.config.ts`, and `public/icon-192.png` / `public/icon-512.png`.
- **Mobile-first layout**: `app/layouts/default.vue` (bottom tab bar) is replaced, not extended with a breakpoint. No responsive mobile support is maintained.
- **`EntrySheet.vue`** (mobile bottom-sheet) and its `useEntrySheet` composable are replaced by a page-scoped panel (§4.3).
- No PWA/offline testing scope; connectivity is always assumed, same as before.

## 3. App shell

A persistent left sidebar replaces the bottom tab bar. Structure, top to bottom:

1. **Logo chip** — "B Budget" wordmark/icon, static.
2. **Primary nav** — 8 items, each an icon + label, active state = filled background + bold text:
   - Tableau de bord (`/`)
   - Enveloppes (`/enveloppes`)
   - Mouvements (`/mouvements`)
   - Épargne (`/epargne`)
   - Envies (`/envies`)
   - Comptes (`/comptes`)
   - Compte rendu (`/compte-rendu`)
   - Paramètres (`/parametres`) — not present in the Figma mockup's sidebar; added per product decision so reference-data management stays directly reachable, since the mockup's user-chip menu wasn't itself part of the design file's scope.
3. **Ceilings widget** ("Plafonds") — pinned above the user chip. Shows total remaining, a progress bar, and the top 3 envelopes (name, emoji, remaining amount) with a "Voir les N enveloppes" link to `/enveloppes`. This replaces the original spec's "always-visible envelope ceiling quick-sheet" (§6/§12 of the original spec) — instead of a swipe-up sheet reachable from any mobile screen, it's permanently visible in the sidebar on every page.
4. **User chip** — avatar + name ("Marion") at the very bottom. Opens an account menu (new, not in the mockup) containing at least "Se déconnecter"; Paramètres is a full sidebar item per above rather than living only in this menu.

**Main content area**: every page has a `PageHeader` (title, optional contextual controls — month switcher, search box, filter pills — and 1-2 action buttons, one typically primary/filled) followed by the page body. Page bodies are two-column where the mockup shows a right-hand info panel (Tableau de bord, Enveloppes, Mouvements, Compte rendu, Épargne), single-column otherwise (Envies, Comptes use a 3-column card grid and stat-row layout respectively, not a fixed sidebar column).

## 4. Views

### 4.1 Tableau de bord (`/`)

Full rebuild of the current placeholder. Top to bottom:
- `PageHeader`: month name + prev/next arrows, "N jours restants", "Clôturer le mois" (secondary button, links to `/compte-rendu`) and "+ Nouvelle saisie" (primary button, navigates to `/mouvements` with the entry panel pre-opened).
- KPI row: 4 `StatCard`s — Salaire reçu, Épargne versée, Enveloppes (engagé), Reste à dépenser (this last one visually highlighted/tinted).
- "Utilisation du salaire" card: `DonutChart` (% of salary allocated) + legend rows (Charges fixes, Enveloppes, Variables, Épargne, Non dépensé — each with € and %) + a small 50/30/20 readout on the right of the card header.
- "Enveloppes du mois" card: 2×3 grid of `EnvelopeCard` tiles (emoji, name, spent/remaining, progress bar; overspent tiles render in the warn palette), each showing envelopes flagged `show_on_home`.
- Right column: "Derniers mouvements" card (list of the 5 most recent entries with "Tout voir" → `/mouvements`), "Épargne" summary card (total + per-goal breakdown), and a highlighted card for the "Anniversaire et fêtes" reserve envelope (amount available + explanatory note that it's excluded from budget/50-30-20).

### 4.2 Enveloppes (`/enveloppes`)

- `PageHeader`: "Enveloppes" + month pill, "Modifier les plafonds" (secondary) and "Transférer" (primary, opens the Mouvements entry panel pre-set to the Transfert tab).
- `DataTable` (columns: Enveloppe [emoji+name+subtitle], Plafond, Dépensé, Restant, Progression bar), one row per `budget`-kind envelope, plus a "Total" footer row. Reserve-kind envelopes (Anniversaire et fêtes, Extras) render as two separate summary cards below the table, not table rows — matching the mockup's visual split between budget envelopes (tracked against a ceiling) and reserve envelopes (accumulate/carry indefinitely).
- Row click opens a `DetailDrawer` on the right: envelope name + month, "reste à dépenser" hero figure with progress bar, a contextual note (e.g. reimbursement/transfer context), and a "Journal" list of that envelope's movements for the month with a "Dépensé net" total footer.
- Sidebar ceilings widget total mirrors the table's Total row.

### 4.3 Mouvements (`/mouvements`)

- `PageHeader`: "Mouvements" + filter pills (Tous/Sorties/Entrées/Transferts), a search input, and "+ Nouvelle saisie" (primary).
- `DataTable` (Date, Libellé, Enveloppe, Origine, Montant — amount color-coded by sign), filtered by the active pill and search text.
- **`EntryPanel`** (right column, always rendered on this page — not a modal/overlay): header with the − Sortie / + Entrée / ⇄ Transfert toggle (reuses the existing `SegmentedToggle` + `ExpenseForm`/`IncomeForm`/`TransferForm` components), a live amount readout, the form fields, and a new **"Après validation" preview block** showing the before/after ceiling impact on the affected envelope(s) (e.g. for a transfer: both envelopes' plafond before → after). Ends with Annuler / Valider buttons.
- The dashboard's "+ Nouvelle saisie" and Enveloppes' "Transférer" both land here with the panel pre-opened to the relevant tab, per the page-scoped decision — there is no global overlay anymore.

### 4.4 Épargne (`/epargne`)

- `PageHeader`: "Épargne" + "N € prélevés le J" pill, "Modifier le prélèvement" (secondary) and "+ Nouvelle poche" (primary).
- "Les trois poches" card: one row per savings goal (Long terme, Sécurité, Projets) — emoji, name, subtitle (contribution/mois + target description), current amount, progress bar toward `objectif`.
- "Six derniers mois" card: 6-bar column chart, current month bar visually emphasized.
- Right column: "Règle 50/30/20" card (Besoins/Envies/Épargne actual % vs target %, plus a note on the gap) and "Versements du mois" card (auto-prélèvement, écart de salaire, reliquats de clôture — each a line item with date/source and amount).

### 4.5 Envies (`/envies`)

- `PageHeader`: "Envies" + "N envies · X € au total" pill, "Trier par priorité" (secondary) and "+ Nouvelle envie" (primary).
- Three-column card grid, one column per size bucket (Petites ≤50€, Moyennes 50–200€, Grosses >200€ — bucket derived from `price` per the original spec, not stored). Each column header shows the bucket label + range. Each item card: priority-color dot, label, price, and a context subtitle (linked envelope + remaining/overspend note, or a "Financable dès maintenant" flag with a progress bar when a linked savings goal already covers the price).
- A "Priorités" summary card (count by Haute/Moyenne/Basse) renders at the bottom-left of the content area, below the 3 columns — a page-local card, not part of the global `AppSidebar`.

### 4.6 Comptes (`/comptes`)

- `PageHeader`: "Comptes" + "Pointer les charges fixes" (secondary) and "+ Relier un compte" (primary, **non-functional placeholder** — no bank API integration; see §5).
- Stat row: Solde bancaire, Engagé par les enveloppes, Vraiment libre (highlighted).
- "Comptes reliés" card: list of accounts (emoji, name, subtitle, balance) — same manually-updated `accounts` table as before; "synchronisé" labels and the "Dernière synchro"/"Synchroniser" sidebar card are static/decorative, not wired to a real sync job.
- "Charges fixes du mois" card: two-column checklist of fixed-category expenses for the month, each with a checkmark reflecting the new `pointed_at` field (§5), plus an "N€ · X sur Y pointées" header count.
- Right column: "Dépenses variables" card (per variable-category progress bars vs. planned amount), "Prochaine échéance" card (next expected salary date/amount + next auto-prélèvement date), "À pointer" reconciliation note card.

### 4.7 Compte rendu (`/compte-rendu`)

Merges the original spec's month-closure flow and its monthly-report archive into one page (previously modeled as a one-time action + separate archive).

- `PageHeader`: "Clôture de [mois] [année]" + "N € de reliquats à répartir" pill, "Télécharger le PDF" (secondary, disabled until closed) and "Clôturer et ouvrir [mois suivant]" (primary).
- "Répartition des reliquats" card: explanatory text, 4 summary stat tiles (Reporté sur octobre / Vers l'épargne / Autre enveloppe / Non réparti), then a table (Enveloppe, Reliquat, Destination) where each row's Destination cell is a pill-group (Reporter / Épargne / Enveloppe name if a same-month transfer target applies / "À décider") — matches the original spec's closure domain logic (§7 "Envelope closure") exactly, just laid out as an inline table with pill-buttons instead of a modal wizard.
- Right column: "Compte rendu — aperçu" card, a live preview of the generated PDF's first page (stat tiles, salary-usage bar, entrées list) with page-dot pagination indicator.
- A page-local "Archives" card (bottom-left, same placement pattern as Envies' Priorités card): list of past months with a "PDF" download link each.

### 4.8 Paramètres (`/parametres`)

Existing CRUD forms/tables (categories, envelopes, income types, accounts, savings goals) move from `/plus/parametres` into the new shell unchanged in behavior — only the wrapping layout changes (content area instead of a mobile stacked page). No redesign of the forms themselves in this pass.

## 5. Data model addition

One extension to the original spec's `expense_entries` table: a nullable `pointed_at` (timestamp) column, set when the user toggles a fixed-charge entry as reconciled on the Comptes checklist, cleared if they un-toggle it. No other schema changes. Accounts remain manually-updated (`accounts.current_balance`); "Relier un compte" and the sync indicators are visual-only for this build, per product decision — real bank aggregation is out of scope, matching the original spec's out-of-scope list.

## 6. Component inventory

New, reusable across views (built on Nuxt UI primitives already in the project — `@nuxt/ui` — restyled with the project's Tailwind tokens, not hand-rolled from scratch):

- `AppSidebar`, `SidebarCeilingsWidget` — shell.
- `PageHeader` — title/contextual-controls/actions slot pattern, used by every page.
- `StatCard`, `DonutChart`, `EnvelopeCard` — dashboard.
- `DataTable` — sortable table wrapper around Nuxt UI's `UTable`, used by Enveloppes and Mouvements.
- `DetailDrawer` — right-side slide-over wrapper around Nuxt UI's `USlideover`, used by Enveloppes.
- `EntryPanel` — page-scoped panel hosting the existing entry-mode toggle and forms, replacing `EntrySheet`.
- `Badge`/`Pill` — status tags ("à décider", "dépassé", filter pills, month pill).
- `ArchiveList` — small side-card list pattern reused by Envies (Priorités) and Compte rendu (Archives).

Existing components kept as-is: `SegmentedToggle`, `PillSelector`, `NumericKeypad`, `useAmountInput`, `ExpenseForm`/`IncomeForm`/`TransferForm`.

## 7. Design tokens

The Figma file's variables confirm the current Tailwind theme (`app/assets/css`) already uses the same palette — no color rewrite, only additions to `@theme`:

- Primary purple `#6c5fa8` (buttons/active nav — new token, e.g. `--color-primary`).
- Additional greys for card borders/backgrounds beyond the current `divider`/`toggle-track` (`#e3ddef`, `#ece8f4` variants, `#f2eff8`).
- A corner-radius scale (4/5/8/14/16px) and font-size scale (11–25px) used consistently across cards, badges, and buttons — formalize as Tailwind spacing/radius tokens rather than one-off arbitrary values.

Existing tokens (`ink`, `app-bg`, `mint*`, `warn*`, `violet-bar`, `azure-bar`) are reused unchanged; they match the Figma variables exactly (e.g. `color/blue/26` = `#3a3450` = `--color-ink`).

## 8. Build order

1. **Shell**: sidebar, layout, new tokens, `PageHeader`, move Paramètres into the new shell.
2. **Mouvements** (reuses existing entry forms) + **Tableau de bord** (depends on Mouvements' data for "derniers mouvements").
3. **Enveloppes** (table + drawer).
4. **Épargne**, **Envies** — independent of each other, lower complexity, no schema changes.
5. **Comptes** (+ `pointed_at` migration).
6. **Compte rendu** (closure + archive) — depends on envelope/income/expense data being fully modeled, so it lands last, same as the original spec's ordering.

This is a starting point for `writing-plans` to refine into concrete milestones/tasks, not a hard commitment.

## 9. Testing

- Existing Vitest domain-logic tests are unaffected by this redesign.
- `tests/e2e/entry.spec.ts` currently drives the mobile `EntrySheet` bottom sheet — update it to drive `/mouvements`'s `EntryPanel` instead.
- New Playwright coverage: sidebar navigation between all 8 routes, the Enveloppes row → `DetailDrawer` interaction, and the Comptes fixed-charge pointing toggle.

## 10. Out of scope (this build)

- Real bank-account synchronization (§5) — visual-only for now.
- Any responsive/mobile layout — desktop-only going forward.
- PWA install-ability.
- Redesigning the Paramètres forms themselves (only their layout wrapper changes).
