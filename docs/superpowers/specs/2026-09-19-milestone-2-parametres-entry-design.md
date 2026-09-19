# Milestone 2: Paramètres & Unified Entry Screen — Design Spec

**Date**: 2026-09-19
**Parent spec**: `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md`
**Source material**: the Figma "Laura Budget" file, screens `2b`/`2c` (Saisie sortie/entrée), `4a` (Saisie transfert), `3e` (Paramètres), plus `2a` (Accueil, referenced here for the app shell/bottom nav it shares with this milestone).

## 1. Scope

Per the parent spec's §12 build order, this milestone covers:
- **Paramètres**: viewing and editing all reference-data lists (categories, envelopes, income types, accounts) that the rest of the app reads from.
- **The unified entry screen**: one screen with a Sortie / Entrée / Transfert toggle, replacing the two separately-requested tabs, per the parent spec's confirmed final decision.
- **The app shell**: bottom navigation and the floating "+" entry button, since the entry screen is reachable from every other screen.

Explicitly **not** in this milestone: the Accueil dashboard, Enveloppes tab, Épargne, Cadeaux, Comptes, Wishlist, or the closure/PDF-report flow — those are later milestones per the build order, once real entries exist to show.

## 2. What the Figma reveals beyond the parent spec

Pulling real design context (not just the textual "Final" answers page) surfaced UI mechanics the parent spec described functionally but not visually:

