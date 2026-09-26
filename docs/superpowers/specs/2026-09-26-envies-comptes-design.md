# Envies & Comptes — Design Spec

**Date:** 2026-09-26
**Parent spec:** `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md` (this implements its milestone 6)
**Figma:** `https://www.figma.com/design/E6CGJ59EuSDp5s0ovq1aXK/Laura-Budget` — Envies `22:4184`, Comptes `22:4396`

## 1. Goal

Build the two remaining small pages, `/envies` and `/comptes`. Both are already linked from
`app/components/AppSidebar.vue` and currently resolve to nothing, logging
`[Vue Router warn]: No match found` on every page load.

All the database tables these pages read already exist. The work is two new pages, two new
API surfaces, and two single-column migrations.

## 2. Scope decisions

The Figma mockups show more than the data model supports. These were decided before design:

| Figma shows | Decision | Why |
|---|---|---|
| Bank account linking, `synchronisé`, `Dernière synchro`, `Synchroniser` | **Out of scope.** No linking or sync UI appears on the page at all. | Real bank sync means a PSD2 provider, OAuth consent, webhooks and reconciliation — a larger project than all four remaining pages combined. The parent spec §8.2 describes a manual v1. |
| `À pointer` — bank movements reconciled against entries | **Out of scope.** | Depends on bank sync. |
| `Pointer les charges fixes` button | **Out of scope.** The tick state is still shown (see §4.4), but nothing creates entries. | Displaying derived state needs no schema; creating entries is a separate behaviour worth its own design. |
| `Prochaine échéance` — "Salaire attendu le 27 septembre, 2 300 € prévus" | **Deferred to `/epargne`.** | Needs the payroll tracking tables, which belong to that milestone. |
| Envies savings-goal progress bars, "dans 8 mois au rythme actuel" | **Deferred to `/epargne`.** | Needs savings goal contribution rates. |
| `Livret A` listed among accounts | **Stays on `/epargne`.** `/comptes` lists `accounts` only. | `livrets` is a separate table with its own contribution history. Showing it in both places would create two sources of truth for one balance. |

Size-bucket thresholds conflict between documents: the parent spec §4 says `< 50 / 50–150 / > 150`,
the Figma says `jusqu'à 50 € / 50 à 200 € / plus de 200 €`. **The Figma wins** — it is the newer
artefact and the one being implemented. This spec supersedes the parent on that point.

## 3. `/envies`

### 3.1 Schema change

Add one nullable column to `wishlist_items`:

```ts
envelopeId: uuid('envelope_id').references(() => envelopes.id),
```

Nullable because a wish need not be tied to an envelope. No other table changes.

Existing columns, unchanged: `id`, `label`, `price` (numeric 10,2), `productUrl`, `priority`
(`wishlist_priority` enum: `haute` | `moyenne` | `basse`), `note`, `purchasedAt`.

### 3.2 Domain logic (pure, unit-tested)

`server/utils/domain/wishlistBuckets.ts`

```ts
export type WishlistSize = 'petite' | 'moyenne' | 'grosse'

export function bucketForPrice(price: number): WishlistSize
```

- `price <= 50` → `petite`
- `50 < price <= 200` → `moyenne`
- `price > 200` → `grosse`

Boundaries are inclusive at the top of each bucket, matching the Figma's labels
("jusqu'à 50 €", "50 à 200 €", "plus de 200 €"). A 50 € item is `petite`; a 200 € item is
`moyenne`.

```ts
export interface WishlistSummaryInput {
  price: number
  priority: 'haute' | 'moyenne' | 'basse'
  purchasedAt: Date | string | null
}

export function summariseWishlist(items: WishlistSummaryInput[]): {
  count: number
  total: number
  byPriority: { haute: number, moyenne: number, basse: number }
}
```

`count` and `total` cover unpurchased items only (`purchasedAt === null`), so the header badge
reads "10 envies · 1 284 € au total" for outstanding wishes rather than lifetime history.
`byPriority` counts unpurchased items too, so the sidebar tallies agree with the badge.

### 3.3 Ordering

`wishlist_items` has no `created_at` or `sort_order`, so there is no implicit insertion order to
fall back on. Ordering is therefore defined explicitly and must be deterministic:

```ts
export function sortWishlist(
  items: T[],
  mode: 'priority' | 'price',
): T[]
```

- `priority` (the default): `haute` → `moyenne` → `basse`, then price descending, then label
  ascending.
