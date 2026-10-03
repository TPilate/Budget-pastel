# Follow-ups after the Envies & Comptes milestone

> **Updated 2026-10-03** after the dashboard milestone. Item 5 is partly addressed —
> `app/utils/currency.ts` now demonstrates the shared-module pattern, and the dashboard
> keeps its arithmetic server-side rather than reimplementing it in the page. Items 1
> and 2 (RLS) are untouched and remain the highest-value work here.

Recorded 2026-09-27, at the end of `docs/superpowers/plans/2026-09-26-envies-comptes.md`.
Everything here was found during execution or by the final whole-branch review. None
of it blocked the merge; all of it is worth deciding on deliberately rather than
rediscovering later.

## 1. RLS is invisible to Drizzle's snapshots — highest value

Row Level Security was enabled by hand-written SQL in
`drizzle/migrations/0002_enable_rls.sql`, never declared in the Drizzle schema. As a
result every table in `drizzle/migrations/meta/0003_snapshot.json` records
`isRLSEnabled: false`, including the ones that are locked down in the live database.

`drizzle-kit generate` does not manage RLS, so this is harmless today. **`drizzle-kit
push` is a different matter**: it reconciles the database to the schema's view of the
world, and the schema believes RLS is off. That is a plausible path to silently
dropping every policy on a database that is exposed to the public internet through
Supabase's Data API.

Fix: declare the policies in the Drizzle schema so the snapshots and the database
agree. Until then, do not run `drizzle-kit push` against this project.

## 2. RLS does not protect writes

Reads go through the per-user Supabase client and are RLS-scoped. Writes go through
`insertRow`/`patchRow` on the Drizzle pool, which connects as the `postgres` table
owner and therefore **bypasses RLS entirely**. Write authorisation rests solely on
`requireUser` in each endpoint.

This is pre-existing and shared with the accounts, categories and envelopes
endpoints; this milestone widened the surface by one table (`wishlist_items`). Every
write endpoint does call `requireUser`, so writes are not unprotected — but RLS is
not a second layer for them. `server/api/wishlist/[id].patch.ts` takes an id straight
from the URL with no ownership check, which is fine in a single-household app and
would not be in a multi-user one.

## 3. `accounts.current_balance` and `accounts.kind` cannot be set

Both columns exist and both are unreachable from the product. `accountInputSchema`
accepts `name`, `emoji` and `kind`, but `app/pages/parametres.vue` posts only
`{name, emoji}`, and nothing anywhere sends `currentBalance`.

Consequences:
- `/comptes` shows `Solde bancaire 0 €`. The page now detects this and shows
  `solde à renseigner` instead of a misleading negative `Vraiment libre`, but the
  underlying figure stays 0 until balances can be entered.
- `kind` always defaults to `courant`. The day balances do exist, a Livret would be
  counted as spending money, because nothing can mark it `epargne`.

The decision to make is a product one: manual balance entry in Paramètres, or wait
for bank synchronisation to populate it. The spec (§4.1) justified `kind` with "so
Paramètres can set it" — that justification is currently unmet.

## 4. `/envies` is append-only

`GET /api/wishlist` filters `purchased_at IS NULL`, and the page has no UI to mark an
item bought, edit it, or delete it. The `PATCH /api/wishlist/[id]` endpoint exists and
supports both editing and un-purchasing, but has **no callers**. The list therefore
only ever grows. This matches the spec (§3.5) but is worth closing.

## 5. The tested wishlist logic is not the shipped wishlist logic

`summariseWishlist` and `sortWishlist` in `server/utils/domain/wishlist.ts` have no
production caller. `app/pages/envies.vue` reimplements both, because `app/` cannot
import from `server/utils/`. The unit tests cover only the unused server copies, so
the two can drift while the suite stays green.

`app/utils/currency.ts` now demonstrates the pattern that would fix this: Nuxt 4
auto-imports `app/utils/`, and both the page and the server could share a module
placed there or in `shared/`. Note that `bucketForPrice` does *not* have this problem
— the page consumes the server-computed `size` field rather than recomputing it.

## 6. Smaller items

- The sign-prefix logic (`-62,40 €` / `+62,40 €`) is still duplicated verbatim in
  `app/pages/mouvements.vue` and `app/pages/enveloppes.vue`. A `formatSignedEuro` in
  `app/utils/currency.ts` would finish the extraction started this milestone.
- `useFetch` key `envelope-ceilings` is shared by `app/pages/enveloppes.vue` (typed
  `BudgetEnvelopeLedger[]`) and by `SidebarCeilingsWidget.vue` / `EntryPanel.vue`
  (typed `EnvelopeCeiling[]`). One cache entry, two TypeScript shapes — the narrower
  type misrepresents what is cached.
- `productUrl` and `note` are fetched and typed on `/envies` but never rendered.
- `tests/unit/server/utils/accountsOverviewQuery.test.ts` does not assert the
  `archived_at` filter on the fixed-category lookup, so archived fixed charges could
  reappear with the suite green.
- `/epargne` and `/compte-rendu` remain unbuilt and still log Vue Router warnings.
  They are milestones 4 and 5 of the parent spec.