- **Custom numeric keypad.** Amount entry is not a native `<input type="number">` — it's a 4×3 grid of tappable digit buttons (`1`–`9`, `,`, `0`, `←` backspace) rendered above a sticky "Enregistrer" button. This needs its own component (`NumericKeypad.vue`) with its own input-buffer logic (append digit, handle the decimal comma, backspace, clamp to 2 decimal places).
- **Form rows are tap targets, not inline inputs.** Each field (Catégorie, Libellé, Date, Enveloppe associée) is a list row — a small icon swatch, a label, and the current value right-aligned — that presumably opens a picker/sheet on tap, not an inline text field. A generic `EntryFormRow.vue` component (icon + label + value + tap handler) covers all of these.
- **Pill selectors for finite choices.** "Financé par" (Budget du mois / Cadeau que j'offre / Argent de cadeau reçu) and the Paramètres lists are rounded pill buttons that fill solid (dark blue, `#3a3450`) when selected and sit on a light background (`#f7f4fb`) when not. One `PillSelector.vue` component (single-select, horizontal-wrap layout) covers both use cases.
- **The Sortie/Entrée/Transfert toggle** is a 2- or 3-way segmented control: a rounded lilac (`#ece8f4`) track containing pill(s), with the active segment filled dark blue. This is a small, reusable `SegmentedToggle.vue`.
- **Bottom navigation has 5 slots, not 4**: Accueil, Enveloppes, a raised circular **"+" floating action button** (opens the entry screen directly, not a "screen" of its own), Épargne, Plus. This corrects the parent spec's §3, which described 4 flat tabs.
- **The entry screen is presented as a modal/sheet** ("Annuler" top-left, "Nouvelle ligne" as the title, "Notice" top-right) — not a full page navigation. In Nuxt terms this is a full-screen overlay/slideover, not a route change, so the underlying screen stays mounted underneath.

## 3. Design tokens

Extracted directly from the Figma file's computed styles (not approximated):

| Token | Value | Usage |
|---|---|---|
| `blue-900` (primary text/ink) | `#3a3450` | Headings, primary text, selected pill fill, active nav icon |
| `blue-900/72%` | `rgba(58,52,80,0.72)` | Secondary/muted text |
| `blue-900/35%` | `rgba(58,52,80,0.35)` | Inactive nav icon outline |
| `lilac-bg` (app background) | `#f7f4fb` | Screen background, unselected pill background |
| `lilac-track` | `#ece8f4` | Segmented toggle track background |
| `white` | `#ffffff` | Card backgrounds |
| `divider` | `#f1eef6` | Hairline dividers between list rows |
| `spring-green-fill` | `#a8dcc4` | "New/positive" pill accent (e.g. Sport, Babysitting, Remboursement, Autre in Paramètres) |
| `spring-green-text` | `#2f5c48` | Text on spring-green pills; also the "épargne retirée" note text |
| `spring-green-bar` | `#7cc6a6` | Progress-bar fill (Envies bucket, in-budget variable charges) |
| `orange-warn-bg` | `#f7ddd2` | Zero-budget / warning pill background (e.g. Voyage) |
| `orange-warn-text` | `#b4553a` | Warning text (overspend amounts, "1 dépassement") |
| `orange-bar` | `#d3714f` | Progress-bar fill when a category is over budget |
| `violet-bar` | `#b19ee8` | Progress-bar fill (Besoins bucket) |
| `azure-bar` | `#86bde8` | Progress-bar fill (Épargne bucket) |
| Font | Plus Jakarta Sans (weights 400–800) | All UI text. Needs adding as a Google Font or self-hosted font, not currently in the project. |
| Card radius | 22–26px | Standard card corner radius |
| Sheet radius | 40px | Full entry-screen sheet corner radius |
| Pill radius | 999px (full) | All chip/pill/tag components |

These become Tailwind theme tokens (extending `@nuxt/ui`'s theme, not hardcoded hex values in components), so later milestones reuse the same palette automatically.

## 4. Data model additions/clarifications

The parent spec's schema (Milestone 1) already has every table this milestone needs. No new tables. Clarifications based on seeing the actual entry form:

- The expense form's "Enveloppe associée" defaults to "Aucune" (null) — confirms `envelope_id` is genuinely optional on `expense_entries`, matching the schema.
- The "Financé par" pill selector maps directly to the `financed_by` enum (`budget` / `gift_given` / `gift_received`); selecting `gift_received` shows the helper text "Imputé sur l'enveloppe Anniversaire et fêtes, hors budget" — meaning the UI must know which envelope is the reserve-kind one to reference it here (queried by `kind = 'reserve'`, not hardcoded by name, since Paramètres lets the name change).
- The transfer screen (`4a`) confirms: pick a from-envelope (shows its current ceiling, e.g. "60 → 40 €" after the amount is subtracted), pick a to-envelope (shows "110 → 130 €"), a reason field, and a "Portée: Ce mois seulement" label — consistent with the parent spec's assumption #1 that v1 only supports this-month-only transfers.

## 5. Screens & routes

- `/plus/parametres` — Paramètres screen. Lists categories, envelopes, income types, and accounts as editable chip lists (add/rename/archive), grouped in cards exactly as designed. Sort order and archival (not hard delete, per the schema's `archived_at` columns) are managed here.
- Entry screen — **not a route**, a global overlay component (`EntrySheet.vue`) triggered by the FAB, mountable from any page. Internally manages its own three-way state (Sortie/Entrée/Transfert) and renders the matching form.
- `app/layouts/default.vue` — the app shell: bottom nav bar + FAB, wrapping every authenticated page.

## 6. API routes (new, added to the Nitro server layer)

All routes call `requireUser()` first, per the Milestone 1 architecture. All routes validate their input with a Zod schema shared between client and server.

- `GET/POST /api/categories`, `PATCH /api/categories/:id` (rename/archive/reorder)
- `GET/POST /api/envelopes`, `PATCH /api/envelopes/:id`
- `GET/POST /api/income-types`, `PATCH /api/income-types/:id`
- `GET/POST /api/accounts`, `PATCH /api/accounts/:id`
- `POST /api/expenses` — creates an `expense_entries` row
- `POST /api/incomes` — creates an `income_entries` row
- `POST /api/transfers` — creates a `transfers` row (validates `from_envelope_id !== to_envelope_id` server-side, since the schema itself has no CHECK constraint for this per Milestone 1's parked minor finding)

No update/delete routes for expenses/incomes/transfers in this milestone — editing/deleting a past entry isn't in the Figma for this screen set and would need its own design decision (how does deleting affect an already-computed envelope balance); deferred until it's actually requested.

## 7. Testing strategy

- **Vitest**: the numeric keypad's input-buffer logic (digit entry, decimal handling, backspace, max-2-decimals clamping) as a pure composable (`useAmountInput.ts`), independent of any component — this is exactly the kind of logic worth unit-testing hard, matching Milestone 1's precedent.
- **Vitest**: Zod schema validation for each new API route's input (reject negative amounts, reject `from_envelope_id === to_envelope_id`, require `category_id`, etc.).
- **Playwright**: one end-to-end flow — log in, open the entry sheet via the FAB, record a Sortie, confirm it was saved (via a follow-up API check or a visible confirmation), and one for editing a Paramètres list (add a category, confirm it appears).

## 8. Assumptions flagged for confirmation

1. **Entry screen is a modal/overlay, not a route.** The Figma shows "Annuler" (cancel) rather than a back arrow, which reads as a sheet/modal pattern. If a real url-addressable route is preferred instead (e.g. for deep-linking or browser back-button behavior), that's a straightforward swap of `EntrySheet.vue` from an overlay to a `pages/saisie.vue` route — flagging now since it affects the component's structure.
2. **Paramètres editing is add/rename/archive only**, no hard delete and no reordering UI beyond what's trivial to add later — matches the spreadsheet's original behavior ("clic droit → insérer une ligne") loosely translated to "no destructive delete of historical data."
3. **Plus Jakarta Sans** needs to be added as a font dependency (Google Fonts via `@nuxt/fonts` or self-hosted) — not decided yet, defaulting to Google Fonts CDN unless you'd rather self-host for the PWA's offline-shell caching.
