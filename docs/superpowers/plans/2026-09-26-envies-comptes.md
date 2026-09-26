# Envies & Comptes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/envies` and `/comptes` pages so both sidebar links resolve, replacing the `[Vue Router warn]: No match found` they currently produce.

**Architecture:** Pure domain functions hold all the arithmetic and are unit-tested in isolation; thin query modules read through the Supabase Data API (PostgREST) and reuse the existing envelope-ledger queries; Nuxt pages fetch one endpoint each and render. Two single-column migrations add `wishlist_items.envelope_id` and `accounts.kind`.

**Tech Stack:** Nuxt 4, Vue 3.5 `<script setup>`, Drizzle ORM + Drizzle Kit (schema & migrations), `@supabase/ssr` (Data API reads), Zod (request validation), Vitest (unit), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-09-26-envies-comptes-design.md`

## Global Constraints

- Size buckets are `price <= 50` → `petite`, `50 < price <= 200` → `moyenne`, `price > 200` → `grosse`. The Figma thresholds win over the parent spec's 150.
- `Solde bancaire` counts accounts with `kind === 'courant'` only.
- `Engagé par les enveloppes` = sum of budget-envelope `remaining` **floored at 0 each** + sum of reserve balances. An overspent envelope must never increase `Vraiment libre`.
- `Vraiment libre` = `bankBalance - committed`.
- "Pointée" is derived, never stored: a fixed charge is settled when ≥1 expense entry exists this month for its category.
- New server reads go through the Supabase Data API (`createSupabaseServerClient`), never `server/utils/db.ts` directly. Existing pool-backed helpers (`listBudgetEnvelopeLedgers`, `listReserveEnvelopeBalances`) are reused as-is.
- A failed Data API request throws; it never degrades to `[]`. Pattern: `assertOk` in `server/utils/movementsQuery.ts`.
- Pages use `useFetch` with an **explicit `key`** and render a visible error branch. An empty list and a failed request must not look identical.
- Currency is formatted French-style: `62,40 €` (comma decimal, space before €). Helper `euro()` as in `app/pages/enveloppes.vue:35`.
- Out of scope, and no UI may hint at it: bank linking/sync, `À pointer`, the `Pointer les charges fixes` action, `Prochaine échéance`, savings-goal projections, livrets on `/comptes`.

---

## File Structure

**Created:**
- `server/utils/domain/wishlist.ts` — pure bucket/summary/sort logic
- `server/utils/domain/accountsOverview.ts` — pure KPI + fixed-charge logic
- `server/utils/wishlistQuery.ts` — Data API read for wishlist
- `server/utils/accountsOverviewQuery.ts` — Data API read + ledger reuse for `/comptes`
- `shared/schemas/wishlist.ts` — Zod input/patch schemas
- `server/api/wishlist/index.get.ts`, `index.post.ts`, `[id].patch.ts`
- `server/api/accounts/overview.get.ts`
- `app/pages/envies.vue`, `app/pages/comptes.vue`
- Tests mirroring each of the above

**Modified:**
- `drizzle/schema/wishlist.ts` — add `envelopeId`
- `drizzle/schema/reference.ts` — add `kind` to `accounts`
- `drizzle/schema/enums.ts` — add `accountKindEnum`
- `shared/schemas/account.ts` — accept `kind`

---

### Task 1: Schema and migration for both new columns

**Files:**
- Modify: `drizzle/schema/enums.ts`
- Modify: `drizzle/schema/wishlist.ts`
- Modify: `drizzle/schema/reference.ts:38-45`
- Modify: `shared/schemas/account.ts`
- Test: `tests/unit/drizzle-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `wishlistItems.envelopeId` (nullable uuid FK → `envelopes.id`); `accounts.kind` (`'courant' | 'epargne'`, NOT NULL default `'courant'`); `accountKindEnum`; `accountInputSchema` accepting optional `kind`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/drizzle-schema.test.ts`:

```ts
import { wishlistItems, accounts } from '../../drizzle/schema'