- `price`: price descending, then label ascending.

The label tiebreak exists so two items with the same priority and price never swap places
between renders. Sorting applies **within** each size column; it never moves an item between
columns.

### 3.4 API

`GET /api/wishlist` — returns unpurchased items, each with its envelope resolved:

```ts
interface WishlistItemView {
  id: string
  label: string
  price: number
  productUrl: string | null
  priority: 'haute' | 'moyenne' | 'basse'
  note: string | null
  size: WishlistSize
  envelopeName: string | null
  envelopeEmoji: string | null
  envelopeRemaining: number | null   // from listBudgetEnvelopeLedgers for the current month
}
```

`envelopeRemaining` powers the card subtitle. It is `null` in two distinct cases, which the page
renders differently (§3.5): when `envelopeId` is null, and when the linked envelope is a reserve
— reserves have a running balance rather than a monthly ceiling remainder, so
`listBudgetEnvelopeLedgers` returns nothing for them.

Read path uses the Supabase Data API with an embed on `envelopes`, consistent with
`server/utils/movementsQuery.ts`. Envelope remaining amounts come from the existing
`listBudgetEnvelopeLedgers(year, month)`.

`POST /api/wishlist` — creates an item. Body validated by `shared/schemas/wishlist.ts`:

```ts
export const wishlistInputSchema = z.object({
  label: z.string().min(1),
  price: z.coerce.number().positive(),
  priority: z.enum(['haute', 'moyenne', 'basse']),
  productUrl: z.string().url().nullable().optional(),
  note: z.string().nullable().optional(),
  envelopeId: z.string().uuid().nullable().optional(),
})
```

`PATCH /api/wishlist/[id]` — partial update, plus `purchasedAt` to mark an item bought:

```ts
export const wishlistPatchSchema = wishlistInputSchema.partial().extend({
  purchasedAt: z.coerce.date().nullable().optional(),
})
```

Both write endpoints follow the existing pattern in `server/api/accounts/index.post.ts`:
`requireUser` → `validateBody` → `insertRow`/`patchRow` from `server/utils/referenceCrud.ts`.

### 3.5 Page

`app/pages/envies.vue`, following `app/pages/enveloppes.vue`: `useFetch` with an **explicit
`key`**, error branch rendered when the fetch fails.

- Header: title `Envies`, badge `{count} envies · {total} € au total`, `Trier par priorité`
  toggle, `+ Nouvelle envie` button.
- Three columns — `Petites` (jusqu'à 50 €), `Moyennes` (50 à 200 €), `Grosses` (plus de 200 €).
- Card: priority dot (`haute` red, `moyenne` orange, `basse` green), label, price right-aligned,
  and a subtitle line. The subtitle has three forms:
  - envelope with a remaining amount → `{envelopeEmoji} {envelopeName} · {remaining} restants ce mois`
  - envelope but `envelopeRemaining === null` (a reserve) → `{envelopeEmoji} {envelopeName}` alone
  - no envelope → no subtitle line at all
- `Trier par priorité` toggles between the two orders in §3.3. Priority order is the default,
  matching the mockup, where each column runs haute → moyenne → basse.
- Sidebar widget: counts per priority, from `summariseWishlist().byPriority`.
- Creating an item opens a form; on success the list refetches.

## 4. `/comptes`

### 4.1 Schema change

Add one column to `accounts`:

```ts
kind: accountKindEnum('kind').notNull().default('courant'),
```

with a new enum in `drizzle/schema/enums.ts`:

```ts
export const accountKindEnum = pgEnum('account_kind', ['courant', 'epargne'])
```

The Figma's `Solde bancaire` card is labelled "compte courant seul" and excludes savings
vehicles; without this column that distinction cannot be expressed. Defaulting to `courant`
leaves every existing row behaving as a spending account.

`shared/schemas/account.ts` gains `kind: z.enum(['courant', 'epargne']).optional()` on both the
input and patch schemas, so Paramètres can set it.

### 4.2 Domain logic (pure, unit-tested)

`server/utils/domain/accountsOverview.ts`

```ts
export function computeAccountTotals(input: {
  accounts: { balance: number, kind: 'courant' | 'epargne' }[]
  budgetEnvelopeRemaining: number[]
  reserveBalances: number[]
}): { bankBalance: number, committed: number, reallyFree: number }
```

- `bankBalance` = sum of balances where `kind === 'courant'`
- `committed` = sum of positive `budgetEnvelopeRemaining` + sum of `reserveBalances`
- `reallyFree` = `bankBalance - committed`

Negative envelope remainders (overspent envelopes) are floored at 0 for `committed`: an
overspent envelope has no money set aside for it, so it must not *increase* what looks free.
Verified against the mockup: 1 216 − 119 = 1 097, with 119 = 31 (ceilings) + 88 (cadeaux reserve).

```ts
export function summariseFixedCharges(input: {
  fixedCategories: { id: string, name: string, defaultTarget: number | null }[]
  expensesThisMonth: { categoryId: string }[]
}): {
  lines: { id: string, name: string, amount: number, isSettled: boolean }[]
  total: number
  settledCount: number
  totalCount: number
}
```

`fixedCategories` is every row in `categories` where `is_fixed` is true and `archived_at` is
null, ordered by `sort_order`. `expensesThisMonth` is every `expense_entries` row for the
current `year_assigned`/`month_assigned`.

`amount` is the category's `defaultTarget` (0 when null). `isSettled` is **derived**: true when
at least one expense entry exists this month for that category. Nothing stores a "pointée" flag.
`total` sums `amount` across all lines, settled or not, so the figure is the month's expected
fixed cost rather than what has been paid so far.
Verified against the mockup: 620+41+32+26+75+38+29 = 861 €, "7 sur 7 pointées".

### 4.3 API

`GET /api/accounts/overview` — one endpoint composing the whole page, rather than a request per
widget:

```ts
interface AccountsOverview {
  bankBalance: number
  committed: number
  reallyFree: number
  accounts: { id: string, name: string, emoji: string, balance: number, kind: 'courant' | 'epargne' }[]
  fixedCharges: {
    lines: { id: string, name: string, amount: number, isSettled: boolean }[]
    total: number
    settledCount: number
    totalCount: number
  }
  variableSpend: { id: string, name: string, spent: number, ceiling: number }[]
}
```

`variableSpend` reuses `listBudgetEnvelopeLedgers`, mapping `netSpent`/`ceiling` per budget
envelope. Reads go through the Data API where they are new, and reuse the existing ledger
queries where those already exist.

### 4.4 Page

`app/pages/comptes.vue`.

- Three KPI cards: `Solde bancaire` (sub-label "compte courant seul"), `Engagé par les
  enveloppes`, `Vraiment libre`.
- `Comptes` list: emoji, name, balance. No linking, sync status or "Relier un compte" control.
- `Charges fixes du mois`: two-column checklist, each line prefixed `✓` when `isSettled`, with
  the header showing `{total} € · {settledCount} sur {totalCount} pointées`. The tick is
  read-only.
- `Dépenses variables`: a bar per budget envelope, `spent` over `ceiling`.

## 5. Error handling

Both pages follow the pattern already used by `app/pages/enveloppes.vue` and
`app/components/entry/EntryPanel.vue`: `useFetch` with an explicit `key`, and a visible error
branch when the request fails. Never render an empty list in place of a failed request — an
empty `/envies` and a broken `/envies` must not look identical.

Server-side, a failed Data API request throws rather than returning partial data, matching
`assertOk` in `server/utils/movementsQuery.ts`.

## 6. Testing

**Unit (vitest)** — the pure domain functions, which is where the real logic lives:
- `bucketForPrice`: boundary cases at exactly 50 and exactly 200.
- `summariseWishlist`: excludes purchased items from count and total; priority tallies.
- `computeAccountTotals`: the mockup's arithmetic (1216/119/1097); `epargne` accounts excluded
  from `bankBalance`; an overspent envelope floored at 0 rather than inflating `reallyFree`.
- `summariseFixedCharges`: `isSettled` true only with a matching expense this month; null
  `defaultTarget` counted as 0.

**Query modules** — mocked Supabase client, as in
`tests/unit/server/utils/movementsQuery.test.ts`: correct filters, embeds resolved, a failed
request throwing rather than returning `[]`.

**E2E (Playwright)** — one spec per page: signed in, the page renders with real data and
survives a reload. Reload matters: it is where the pool-exhaustion bug used to surface.

## 7. Out of scope

Bank linking and synchronisation; transaction reconciliation (`À pointer`); the `Pointer les
charges fixes` action; `Prochaine échéance`; savings-goal progress and affordability
projections on envies; livrets anywhere on `/comptes`; editing accounts from `/comptes`
(Paramètres already owns account CRUD).