describe('milestone 6 schema additions', () => {
  it('links a wishlist item to the envelope that would fund it', () => {
    expect(wishlistItems.envelopeId).toBeDefined()
    expect(wishlistItems.envelopeId.notNull).toBe(false)
  })

  it('distinguishes spending accounts from savings accounts', () => {
    // 'Solde bancaire' is labelled "compte courant seul" in the design, so the
    // KPI needs a way to exclude savings vehicles.
    expect(accounts.kind).toBeDefined()
    expect(accounts.kind.notNull).toBe(true)
    expect(accounts.kind.enumValues).toEqual(['courant', 'epargne'])
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/drizzle-schema.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'notNull')`, because neither column exists.

- [ ] **Step 3: Add the enum**

In `drizzle/schema/enums.ts`, append:

```ts
export const accountKindEnum = pgEnum('account_kind', ['courant', 'epargne'])
```

- [ ] **Step 4: Add the two columns**

In `drizzle/schema/wishlist.ts`, import `envelopes` and add the column to `wishlistItems`:

```ts
import { envelopes } from './reference'
```

```ts
  envelopeId: uuid('envelope_id').references(() => envelopes.id),
```

In `drizzle/schema/reference.ts`, import `accountKindEnum` alongside the other enum imports and add to the `accounts` table:

```ts
  kind: accountKindEnum('kind').notNull().default('courant'),
```

- [ ] **Step 5: Let Paramètres set the kind**

Replace the body of `shared/schemas/account.ts`:

```ts
import { z } from 'zod'

export const accountInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  kind: z.enum(['courant', 'epargne']).optional(),
})

export const accountPatchSchema = accountInputSchema.partial().extend({
  archivedAt: z.coerce.date().nullable().optional(),
})

export type AccountInput = z.infer<typeof accountInputSchema>
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx vitest run tests/unit/drizzle-schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Generate and apply the migration**

```bash
set -a && . ./.env && set +a
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: a new `drizzle/migrations/0003_*.sql` containing `CREATE TYPE "account_kind"`, `ALTER TABLE "accounts" ADD COLUMN "kind"`, and `ALTER TABLE "wishlist_items" ADD COLUMN "envelope_id"`. Both tables already have RLS enabled with an `authenticated` policy (migration `0002_enable_rls.sql`); adding columns does not change that, so no policy work is needed.

- [ ] **Step 8: Verify the columns landed**

```bash
set -a && . ./.env && set +a
TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SEED_USER_EMAIL\",\"password\":\"$SEED_USER_PASSWORD\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")
curl -s -G "$SUPABASE_URL/rest/v1/accounts" --data-urlencode "select=id,name,kind" --data-urlencode "limit=2" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN"
```

Expected: HTTP 200 with every existing row showing `"kind":"courant"`.

- [ ] **Step 9: Commit**

```bash
git add drizzle/ shared/schemas/account.ts tests/unit/drizzle-schema.test.ts
git commit -m "feat: add wishlist envelope link and account kind"
```

---

### Task 2: Wishlist domain logic

**Files:**
- Create: `server/utils/domain/wishlist.ts`
- Test: `tests/unit/server/utils/domain/wishlist.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type WishlistSize = 'petite' | 'moyenne' | 'grosse'`
  - `bucketForPrice(price: number): WishlistSize`
  - `interface WishlistSummaryInput { price: number, priority: WishlistPriority, purchasedAt: Date | string | null }`
  - `type WishlistPriority = 'haute' | 'moyenne' | 'basse'`
  - `summariseWishlist(items: WishlistSummaryInput[]): { count: number, total: number, byPriority: Record<WishlistPriority, number> }`
  - `sortWishlist<T extends { price: number, priority: WishlistPriority, label: string }>(items: T[], mode: 'priority' | 'price'): T[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/utils/domain/wishlist.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { bucketForPrice, summariseWishlist, sortWishlist } from '../../../../../server/utils/domain/wishlist'

describe('bucketForPrice', () => {
  it('puts a 50 € item in petites, not moyennes', () => {
    // The Figma labels the columns "jusqu'à 50 €" and "50 à 200 €", so the
    // boundary belongs to the lower bucket.
    expect(bucketForPrice(50)).toBe('petite')
  })

  it('puts a 200 € item in moyennes, not grosses', () => {
    // "50 à 200 €" vs "plus de 200 €".
    expect(bucketForPrice(200)).toBe('moyenne')
  })

  it('buckets values inside each range', () => {
    expect(bucketForPrice(16)).toBe('petite')
    expect(bucketForPrice(120)).toBe('moyenne')
    expect(bucketForPrice(1100)).toBe('grosse')
  })
})

describe('summariseWishlist', () => {
  it('counts and totals only unpurchased items', () => {
    const result = summariseWishlist([
      { price: 28, priority: 'moyenne', purchasedAt: null },
      { price: 22, priority: 'basse', purchasedAt: null },
      // Already bought: must not inflate the header badge.
      { price: 999, priority: 'haute', purchasedAt: '2026-09-01T00:00:00Z' },
    ])
    expect(result.count).toBe(2)
    expect(result.total).toBe(50)
  })

  it('tallies priorities across unpurchased items only', () => {
    const result = summariseWishlist([
      { price: 10, priority: 'haute', purchasedAt: null },
      { price: 10, priority: 'haute', purchasedAt: null },
      { price: 10, priority: 'moyenne', purchasedAt: null },
      { price: 10, priority: 'basse', purchasedAt: new Date('2026-09-01') },
    ])
    expect(result.byPriority).toEqual({ haute: 2, moyenne: 1, basse: 0 })
  })

  it('returns zeroes for an empty list', () => {
    expect(summariseWishlist([])).toEqual({
      count: 0, total: 0, byPriority: { haute: 0, moyenne: 0, basse: 0 },
    })
  })
})

describe('sortWishlist', () => {
  const items = [
    { label: 'Sac de sport', price: 75, priority: 'moyenne' as const },
    { label: 'Bottines', price: 120, priority: 'haute' as const },
    { label: 'Diffuseur', price: 59, priority: 'moyenne' as const },
    { label: 'Cours de poterie', price: 180, priority: 'haute' as const },
  ]

  it('orders by priority, then price descending', () => {
    expect(sortWishlist(items, 'priority').map((i) => i.label))
      .toEqual(['Cours de poterie', 'Bottines', 'Sac de sport', 'Diffuseur'])
  })

  it('orders by price descending when asked', () => {
    expect(sortWishlist(items, 'price').map((i) => i.label))
      .toEqual(['Cours de poterie', 'Bottines', 'Sac de sport', 'Diffuseur'])
  })

  it('breaks ties on label so order never wobbles between renders', () => {
    // wishlist_items has no created_at and no sort_order, so without an
    // explicit tiebreak two identical items could swap places on each fetch.
    const tied = [
      { label: 'Zebre', price: 40, priority: 'basse' as const },
      { label: 'Abricot', price: 40, priority: 'basse' as const },
    ]
    expect(sortWishlist(tied, 'priority').map((i) => i.label)).toEqual(['Abricot', 'Zebre'])
    expect(sortWishlist(tied, 'price').map((i) => i.label)).toEqual(['Abricot', 'Zebre'])
  })

  it('does not mutate the input array', () => {
    const original = [...items]
    sortWishlist(items, 'price')
    expect(items).toEqual(original)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/server/utils/domain/wishlist.test.ts`
Expected: FAIL — cannot resolve `../../../../../server/utils/domain/wishlist`.

- [ ] **Step 3: Write the implementation**

Create `server/utils/domain/wishlist.ts`:

```ts
export type WishlistSize = 'petite' | 'moyenne' | 'grosse'
export type WishlistPriority = 'haute' | 'moyenne' | 'basse'

// Thresholds come from the Figma column headers ("jusqu'à 50 €", "50 à 200 €",
// "plus de 200 €"), which supersede the parent spec's 150 € boundary.
export function bucketForPrice(price: number): WishlistSize {
  if (price <= 50) return 'petite'
  if (price <= 200) return 'moyenne'
  return 'grosse'
}

export interface WishlistSummaryInput {
  price: number
  priority: WishlistPriority
  purchasedAt: Date | string | null
}

export function summariseWishlist(items: WishlistSummaryInput[]): {
  count: number
  total: number
  byPriority: Record<WishlistPriority, number>
} {
  // The header badge and the sidebar tallies describe outstanding wishes, so a
  // purchased item must not count towards either.
  const outstanding = items.filter((item) => item.purchasedAt === null)

  const byPriority: Record<WishlistPriority, number> = { haute: 0, moyenne: 0, basse: 0 }
  for (const item of outstanding) byPriority[item.priority] += 1

  return {
    count: outstanding.length,
    total: outstanding.reduce((sum, item) => sum + item.price, 0),
    byPriority,
  }
}

const PRIORITY_RANK: Record<WishlistPriority, number> = { haute: 0, moyenne: 1, basse: 2 }

export function sortWishlist<T extends { price: number, priority: WishlistPriority, label: string }>(
  items: T[],
  mode: 'priority' | 'price',
): T[] {
  // Sorting a copy: callers render the source array and must not see it reordered
  // underneath them.
  return [...items].sort((a, b) => {
    if (mode === 'priority') {
      const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (rank !== 0) return rank
    }
    if (a.price !== b.price) return b.price - a.price
    // wishlist_items carries no created_at or sort_order, so without this the
    // order of equal items is whatever the database happened to return.
    return a.label.localeCompare(b.label, 'fr')
  })
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/server/utils/domain/wishlist.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add server/utils/domain/wishlist.ts tests/unit/server/utils/domain/wishlist.test.ts
git commit -m "feat: add wishlist bucketing, summary and ordering logic"
```

---

### Task 3: Wishlist query module and API endpoints

**Files:**
- Create: `server/utils/wishlistQuery.ts`
- Create: `shared/schemas/wishlist.ts`
- Create: `server/api/wishlist/index.get.ts`, `server/api/wishlist/index.post.ts`, `server/api/wishlist/[id].patch.ts`
- Test: `tests/unit/server/utils/wishlistQuery.test.ts`

**Interfaces:**
- Consumes: `bucketForPrice`, `WishlistSize`, `WishlistPriority` from `server/utils/domain/wishlist`; `listBudgetEnvelopeLedgers(year, month)` from `server/utils/envelopeCeilingsQuery`; `createSupabaseServerClient` from `server/utils/supabase`.
- Produces: `fetchWishlist(event: H3Event, year: number, month: number): Promise<WishlistItemView[]>` and the `WishlistItemView` interface; `wishlistInputSchema`, `wishlistPatchSchema`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/utils/wishlistQuery.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Same stub shape as tests/unit/server/utils/movementsQuery.test.ts: the builder
// stays chainable and awaitable at each step, as PostgREST's does.
const mocks = vi.hoisted(() => {
  let response: { data: any[] | null, error: any } = { data: [], error: null }
  const calls = { select: '', is: [] as [string, unknown][], abortSignals: [] as AbortSignal[] }

  const makeClient = () => ({
    from: () => {
      const builder: any = {
        select: (columns: string) => { calls.select = columns; return builder },
        is: (column: string, value: unknown) => { calls.is.push([column, value]); return builder },
        abortSignal: (signal: AbortSignal) => { calls.abortSignals.push(signal); return builder },
        then: (ok: any, err: any) => Promise.resolve(response).then(ok, err),
      }
      return builder
    },
  })

  return {
    makeClient, calls,
    setResponse: (r: { data: any[] | null, error: any }) => { response = r },
  }
})

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => mocks.makeClient(),
}))

const ledgerMock = vi.hoisted(() => vi.fn())
vi.mock('../../../../server/utils/envelopeCeilingsQuery', () => ({
  listBudgetEnvelopeLedgers: ledgerMock,
}))

import { fetchWishlist } from '../../../../server/utils/wishlistQuery'

function fakeEvent() {
  return { context: {} } as any
}

describe('fetchWishlist', () => {
  beforeEach(() => {
    mocks.setResponse({ data: [], error: null })
    mocks.calls.select = ''
    mocks.calls.is = []
    mocks.calls.abortSignals = []
    ledgerMock.mockReset()
    ledgerMock.mockResolvedValue([])
  })

  it('returns only unpurchased items, sized, with the envelope resolved', async () => {
    mocks.setResponse({
      data: [{
        id: 'w1',
        label: 'Bottines d\'hiver',
        price: 120,
        product_url: null,
        priority: 'haute',
        note: null,
        purchased_at: null,
        envelopes: { id: 'e1', name: 'Mode', emoji: '👗' },
      }],
      error: null,
    })
    ledgerMock.mockResolvedValue([
      { id: 'e1', name: 'Mode', emoji: '👗', showOnHome: true, ceiling: 100, netSpent: 131, remaining: -31, subtitle: null },
    ])

    const [item] = await fetchWishlist(fakeEvent(), 2026, 9)

    expect(item).toMatchObject({
      id: 'w1',
      price: 120,
      size: 'moyenne',
      envelopeName: 'Mode',
      envelopeEmoji: '👗',
      envelopeRemaining: -31,
    })
    // Purchased items are excluded at the database, not in JS.
    expect(mocks.calls.is).toContainEqual(['purchased_at', null])
  })

  it('leaves envelope fields null when an item has no envelope', async () => {
    mocks.setResponse({
      data: [{
        id: 'w2', label: 'Vernis', price: 16, product_url: null,
        priority: 'basse', note: null, purchased_at: null, envelopes: null,
      }],
      error: null,
    })

    const [item] = await fetchWishlist(fakeEvent(), 2026, 9)

    expect(item).toMatchObject({
      size: 'petite', envelopeName: null, envelopeEmoji: null, envelopeRemaining: null,
    })
  })

  it('reports a linked reserve envelope by name but with no remaining amount', async () => {
    // Reserve envelopes carry a running balance, not a monthly ceiling remainder,
    // so listBudgetEnvelopeLedgers never returns them.
    mocks.setResponse({
      data: [{
        id: 'w3', label: 'Cadeau', price: 40, product_url: null,
        priority: 'moyenne', note: null, purchased_at: null,
        envelopes: { id: 'reserve-1', name: 'Anniversaire et fêtes', emoji: '🎂' },
      }],
      error: null,
    })
    ledgerMock.mockResolvedValue([])

    const [item] = await fetchWishlist(fakeEvent(), 2026, 9)

    expect(item.envelopeName).toBe('Anniversaire et fêtes')
    expect(item.envelopeRemaining).toBeNull()
  })

  it('asks PostgREST to embed the envelope rather than fetching envelopes separately', async () => {
    await fetchWishlist(fakeEvent(), 2026, 9)
    expect(mocks.calls.select).toContain('envelopes(')
  })

  it('bounds the request with an abort signal', async () => {
    await fetchWishlist(fakeEvent(), 2026, 9)
    expect(mocks.calls.abortSignals).toHaveLength(1)
    expect(mocks.calls.abortSignals[0]).toBeInstanceOf(AbortSignal)
  })

  it('throws rather than returning an empty list when the request fails', async () => {
    // An empty array would read as "no wishes yet" and hide an RLS problem.
    mocks.setResponse({ data: null, error: { message: 'permission denied for table wishlist_items' } })
    await expect(fetchWishlist(fakeEvent(), 2026, 9)).rejects.toThrow(/wishlist_items/)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/server/utils/wishlistQuery.test.ts`
Expected: FAIL — cannot resolve `../../../../server/utils/wishlistQuery`.

- [ ] **Step 3: Write the query module**

Create `server/utils/wishlistQuery.ts`:

```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { bucketForPrice } from './domain/wishlist'
import type { WishlistSize, WishlistPriority } from './domain/wishlist'

// wishlist_items has exactly one foreign key to envelopes, so the embed is
// unambiguous and needs no disambiguation hint.
const WISHLIST_SELECT
  = 'id,label,price,product_url,priority,note,purchased_at,'
  + 'envelopes(id,name,emoji)'

// Node's fetch has no default timeout; without this a stalled request would hang
// the handler.
const REQUEST_TIMEOUT_MS = 10000

export interface WishlistItemView {
  id: string
  label: string
  price: number
  productUrl: string | null
  priority: WishlistPriority
  note: string | null
  size: WishlistSize
  envelopeName: string | null
  envelopeEmoji: string | null
  envelopeRemaining: number | null
}

interface EmbeddedEnvelope { id: string, name: string, emoji: string }

function unwrap(embed: EmbeddedEnvelope | EmbeddedEnvelope[] | null | undefined): EmbeddedEnvelope | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

export async function fetchWishlist(event: H3Event, year: number, month: number): Promise<WishlistItemView[]> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  const [itemsRes, ledgers] = await Promise.all([
    supabase.from('wishlist_items').select(WISHLIST_SELECT).is('purchased_at', null).abortSignal(signal),
    listBudgetEnvelopeLedgers(year, month),
  ])

  if (itemsRes.error) {
    // Never degrade to []: that would read as "no wishes yet" and mask an RLS or
    // schema problem.
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load wishlist',
      message: `wishlist: wishlist_items request failed: ${itemsRes.error.message}`,
    })
  }

  const remainingByEnvelopeId = new Map(ledgers.map((ledger) => [ledger.id, ledger.remaining]))

  return (itemsRes.data ?? []).map((row: any) => {
    const envelope = unwrap(row.envelopes)
    const price = Number(row.price)
    return {
      id: row.id,
      label: row.label,
      price,
      productUrl: row.product_url ?? null,
      priority: row.priority,
      note: row.note ?? null,
      size: bucketForPrice(price),
      envelopeName: envelope?.name ?? null,
      envelopeEmoji: envelope?.emoji ?? null,
      // Absent for reserve envelopes, which have a balance rather than a ceiling.
      envelopeRemaining: envelope ? remainingByEnvelopeId.get(envelope.id) ?? null : null,
    }
  })
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/server/utils/wishlistQuery.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the validation schemas**

Create `shared/schemas/wishlist.ts`:

```ts
import { z } from 'zod'

export const wishlistInputSchema = z.object({
  label: z.string().min(1),
  price: z.coerce.number().positive(),
  priority: z.enum(['haute', 'moyenne', 'basse']),
  productUrl: z.string().url().nullable().optional(),
  note: z.string().nullable().optional(),
  envelopeId: z.string().uuid().nullable().optional(),
})

export const wishlistPatchSchema = wishlistInputSchema.partial().extend({
  purchasedAt: z.coerce.date().nullable().optional(),
})

export type WishlistInput = z.infer<typeof wishlistInputSchema>
```

- [ ] **Step 6: Add the three endpoints**

Create `server/api/wishlist/index.get.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { fetchWishlist } from '../../utils/wishlistQuery'

export default defineEventHandler(async (event) => {
  // The read runs as the signed-in user, so RLS scopes the rows. requireUser
  // turns "no session" into a 401 rather than an empty list.
  await requireUser(event)
  const now = new Date()
  return fetchWishlist(event, now.getFullYear(), now.getMonth() + 1)
})
```

Create `server/api/wishlist/index.post.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { wishlistItems } from '../../../drizzle/schema'
import { wishlistInputSchema } from '../../../shared/schemas/wishlist'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, wishlistInputSchema)
  return insertRow(wishlistItems, input)
})
```

Create `server/api/wishlist/[id].patch.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { wishlistItems } from '../../../drizzle/schema'
import { wishlistPatchSchema } from '../../../shared/schemas/wishlist'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing wishlist item id' })
  }

  const input = await validateBody(event, wishlistPatchSchema)
  return patchRow(wishlistItems, id, input)
})
```

- [ ] **Step 7: Run the whole suite and build**

Run: `npx vitest run && npm run build`
Expected: all tests pass; build completes.

- [ ] **Step 8: Commit**

```bash
git add server/utils/wishlistQuery.ts shared/schemas/wishlist.ts server/api/wishlist/ tests/unit/server/utils/wishlistQuery.test.ts
git commit -m "feat: add wishlist read and write endpoints"
```

---

### Task 4: The /envies page

**Files:**
- Create: `app/pages/envies.vue`
- Modify: `app/assets/css/main.css` (one new `--color-accent-bar` token)
- Test: `tests/e2e/envies.spec.ts`

**Interfaces:**
- Consumes: `GET /api/wishlist` returning `WishlistItemView[]`; `POST /api/wishlist`; `PageHeader` (`app/components/PageHeader.vue`, props `{ title: string }`, slots `context` and `actions`).
- Produces: the route `/envies`.

- [ ] **Step 1: Write the failing E2E test**

Create `tests/e2e/envies.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const email = process.env.SEED_USER_EMAIL
const password = process.env.SEED_USER_PASSWORD
const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(async ({ page }) => {
  test.skip(!email || !password || !hasRealSupabaseConfig, 'Requires a real Supabase project and seed user')
  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')
})

test('renders the three size columns and survives a reload', async ({ page }) => {
  await page.goto('/envies')

  await expect(page.getByRole('heading', { name: 'Envies' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Petites')).toBeVisible()
  await expect(page.getByText('Moyennes')).toBeVisible()
  await expect(page.getByText('Grosses')).toBeVisible()

  // The priority tally from the design, rendered on the page rather than in the
  // shared sidebar.
  await expect(page.getByText('Priorités')).toBeVisible()

  // The reload is the regression guard: it is where pool exhaustion used to surface.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Envies' })).toBeVisible({ timeout: 15_000 })
})

test('serves the wishlist endpoint to a signed-in session', async ({ page }) => {
  const response = await page.request.get('/api/wishlist')
  expect(response.status()).toBe(200)
  expect(Array.isArray(await response.json())).toBe(true)
})

test('does not reach the wishlist endpoint without a session', async ({ browser }) => {
  const fresh = await browser.newContext()
  const response = await fresh.request.get('http://localhost:3000/api/wishlist')
  expect(response.status()).toBe(401)
  await fresh.close()
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `set -a && . ./.env && set +a && npx playwright test tests/e2e/envies.spec.ts --reporter=line`
Expected: FAIL — `/envies` does not resolve, so the heading never appears.

- [ ] **Step 3: Add the one missing design token**

The palette in `app/assets/css/main.css` has `--color-warn-bar` (#d3714f, red) and
`--color-mint-bar` (#7cc6a6, green) but no orange, and the design uses three distinct priority
colours. Add one token alongside the existing `--color-*-bar` entries:

```css
  --color-accent-bar: #e2a05a;
```

Do not reach for stock Tailwind colours here. `app/pages/enveloppes.vue` and
`app/pages/mouvements.vue` use project tokens exclusively; only `app/pages/login.vue`, which
predates the design system, uses `red-*`/`gray-*`.

- [ ] **Step 4: Write the page**

Create `app/pages/envies.vue`:

```vue
<script setup lang="ts">
type WishlistPriority = 'haute' | 'moyenne' | 'basse'
type WishlistSize = 'petite' | 'moyenne' | 'grosse'

interface WishlistItemView {
  id: string
  label: string
  price: number
  productUrl: string | null
  priority: WishlistPriority
  note: string | null
  size: WishlistSize
  envelopeName: string | null
  envelopeEmoji: string | null
  envelopeRemaining: number | null
}

const { data: items, error, refresh } = await useFetch<WishlistItemView[]>('/api/wishlist', {
  key: 'wishlist',
  default: () => [],
})

const sortMode = ref<'priority' | 'price'>('priority')

const PRIORITY_RANK: Record<WishlistPriority, number> = { haute: 0, moyenne: 1, basse: 2 }

// Mirrors sortWishlist in server/utils/domain/wishlist.ts: the label tiebreak keeps
// equal items from swapping places between renders.
function sorted(list: WishlistItemView[]) {
  return [...list].sort((a, b) => {
    if (sortMode.value === 'priority') {
      const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (rank !== 0) return rank
    }
    if (a.price !== b.price) return b.price - a.price
    return a.label.localeCompare(b.label, 'fr')
  })
}

const columns = computed(() => ([
  { size: 'petite' as const, title: 'Petites', hint: "jusqu'à 50 €" },
  { size: 'moyenne' as const, title: 'Moyennes', hint: '50 à 200 €' },
  { size: 'grosse' as const, title: 'Grosses', hint: 'plus de 200 €' },
]).map((column) => ({
  ...column,
  items: sorted((items.value ?? []).filter((item) => item.size === column.size)),
})))

const summary = computed(() => {
  const list = items.value ?? []
  const byPriority: Record<WishlistPriority, number> = { haute: 0, moyenne: 0, basse: 0 }
  for (const item of list) byPriority[item.priority] += 1
  return {
    count: list.length,
    total: list.reduce((sum, item) => sum + item.price, 0),
    byPriority,
  }
})

function euro(value: number) {
  return `${value.toFixed(2).replace('.', ',')} €`
}

function euroShort(value: number) {
  return `${Math.round(value)} €`
}

const PRIORITY_DOT: Record<WishlistPriority, string> = {
  haute: 'bg-warn-bar',
  moyenne: 'bg-accent-bar',
  basse: 'bg-mint-bar',
}

function subtitle(item: WishlistItemView) {
  if (!item.envelopeName) return null
  const label = `${item.envelopeEmoji ?? ''} ${item.envelopeName}`.trim()
  if (item.envelopeRemaining === null) return label
  if (item.envelopeRemaining < 0) {
    return `${label} · enveloppe déjà dépassée de ${euroShort(Math.abs(item.envelopeRemaining))}`
  }
  return `${label} · ${euroShort(item.envelopeRemaining)} restants ce mois`
}

const isCreating = ref(false)
const newLabel = ref('')
const newPrice = ref('')
const newPriority = ref<WishlistPriority>('moyenne')
const createError = ref('')

async function createItem() {
  createError.value = ''
  try {
    await $fetch('/api/wishlist', {
      method: 'POST',
      body: { label: newLabel.value, price: newPrice.value, priority: newPriority.value },
    })
    newLabel.value = ''
    newPrice.value = ''
    isCreating.value = false
    await refresh()
  } catch {
    createError.value = "Impossible d'ajouter cette envie."
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Envies">
      <template #context>
        <span class="rounded-full bg-app-bg px-3 py-1 text-[12.5px] font-semibold text-ink-muted">
          {{ summary.count }} envies · {{ euro(summary.total) }} au total
        </span>
      </template>
      <template #actions>
        <button
          type="button"
          class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink"
          @click="sortMode = sortMode === 'priority' ? 'price' : 'priority'"
        >
          {{ sortMode === 'priority' ? 'Trier par prix' : 'Trier par priorité' }}
        </button>
        <button
          type="button"
          class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink"
          @click="isCreating = !isCreating"
        >
          + Nouvelle envie
        </button>
      </template>
    </PageHeader>

    <p v-if="error" class="rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink">
      Impossible de charger les envies. Réessayez dans un instant.
    </p>

    <template v-else>
      <!-- The design places this tally in the app sidebar, but AppSidebar renders
           SidebarCeilingsWidget unconditionally and knows nothing about the current
           route. Making it route-aware is a larger change than this page warrants, so
           the counts live on the page instead. -->
      <div class="flex items-center gap-4 rounded-[14px] border border-divider bg-white px-4 py-2.5">
        <span class="text-[11.5px] font-extrabold uppercase tracking-wide text-ink-faint">Priorités</span>
        <span class="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          <span class="h-2 w-2 rounded-full bg-warn-bar" /> Haute {{ summary.byPriority.haute }}
        </span>
        <span class="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          <span class="h-2 w-2 rounded-full bg-accent-bar" /> Moyenne {{ summary.byPriority.moyenne }}
        </span>
        <span class="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          <span class="h-2 w-2 rounded-full bg-mint-bar" /> Basse {{ summary.byPriority.basse }}
        </span>
      </div>

      <form
        v-if="isCreating"
        class="flex flex-wrap items-end gap-3 rounded-[14px] border border-divider bg-white p-4"
        @submit.prevent="createItem"
      >
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-muted">
          Envie
          <input v-model="newLabel" required class="rounded-lg border border-divider px-3 py-2 text-ink">
        </label>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-muted">
          Prix
          <input v-model="newPrice" required inputmode="decimal" class="w-28 rounded-lg border border-divider px-3 py-2 text-ink">
        </label>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-muted">
          Priorité
          <select v-model="newPriority" class="rounded-lg border border-divider px-3 py-2 text-ink">
            <option value="haute">Haute</option>
            <option value="moyenne">Moyenne</option>
            <option value="basse">Basse</option>
          </select>
        </label>
        <button type="submit" class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink">
          Ajouter
        </button>
        <p v-if="createError" class="w-full text-[12.5px] font-semibold text-warn-ink">{{ createError }}</p>
      </form>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section v-for="column in columns" :key="column.size" class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between border-b border-divider pb-3">
            <h2 class="text-[13.5px] font-extrabold text-ink">{{ column.title }}</h2>
            <span class="text-[11.5px] font-semibold text-ink-faint">{{ column.hint }}</span>
          </header>

          <p v-if="!column.items.length" class="pt-4 text-[12.5px] text-ink-faint">Aucune envie ici.</p>

          <ul v-else class="flex flex-col">
            <li v-for="item in column.items" :key="item.id" class="border-b border-divider py-3 last:border-0">
              <div class="flex items-center justify-between gap-3">
                <span class="flex items-center gap-2 text-[13px] font-bold text-ink">
                  <span class="h-2 w-2 shrink-0 rounded-full" :class="PRIORITY_DOT[item.priority]" />
                  {{ item.label }}
                </span>
                <span class="shrink-0 text-[13px] font-bold text-ink">{{ euroShort(item.price) }}</span>
              </div>
              <p v-if="subtitle(item)" class="pl-4 pt-1 text-[11.5px] font-semibold text-ink-faint">
                {{ subtitle(item) }}
              </p>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 5: Run the E2E test and watch it pass**

Run: `set -a && . ./.env && set +a && npx playwright test tests/e2e/envies.spec.ts --reporter=line`
Expected: PASS, 3 tests.

- [ ] **Step 6: Confirm the router warning is gone**

Run: `set -a && . ./.env && set +a && npx playwright test tests/e2e/envies.spec.ts --reporter=line 2>&1 | grep "No match found for location with path \"/envies\"" || echo "no warning for /envies"`
Expected: `no warning for /envies`.

- [ ] **Step 7: Commit**

```bash
git add app/assets/css/main.css app/pages/envies.vue tests/e2e/envies.spec.ts
git commit -m "feat: add the Envies page"
```

---

### Task 5: Accounts overview domain logic

**Files:**
- Create: `server/utils/domain/accountsOverview.ts`
- Test: `tests/unit/server/utils/domain/accountsOverview.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `computeAccountTotals(input: { accounts: { balance: number, kind: 'courant' | 'epargne' }[], budgetEnvelopeRemaining: number[], reserveBalances: number[] }): { bankBalance: number, committed: number, reallyFree: number }`
  - `summariseFixedCharges(input: { fixedCategories: { id: string, name: string, defaultTarget: number | null }[], expensesThisMonth: { categoryId: string }[] }): { lines: { id: string, name: string, amount: number, isSettled: boolean }[], total: number, settledCount: number, totalCount: number }`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/utils/domain/accountsOverview.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeAccountTotals, summariseFixedCharges } from '../../../../../server/utils/domain/accountsOverview'

describe('computeAccountTotals', () => {
  it('reproduces the figures from the design', () => {
    // Figma: Solde bancaire 1 216 €, Engagé 119 € ("31 € de plafonds + 88 € de
    // cadeaux"), Vraiment libre 1 097 €.
    const result = computeAccountTotals({
      accounts: [{ balance: 1216, kind: 'courant' }],
      budgetEnvelopeRemaining: [31],
      reserveBalances: [88],
    })
    expect(result).toEqual({ bankBalance: 1216, committed: 119, reallyFree: 1097 })
  })

  it('excludes savings accounts from the bank balance', () => {
    // The card is labelled "compte courant seul".
    const result = computeAccountTotals({
      accounts: [
        { balance: 1216, kind: 'courant' },
        { balance: 7524, kind: 'epargne' },
      ],
      budgetEnvelopeRemaining: [],
      reserveBalances: [],
    })
    expect(result.bankBalance).toBe(1216)
  })

  it('floors an overspent envelope at zero instead of freeing money', () => {
    // An overspent envelope has nothing set aside for it. Summing -50 would make
    // committed smaller and reallyFree larger, which is exactly backwards.
    const result = computeAccountTotals({
      accounts: [{ balance: 1000, kind: 'courant' }],
      budgetEnvelopeRemaining: [100, -50],
      reserveBalances: [],
    })
    expect(result.committed).toBe(100)
    expect(result.reallyFree).toBe(900)
  })

  it('can report a negative free amount when envelopes commit more than the balance', () => {
    const result = computeAccountTotals({
      accounts: [{ balance: 100, kind: 'courant' }],
      budgetEnvelopeRemaining: [300],
      reserveBalances: [],
    })
    expect(result.reallyFree).toBe(-200)
  })

  it('returns zeroes when there are no accounts at all', () => {
    const result = computeAccountTotals({ accounts: [], budgetEnvelopeRemaining: [], reserveBalances: [] })
    expect(result).toEqual({ bankBalance: 0, committed: 0, reallyFree: 0 })
  })
})

describe('summariseFixedCharges', () => {
  it('reproduces the totals from the design', () => {
    // Figma: "861 € · 7 sur 7 pointées".
    const fixedCategories = [
      { id: 'c1', name: 'Loyer', defaultTarget: 620 },
      { id: 'c2', name: 'MACSF — assurance pro', defaultTarget: 41 },
      { id: 'c3', name: 'Internet', defaultTarget: 32 },
      { id: 'c4', name: 'Abonnements', defaultTarget: 26 },
      { id: 'c5', name: 'Transport', defaultTarget: 75 },
      { id: 'c6', name: 'Mutuelle', defaultTarget: 38 },
      { id: 'c7', name: 'Téléphone', defaultTarget: 29 },
    ]
    const result = summariseFixedCharges({
      fixedCategories,
      expensesThisMonth: fixedCategories.map((category) => ({ categoryId: category.id })),
    })
    expect(result.total).toBe(861)
    expect(result.settledCount).toBe(7)
    expect(result.totalCount).toBe(7)
  })

  it('marks a charge settled only when an expense exists for it this month', () => {
    const result = summariseFixedCharges({
      fixedCategories: [
        { id: 'c1', name: 'Loyer', defaultTarget: 620 },
        { id: 'c2', name: 'Internet', defaultTarget: 32 },
      ],
      expensesThisMonth: [{ categoryId: 'c1' }],
    })
    expect(result.lines).toEqual([
      { id: 'c1', name: 'Loyer', amount: 620, isSettled: true },
      { id: 'c2', name: 'Internet', amount: 32, isSettled: false },
    ])
    expect(result.settledCount).toBe(1)
  })

  it('counts several expenses in one category as a single settled charge', () => {
    const result = summariseFixedCharges({
      fixedCategories: [{ id: 'c1', name: 'Loyer', defaultTarget: 620 }],
      expensesThisMonth: [{ categoryId: 'c1' }, { categoryId: 'c1' }],
    })
    expect(result.settledCount).toBe(1)
  })

  it('treats a missing default target as zero without dropping the line', () => {
    const result = summariseFixedCharges({
      fixedCategories: [{ id: 'c1', name: 'Divers', defaultTarget: null }],
      expensesThisMonth: [],
    })
    expect(result.lines).toEqual([{ id: 'c1', name: 'Divers', amount: 0, isSettled: false }])
    expect(result.total).toBe(0)
    expect(result.totalCount).toBe(1)
  })

  it('totals what is expected for the month, not what has been paid', () => {
    const result = summariseFixedCharges({
      fixedCategories: [
        { id: 'c1', name: 'Loyer', defaultTarget: 620 },
        { id: 'c2', name: 'Internet', defaultTarget: 32 },
      ],
      expensesThisMonth: [],
    })
    expect(result.total).toBe(652)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/server/utils/domain/accountsOverview.test.ts`
Expected: FAIL — cannot resolve `../../../../../server/utils/domain/accountsOverview`.

- [ ] **Step 3: Write the implementation**

Create `server/utils/domain/accountsOverview.ts`:

```ts
export type AccountKind = 'courant' | 'epargne'

export function computeAccountTotals(input: {
  accounts: { balance: number, kind: AccountKind }[]
  budgetEnvelopeRemaining: number[]
  reserveBalances: number[]
}): { bankBalance: number, committed: number, reallyFree: number } {
  // "Solde bancaire" is labelled "compte courant seul" in the design: savings
  // vehicles are money you have, but not money you are about to spend.
  const bankBalance = input.accounts
    .filter((account) => account.kind === 'courant')
    .reduce((sum, account) => sum + account.balance, 0)

  // An overspent envelope has nothing set aside for it. Letting a negative
  // remainder through would shrink `committed` and inflate `reallyFree`.
  const ceilingsCommitted = input.budgetEnvelopeRemaining
    .reduce((sum, remaining) => sum + Math.max(0, remaining), 0)

  const reservesCommitted = input.reserveBalances.reduce((sum, balance) => sum + balance, 0)
  const committed = ceilingsCommitted + reservesCommitted

  return { bankBalance, committed, reallyFree: bankBalance - committed }
}

export function summariseFixedCharges(input: {
  fixedCategories: { id: string, name: string, defaultTarget: number | null }[]
  expensesThisMonth: { categoryId: string }[]
}): {
  lines: { id: string, name: string, amount: number, isSettled: boolean }[]
  total: number
  settledCount: number
  totalCount: number
} {
  // "Pointée" is derived rather than stored: a fixed charge counts as settled once
  // an expense exists for its category this month. A Set collapses repeats, so two
  // expenses in one category are still one settled charge.
  const categoriesWithExpense = new Set(input.expensesThisMonth.map((expense) => expense.categoryId))

  const lines = input.fixedCategories.map((category) => ({
    id: category.id,
    name: category.name,
    amount: category.defaultTarget ?? 0,
    isSettled: categoriesWithExpense.has(category.id),
  }))

  return {
    lines,
    // The month's expected fixed cost, settled or not — not what has been paid.
    total: lines.reduce((sum, line) => sum + line.amount, 0),
    settledCount: lines.filter((line) => line.isSettled).length,
    totalCount: lines.length,
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/server/utils/domain/accountsOverview.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add server/utils/domain/accountsOverview.ts tests/unit/server/utils/domain/accountsOverview.test.ts
git commit -m "feat: add accounts overview totals and fixed-charge logic"
```

---

### Task 6: Accounts overview query and endpoint

**Files:**
- Create: `server/utils/accountsOverviewQuery.ts`
- Create: `server/api/accounts/overview.get.ts`
- Test: `tests/unit/server/utils/accountsOverviewQuery.test.ts`

**Interfaces:**
- Consumes: `computeAccountTotals`, `summariseFixedCharges` from `server/utils/domain/accountsOverview`; `listBudgetEnvelopeLedgers(year, month)` from `server/utils/envelopeCeilingsQuery`; `listReserveEnvelopeBalances()` from `server/utils/reserveEnvelopeQuery`; `createSupabaseServerClient`.
- Produces: `fetchAccountsOverview(event: H3Event, year: number, month: number): Promise<AccountsOverview>` and the `AccountsOverview` interface.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/utils/accountsOverviewQuery.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const responseByTable: Record<string, { data: any[] | null, error: any }> = {
    accounts: { data: [], error: null },
    categories: { data: [], error: null },
    expense_entries: { data: [], error: null },
  }
  const eqCalls: Record<string, [string, unknown][]> = {}

  const makeClient = () => ({
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          (eqCalls[table] ??= []).push([column, value])
          return builder
        },
        is: () => builder,
        order: () => builder,
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve(responseByTable[table]).then(ok, err),
      }
      return builder
    },
  })

  return { responseByTable, eqCalls, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => mocks.makeClient(),
}))

const ledgerMock = vi.hoisted(() => vi.fn())
const reserveMock = vi.hoisted(() => vi.fn())
vi.mock('../../../../server/utils/envelopeCeilingsQuery', () => ({ listBudgetEnvelopeLedgers: ledgerMock }))
vi.mock('../../../../server/utils/reserveEnvelopeQuery', () => ({ listReserveEnvelopeBalances: reserveMock }))

import { fetchAccountsOverview } from '../../../../server/utils/accountsOverviewQuery'

function fakeEvent() {
  return { context: {} } as any
}

describe('fetchAccountsOverview', () => {
  beforeEach(() => {
    mocks.responseByTable.accounts = { data: [], error: null }
    mocks.responseByTable.categories = { data: [], error: null }
    mocks.responseByTable.expense_entries = { data: [], error: null }
    for (const key of Object.keys(mocks.eqCalls)) delete mocks.eqCalls[key]
    ledgerMock.mockReset().mockResolvedValue([])
    reserveMock.mockReset().mockResolvedValue([])
  })

  it('composes the three KPIs from accounts, ceilings and reserves', async () => {
    mocks.responseByTable.accounts = {
      data: [
        { id: 'a1', name: 'Compte courant', emoji: '💳', current_balance: '1216.00', kind: 'courant' },
        { id: 'a2', name: 'Livret A', emoji: '🌳', current_balance: '7524.00', kind: 'epargne' },
      ],
      error: null,
    }
    ledgerMock.mockResolvedValue([
      { id: 'e1', name: 'Courses', emoji: '🛒', showOnHome: true, ceiling: 320, netSpent: 289, remaining: 31, subtitle: null },
    ])
    reserveMock.mockResolvedValue([
      { id: 'r1', name: 'Anniversaire et fêtes', emoji: '🎂', balance: 88, incomeCreditsTotal: 88, expensesTotal: 0 },
    ])

    const overview = await fetchAccountsOverview(fakeEvent(), 2026, 9)

    expect(overview.bankBalance).toBe(1216)
    expect(overview.committed).toBe(119)
    expect(overview.reallyFree).toBe(1097)
    expect(overview.accounts).toHaveLength(2)
  })

  it('derives fixed-charge tick state from this month\'s expenses', async () => {
    mocks.responseByTable.categories = {
      data: [
        { id: 'c1', name: 'Loyer', default_target: '620.00' },
        { id: 'c2', name: 'Internet', default_target: '32.00' },
      ],
      error: null,
    }
    mocks.responseByTable.expense_entries = { data: [{ category_id: 'c1' }], error: null }

    const overview = await fetchAccountsOverview(fakeEvent(), 2026, 9)

    expect(overview.fixedCharges.total).toBe(652)
    expect(overview.fixedCharges.settledCount).toBe(1)
    expect(overview.fixedCharges.lines.find((l) => l.id === 'c1')?.isSettled).toBe(true)
    expect(overview.fixedCharges.lines.find((l) => l.id === 'c2')?.isSettled).toBe(false)
  })

  it('scopes the expense lookup to the requested month', async () => {
    await fetchAccountsOverview(fakeEvent(), 2026, 9)
    expect(mocks.eqCalls.expense_entries).toEqual([
      ['year_assigned', 2026], ['month_assigned', 9],
    ])
  })

  it('asks the database for fixed categories only', async () => {
    await fetchAccountsOverview(fakeEvent(), 2026, 9)
    expect(mocks.eqCalls.categories).toContainEqual(['is_fixed', true])
  })

  it('maps variable spend from the budget envelope ledgers', async () => {
    ledgerMock.mockResolvedValue([
      { id: 'e1', name: 'Courses', emoji: '🛒', showOnHome: true, ceiling: 320, netSpent: 238, remaining: 82, subtitle: null },
    ])

    const overview = await fetchAccountsOverview(fakeEvent(), 2026, 9)

    expect(overview.variableSpend).toEqual([{ id: 'e1', name: 'Courses', spent: 238, ceiling: 320 }])
  })

  it('throws rather than returning a partial overview when a request fails', async () => {
    mocks.responseByTable.accounts = { data: null, error: { message: 'permission denied for table accounts' } }
    await expect(fetchAccountsOverview(fakeEvent(), 2026, 9)).rejects.toThrow(/accounts/)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/server/utils/accountsOverviewQuery.test.ts`
Expected: FAIL — cannot resolve `../../../../server/utils/accountsOverviewQuery`.

- [ ] **Step 3: Write the query module**

Create `server/utils/accountsOverviewQuery.ts`:

```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { listReserveEnvelopeBalances } from './reserveEnvelopeQuery'
import { computeAccountTotals, summariseFixedCharges } from './domain/accountsOverview'
import type { AccountKind } from './domain/accountsOverview'

const REQUEST_TIMEOUT_MS = 10000

export interface AccountsOverview {
  bankBalance: number
  committed: number
  reallyFree: number
  accounts: { id: string, name: string, emoji: string, balance: number, kind: AccountKind }[]
  fixedCharges: {
    lines: { id: string, name: string, amount: number, isSettled: boolean }[]
    total: number
    settledCount: number
    totalCount: number
  }
  variableSpend: { id: string, name: string, spent: number, ceiling: number }[]
}

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load accounts overview',
    message: `accounts overview: ${table} request failed: ${error.message}`,
  })
}

export async function fetchAccountsOverview(
  event: H3Event,
  year: number,
  month: number,
): Promise<AccountsOverview> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  // New reads go through the Data API; the two envelope helpers already exist and
  // are reused rather than reimplemented.
  const [accountsRes, categoriesRes, expensesRes, ledgers, reserves] = await Promise.all([
    supabase.from('accounts').select('id,name,emoji,current_balance,kind')
      .is('archived_at', null).order('sort_order').abortSignal(signal),
    supabase.from('categories').select('id,name,default_target')
      .eq('is_fixed', true).is('archived_at', null).order('sort_order').abortSignal(signal),
    supabase.from('expense_entries').select('category_id')
      .eq('year_assigned', year).eq('month_assigned', month).abortSignal(signal),
    listBudgetEnvelopeLedgers(year, month),
    listReserveEnvelopeBalances(),
  ])

  assertOk('accounts', accountsRes.error)
  assertOk('categories', categoriesRes.error)
  assertOk('expense_entries', expensesRes.error)

  const accounts = (accountsRes.data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    balance: Number(row.current_balance),
    kind: row.kind as AccountKind,
  }))

  const totals = computeAccountTotals({
    accounts: accounts.map((account) => ({ balance: account.balance, kind: account.kind })),
    budgetEnvelopeRemaining: ledgers.map((ledger) => ledger.remaining),
    reserveBalances: reserves.map((reserve) => reserve.balance),
  })

  const fixedCharges = summariseFixedCharges({
    fixedCategories: (categoriesRes.data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      defaultTarget: row.default_target === null ? null : Number(row.default_target),
    })),
    expensesThisMonth: (expensesRes.data ?? []).map((row: any) => ({ categoryId: row.category_id })),
  })

  return {
    ...totals,
    accounts,
    fixedCharges,
    variableSpend: ledgers.map((ledger) => ({
      id: ledger.id,
      name: ledger.name,
      spent: ledger.netSpent,
      ceiling: ledger.ceiling,
    })),
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/server/utils/accountsOverviewQuery.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the endpoint**

Create `server/api/accounts/overview.get.ts`:

```ts
import { requireUser } from '../../utils/auth'
import { fetchAccountsOverview } from '../../utils/accountsOverviewQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return fetchAccountsOverview(event, now.getFullYear(), now.getMonth() + 1)
})
```

- [ ] **Step 6: Run the whole suite and build**

Run: `npx vitest run && npm run build`
Expected: all tests pass; build completes. Nitro must route `/api/accounts/overview` without colliding with the existing `server/api/accounts/index.get.ts`.

- [ ] **Step 7: Commit**

```bash
git add server/utils/accountsOverviewQuery.ts server/api/accounts/overview.get.ts tests/unit/server/utils/accountsOverviewQuery.test.ts
git commit -m "feat: add the accounts overview endpoint"
```

---

### Task 7: The /comptes page

**Files:**
- Create: `app/pages/comptes.vue`
- Test: `tests/e2e/comptes.spec.ts`

**Interfaces:**
- Consumes: `GET /api/accounts/overview` returning `AccountsOverview`; `PageHeader`.
- Produces: the route `/comptes`.

- [ ] **Step 1: Write the failing E2E test**

Create `tests/e2e/comptes.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const email = process.env.SEED_USER_EMAIL
const password = process.env.SEED_USER_PASSWORD
const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(async ({ page }) => {
  test.skip(!email || !password || !hasRealSupabaseConfig, 'Requires a real Supabase project and seed user')
  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')
})

test('renders the three KPI cards and survives a reload', async ({ page }) => {
  await page.goto('/comptes')

  await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Solde bancaire')).toBeVisible()
  await expect(page.getByText('Engagé par les enveloppes')).toBeVisible()
  await expect(page.getByText('Vraiment libre')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible({ timeout: 15_000 })
})

test('serves a coherent overview to a signed-in session', async ({ page }) => {
  const response = await page.request.get('/api/accounts/overview')
  expect(response.status()).toBe(200)

  const overview = await response.json()
  // The whole point of the three cards: free money is what is left after commitments.
  expect(overview.reallyFree).toBeCloseTo(overview.bankBalance - overview.committed, 2)
  expect(overview.fixedCharges.settledCount).toBeLessThanOrEqual(overview.fixedCharges.totalCount)
})

test('shows no bank-linking or synchronisation affordance', async ({ page }) => {
  await page.goto('/comptes')
  await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible({ timeout: 15_000 })

  // Bank sync is explicitly out of scope; the page must not imply it exists.
  await expect(page.getByText('Relier un compte')).toHaveCount(0)
  await expect(page.getByText('Synchroniser')).toHaveCount(0)
  await expect(page.getByText('À pointer')).toHaveCount(0)
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `set -a && . ./.env && set +a && npx playwright test tests/e2e/comptes.spec.ts --reporter=line`
Expected: FAIL — `/comptes` does not resolve.

- [ ] **Step 3: Write the page**

Create `app/pages/comptes.vue`:

```vue
<script setup lang="ts">
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

const { data: overview, error } = await useFetch<AccountsOverview>('/api/accounts/overview', {
  key: 'accounts-overview',
})

const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const now = new Date()
const currentMonthLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`

function euro(value: number) {
  return `${value.toFixed(2).replace('.', ',')} €`
}

function euroShort(value: number) {
  return `${Math.round(value)} €`
}

const variableTotals = computed(() => {
  const rows = overview.value?.variableSpend ?? []
  return {
    spent: rows.reduce((sum, row) => sum + row.spent, 0),
    ceiling: rows.reduce((sum, row) => sum + row.ceiling, 0),
  }
})

function percent(spent: number, ceiling: number) {
  return ceiling > 0 ? Math.min(100, Math.max(0, Math.round((spent / ceiling) * 100))) : 0
}

// The fixed-charge checklist is rendered in two columns, as in the design.
const fixedColumns = computed(() => {
  const lines = overview.value?.fixedCharges.lines ?? []
  const half = Math.ceil(lines.length / 2)
  return [lines.slice(0, half), lines.slice(half)]
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Comptes">
      <template #context>
        <span class="text-[12.5px] font-semibold text-ink-muted">{{ currentMonthLabel }}</span>
      </template>
      <template #actions>
        <NuxtLink to="/parametres" class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink">
          Modifier les comptes
        </NuxtLink>
      </template>
    </PageHeader>

    <p v-if="error" class="rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink">
      Impossible de charger les comptes. Réessayez dans un instant.
    </p>

    <div v-else-if="overview" class="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="rounded-[18px] border border-divider bg-white p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Solde bancaire</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ euroShort(overview.bankBalance) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">compte courant seul</p>
          </div>
          <div class="rounded-[18px] border border-divider bg-white p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Engagé par les enveloppes</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ euroShort(overview.committed) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">plafonds restants et réserves</p>
          </div>
          <div class="rounded-[18px] border border-divider bg-app-bg p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Vraiment libre</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ euroShort(overview.reallyFree) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">solde moins engagements</p>
          </div>
        </div>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Comptes</h2>
          <p v-if="!overview.accounts.length" class="pt-3 text-[12.5px] text-ink-faint">
            Aucun compte. Ajoutez-en depuis les Paramètres.
          </p>
          <ul v-else class="flex flex-col pt-2">
            <li v-for="account in overview.accounts" :key="account.id" class="flex items-center justify-between border-b border-divider py-3 last:border-0">
              <span class="flex items-center gap-2 text-[13px] font-bold text-ink">
                <span>{{ account.emoji }}</span>
                {{ account.name }}
              </span>
              <span class="text-[13px] font-bold text-ink">{{ euro(account.balance) }}</span>
            </li>
          </ul>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between">
            <h2 class="text-[13.5px] font-extrabold text-ink">Charges fixes du mois</h2>
            <span class="text-[11.5px] font-semibold text-ink-faint">
              {{ euroShort(overview.fixedCharges.total) }} · {{ overview.fixedCharges.settledCount }} sur {{ overview.fixedCharges.totalCount }} pointées
            </span>
          </header>
          <p v-if="!overview.fixedCharges.totalCount" class="pt-3 text-[12.5px] text-ink-faint">
            Aucune charge fixe configurée.
          </p>
          <div v-else class="grid grid-cols-1 gap-x-8 pt-3 sm:grid-cols-2">
            <ul v-for="(column, index) in fixedColumns" :key="index" class="flex flex-col">
              <li v-for="line in column" :key="line.id" class="flex items-center justify-between py-1.5 text-[12.5px]">
                <span :class="line.isSettled ? 'font-semibold text-ink' : 'text-ink-faint'">
                  {{ line.isSettled ? '✓' : '○' }} {{ line.name }}
                </span>
                <span class="font-semibold text-ink">{{ euro(line.amount) }}</span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <section class="rounded-[18px] border border-divider bg-white p-5">
        <header class="flex items-baseline justify-between">
          <h2 class="text-[13.5px] font-extrabold text-ink">Dépenses variables</h2>
        </header>
        <p class="pt-1 text-2xl font-extrabold text-ink">
          {{ euroShort(variableTotals.spent) }}
          <span class="text-[11.5px] font-semibold text-ink-faint">sur {{ euroShort(variableTotals.ceiling) }} prévus</span>
        </p>

        <p v-if="!overview.variableSpend.length" class="pt-3 text-[12.5px] text-ink-faint">
          Aucune enveloppe de budget ce mois-ci.
        </p>
        <ul v-else class="flex flex-col gap-3 pt-4">
          <li v-for="row in overview.variableSpend" :key="row.id" class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-[12.5px]">
              <span class="font-semibold text-ink">{{ row.name }}</span>
              <span class="font-semibold text-ink-faint">{{ euroShort(row.spent) }} / {{ euroShort(row.ceiling) }}</span>
            </div>
            <div class="h-1.5 w-full rounded-full bg-toggle-track">
              <div
                class="h-1.5 rounded-full"
                :class="row.spent > row.ceiling ? 'bg-warn-bar' : 'bg-mint-bar'"
                :style="{ width: `${percent(row.spent, row.ceiling)}%` }"
              />
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the E2E test and watch it pass**

Run: `set -a && . ./.env && set +a && npx playwright test tests/e2e/comptes.spec.ts --reporter=line`
Expected: PASS, 4 tests.

- [ ] **Step 5: Confirm no router warnings remain for either new page**

Run: `set -a && . ./.env && set +a && npx playwright test --reporter=line 2>&1 | grep -E "No match found for location with path \"/(envies|comptes)\"" || echo "no warnings for /envies or /comptes"`
Expected: `no warnings for /envies or /comptes`.

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npm run build && (set -a && . ./.env && set +a && npx playwright test --reporter=line)`
Expected: unit tests pass, build completes, full E2E suite passes.

- [ ] **Step 7: Commit**

```bash
git add app/pages/comptes.vue tests/e2e/comptes.spec.ts
git commit -m "feat: add the Comptes page"
```

---

## Notes for the executor

- **Two of the four sidebar links stay broken.** `/epargne` and `/compte-rendu` are separate milestones; their Vue Router warnings will persist after this plan and are not a defect introduced here.
- **`/api/wishlist` and `/api/accounts/overview` both touch the connection pool** through `listBudgetEnvelopeLedgers` (about 5 parallel queries) and `listReserveEnvelopeBalances`. That is expected: those modules have not been migrated to the Data API yet, and `max: 12` in `server/utils/db.ts` leaves headroom. Do not migrate them as part of this plan.
- **Numbers arrive from PostgREST as JSON numbers or numeric strings** depending on the column type. `numeric` columns (`price`, `current_balance`, `default_target`) come back as strings, which is why every mapping wraps them in `Number()`. Keep that wrapping.
- **If an E2E test fails at the login step**, check that the dev server picked up the current `app/pages/login.vue`; `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, so a stale server on port 3000 will serve stale code. `lsof -ti:3000 | xargs kill -9` and rerun.
- **The sort comparator is deliberately written twice** — once in `server/utils/domain/wishlist.ts` (`sortWishlist`, unit-tested) and once inside `app/pages/envies.vue`, because the `Trier par priorité` toggle reorders without refetching. `app/` code in this project never imports from `shared/`, and `server/utils/` is not importable from a Vue page, so there is no existing path to share the eight lines. If the two ever disagree, the server function is the specification and the page must be corrected to match it.
- **Two deviations from the Figma are intentional** and should not be "fixed" during review: the priority tally renders on the `/envies` page rather than in the app sidebar (see the comment in the template), and `/comptes` shows a `Modifier les comptes` link to Paramètres in place of the mockup's `+ Relier un compte` button, since account CRUD already lives there and bank linking is out of scope.
