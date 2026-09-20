# Milestone 3: Desktop Shell & Envelope Ledger Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile bottom-nav shell with the new persistent desktop sidebar (per the Figma "Final - web" mockups), retire PWA/mobile-only code, and lay down the envelope ceiling/net-spent domain-logic module that every later milestone's views (Mouvements, Enveloppes, Épargne, Comptes, Compte rendu) will read from.

**Architecture:** Same server pattern as Milestones 1–2 — every data mutation/read goes through a Nitro `server/api/*` route that calls `requireUser()` first. New: business math (envelope ceiling/net-spent/remaining) lives in a pure, unit-tested function in `server/utils/domain/`, called by API routes rather than computed inline — this is the "single server-side domain module" the original PWA spec called for (§3), started here because the new shell's ceilings widget is the first UI to need it. The new `AppSidebar` layout replaces `app/layouts/default.vue`'s bottom tab bar; `EntrySheet`/`useEntrySheet` (mobile bottom-sheet) are deleted outright — their replacement, a page-scoped `EntryPanel` on `/mouvements`, is Milestone 4's job, not this one.

**Tech Stack:** Same as Milestones 1–2 (Nuxt 4, Nuxt UI, Tailwind v4 `@theme`, Drizzle, Zod, Vitest, Playwright). `@vite-pwa/nuxt` is removed.

**Spec:** `docs/superpowers/specs/2026-09-20-desktop-web-redesign-design.md` (this milestone covers spec §2 "What's dropped", §3 "App shell", and the envelope-ledger part of §7's domain-logic reuse across views), and `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md` §7 "Domain logic details" for the exact ceiling/net-spent/remaining formulas.

## Global Constraints

- Every new `server/api/*` route calls `requireUser(event)` before touching the database, exactly like every existing route.
- No hardcoded hex colors in new Vue components — use Tailwind theme tokens (existing ones from Milestone 2, plus the two added in Task 1).
- No PWA install-ability, no manifest, no mobile breakpoint handling — desktop-only per the design spec's §2.
- Envelope ceiling/net-spent/remaining math always goes through `computeEnvelopeLedger` — never re-derived inline in an API route or component, per the original spec's "one typed, unit-testable place" requirement (§3).
- Routes not yet built in this milestone (`/enveloppes`, `/mouvements`, `/epargne`, `/envies`, `/comptes`, `/compte-rendu`) will 404 when clicked from the new sidebar until their own milestone lands — expected and acceptable, same as Milestone 1 shipping before any data-entry UI existed.

---

## File Structure

```
nuxt.config.ts                                    (modify: remove @vite-pwa/nuxt + pwa config)
package.json                                       (modify: remove @vite-pwa/nuxt dependency)
public/
  icon-192.png                                     (delete)
  icon-512.png                                      (delete)
app/
  assets/css/main.css                              (modify: add --color-primary, --color-primary-ink)
  components/
    AppSidebar.vue                                 (create)
    SidebarCeilingsWidget.vue                       (create)
    PageHeader.vue                                  (create)
    EntrySheet.vue                                  (delete)
  composables/
    useEntrySheet.ts                                (delete)
  layouts/
    default.vue                                     (rewrite)
  pages/
    parametres.vue                                  (moved from plus/parametres.vue)
    plus/
      parametres.vue                                (delete; plus/ dir removed)
server/
  utils/
    domain/
      envelopeLedger.ts                             (create)
  api/
    envelopes/
      ceilings.get.ts                                (create)
tests/
  unit/
    server/
      utils/
        domain/
          envelopeLedger.test.ts                     (create)
  e2e/
    entry.spec.ts                                    (modify: drop the entry-sheet test, fix the Paramètres path)
```

---

### Task 1: Remove PWA & add shell design tokens

**Files:**
- Modify: `nuxt.config.ts`
- Modify: `package.json`
- Modify: `app/assets/css/main.css`
- Delete: `public/icon-192.png`, `public/icon-512.png`

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind utility classes `bg-primary`, `text-primary-ink` — used by `AppSidebar.vue` (Task 4) and every later milestone's primary buttons.

- [ ] **Step 1: Remove the PWA module from `nuxt.config.ts`**

```ts
export default defineNuxtConfig({
  compatibilityDate: '2026-09-19',
  modules: ['@nuxt/ui', '@nuxt/fonts'],
  css: ['~/assets/css/main.css'],
  components: [
    { path: '~/components/entry', pathPrefix: false },
    '~/components',
  ],
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    },
  },
  devServer: {
    // Bind to IPv4 explicitly: some environments resolve 'localhost' to ::1,
    // which the dev server (and Playwright's webServer) cannot connect to.
    host: '127.0.0.1',
  },
})
```

- [ ] **Step 2: Uninstall the dependency**

Run: `npm uninstall @vite-pwa/nuxt`
Expected: removed from `package.json` and `package-lock.json`.

- [ ] **Step 3: Delete the now-unused PWA icons**

Run: `rm public/icon-192.png public/icon-512.png`

- [ ] **Step 4: Add the primary color tokens to `app/assets/css/main.css`**

```css
@import "tailwindcss";
@import "@nuxt/ui";

@theme {
  --color-ink: #3a3450;
  --color-ink-muted: rgb(58 52 80 / 72%);
  --color-ink-faint: rgb(58 52 80 / 35%);
  --color-app-bg: #f7f4fb;
  --color-toggle-track: #ece8f4;
  --color-divider: #f1eef6;
  --color-mint: #a8dcc4;
  --color-mint-ink: #2f5c48;
  --color-mint-bar: #7cc6a6;
  --color-warn-bg: #f7ddd2;
  --color-warn-ink: #b4553a;
  --color-warn-bar: #d3714f;
  --color-violet-bar: #b19ee8;
  --color-azure-bar: #86bde8;
  --color-primary: #6c5fa8;
  --color-primary-ink: #ffffff;
}

body {
  font-family: 'Plus Jakarta Sans', sans-serif;
  background-color: var(--color-app-bg);
}
```

- [ ] **Step 5: Build and verify**

Run:
```bash
npm run build
grep -r "\-\-color-primary" .output/public/_nuxt/*.css
grep "vite-pwa" nuxt.config.ts package.json
```
Expected: the first `grep` finds the new token; the second finds nothing (empty output, exit code 1).

- [ ] **Step 6: Commit**

```bash
git add nuxt.config.ts package.json package-lock.json app/assets/css/main.css public
git commit -m "chore: drop PWA install-ability, add primary color tokens"
```

---

### Task 2: Envelope ledger domain module

**Files:**
- Create: `server/utils/domain/envelopeLedger.ts`
- Test: `tests/unit/server/utils/domain/envelopeLedger.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, plain numbers in/out).
- Produces: `computeEnvelopeLedger(inputs: EnvelopeLedgerInputs): EnvelopeLedgerResult` — consumed by `server/api/envelopes/ceilings.get.ts` (Task 3), and by every later milestone's envelope-ceiling reads (Enveloppes table, Dashboard KPIs, Comptes, Compte rendu).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/server/utils/domain/envelopeLedger.test.ts
import { describe, it, expect } from 'vitest'
import { computeEnvelopeLedger } from '../../../../../server/utils/domain/envelopeLedger'

describe('computeEnvelopeLedger', () => {
  it('uses the default ceiling when no monthly allocation exists yet', () => {
    const result = computeEnvelopeLedger({
      defaultCeiling: 100,
      allocation: null,
      transfersIn: 0,
      transfersOut: 0,
      expensesTotal: 40,
      incomeCreditsTotal: 0,
    })
    expect(result).toEqual({ ceiling: 100, netSpent: 40, remaining: 60 })
  })

  it('uses the allocation base ceiling, carry-over, and overspend deduction instead of the default when one exists', () => {
    const result = computeEnvelopeLedger({
      defaultCeiling: 100,
      allocation: { baseCeiling: 90, carriedOverAmount: 10, overspendDeduction: 5 },
      transfersIn: 0,
      transfersOut: 0,
      expensesTotal: 0,
      incomeCreditsTotal: 0,
    })
    // 90 + 10 - 5 = 95
    expect(result.ceiling).toBe(95)
  })

  it('adds transfers in and subtracts transfers out from the ceiling', () => {
    const result = computeEnvelopeLedger({
      defaultCeiling: 100,
      allocation: null,
      transfersIn: 20,
      transfersOut: 5,
      expensesTotal: 0,
      incomeCreditsTotal: 0,
    })
    expect(result.ceiling).toBe(115)
  })

  it('subtracts income credits from net spent, without affecting the ceiling', () => {
    const result = computeEnvelopeLedger({
      defaultCeiling: 130,
      allocation: null,
      transfersIn: 0,
      transfersOut: 0,
      expensesTotal: 82,
      incomeCreditsTotal: 20,
    })
    expect(result).toEqual({ ceiling: 130, netSpent: 62, remaining: 68 })
  })

  it('produces a negative remaining when the envelope is overspent', () => {
    const result = computeEnvelopeLedger({
      defaultCeiling: 40,
      allocation: null,
      transfersIn: 0,
      transfersOut: 20,
      expensesTotal: 71,
      incomeCreditsTotal: 0,
    })
    // ceiling = 40 - 20 = 20, netSpent = 71, remaining = 20 - 71 = -51
    expect(result).toEqual({ ceiling: 20, netSpent: 71, remaining: -51 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/server/utils/domain/envelopeLedger.test.ts`
Expected: FAIL — `Cannot find module '../../../../../server/utils/domain/envelopeLedger'`.

- [ ] **Step 3: Write `server/utils/domain/envelopeLedger.ts`**

```ts
export interface EnvelopeAllocation {
  baseCeiling: number
  carriedOverAmount: number
  overspendDeduction: number
}

export interface EnvelopeLedgerInputs {
  defaultCeiling: number
  allocation: EnvelopeAllocation | null
  transfersIn: number
  transfersOut: number
  expensesTotal: number
  incomeCreditsTotal: number
}

export interface EnvelopeLedgerResult {
  ceiling: number
  netSpent: number
  remaining: number
}

export function computeEnvelopeLedger(inputs: EnvelopeLedgerInputs): EnvelopeLedgerResult {
  const baseCeiling = inputs.allocation?.baseCeiling ?? inputs.defaultCeiling
  const carriedOverAmount = inputs.allocation?.carriedOverAmount ?? 0
  const overspendDeduction = inputs.allocation?.overspendDeduction ?? 0

  const ceiling = baseCeiling + carriedOverAmount - overspendDeduction + inputs.transfersIn - inputs.transfersOut
  const netSpent = inputs.expensesTotal - inputs.incomeCreditsTotal
  const remaining = ceiling - netSpent

  return { ceiling, netSpent, remaining }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/utils/domain/envelopeLedger.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/domain/envelopeLedger.ts tests/unit/server/utils/domain/envelopeLedger.test.ts
git commit -m "feat: add envelope ledger domain module"
```

---

### Task 3: Envelope ceilings API endpoint

**Files:**
- Create: `server/api/envelopes/ceilings.get.ts`

**Interfaces:**
- Consumes: `requireUser` (`server/utils/auth.ts`), `db` (`server/utils/db.ts`), `envelopes`/`monthlyEnvelopeAllocations`/`expenseEntries`/`incomeEntries`/`transfers` tables (`drizzle/schema`), `computeEnvelopeLedger` (Task 2).
- Produces: `GET /api/envelopes/ceilings` → `{ id: string, name: string, emoji: string, ceiling: number, netSpent: number, remaining: number }[]`, one entry per active `budget`-kind envelope for the current calendar month, ordered by `sortOrder` — consumed by `SidebarCeilingsWidget.vue` (Task 4) and, later, the Enveloppes table (Milestone 5).

- [ ] **Step 1: Write `server/api/envelopes/ceilings.get.ts`**

```ts
import { and, asc, eq, isNull } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { envelopes, monthlyEnvelopeAllocations, expenseEntries, incomeEntries, transfers } from '../../../drizzle/schema'
import { computeEnvelopeLedger } from '../../utils/domain/envelopeLedger'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const budgetEnvelopes = await db
    .select()
    .from(envelopes)
    .where(and(eq(envelopes.kind, 'budget'), isNull(envelopes.archivedAt)))
    .orderBy(asc(envelopes.sortOrder))

  const results = []

  for (const envelope of budgetEnvelopes) {
    const [allocation] = await db
      .select()
      .from(monthlyEnvelopeAllocations)
      .where(and(
        eq(monthlyEnvelopeAllocations.envelopeId, envelope.id),
        eq(monthlyEnvelopeAllocations.year, year),
        eq(monthlyEnvelopeAllocations.month, month),
      ))

    const expenses = await db
      .select()
      .from(expenseEntries)
      .where(and(
        eq(expenseEntries.envelopeId, envelope.id),
        eq(expenseEntries.yearAssigned, year),
        eq(expenseEntries.monthAssigned, month),
      ))

    const incomeCredits = await db
      .select()
      .from(incomeEntries)
      .where(and(
        eq(incomeEntries.targetEnvelopeId, envelope.id),
        eq(incomeEntries.yearAssigned, year),
        eq(incomeEntries.monthAssigned, month),
      ))

    const transfersIn = await db
      .select()
      .from(transfers)
      .where(and(
        eq(transfers.toEnvelopeId, envelope.id),
        eq(transfers.yearAssigned, year),
        eq(transfers.monthAssigned, month),
      ))

    const transfersOut = await db
      .select()
      .from(transfers)
      .where(and(
        eq(transfers.fromEnvelopeId, envelope.id),
        eq(transfers.yearAssigned, year),
        eq(transfers.monthAssigned, month),
      ))

    const ledger = computeEnvelopeLedger({
      defaultCeiling: Number(envelope.defaultCeiling ?? 0),
      allocation: allocation
        ? {
            baseCeiling: Number(allocation.baseCeiling),
            carriedOverAmount: Number(allocation.carriedOverAmount),
            overspendDeduction: Number(allocation.overspendDeduction),
          }
        : null,
      transfersIn: transfersIn.reduce((sum, row) => sum + Number(row.amount), 0),
      transfersOut: transfersOut.reduce((sum, row) => sum + Number(row.amount), 0),
      expensesTotal: expenses.reduce((sum, row) => sum + Number(row.amount), 0),
      incomeCreditsTotal: incomeCredits.reduce((sum, row) => sum + Number(row.amount), 0),
    })

    results.push({
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      ...ledger,
    })
  }

  return results
})
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 3: Manually verify against the real API**

Requires a working `DATABASE_URL` with migrations applied and reference data seeded (`npm run db:migrate && npm run seed:reference-data`). Run `npm run dev`, log in, and in another terminal run:

```bash
curl -s http://localhost:3000/api/envelopes/ceilings --cookie "<paste session cookie from browser devtools>"
```

Expected: a JSON array, one object per seeded `budget`-kind envelope, each with `ceiling` equal to its `defaultCeiling` (no expenses/transfers/allocations exist yet, so `netSpent: 0` and `remaining === ceiling`).

If no real database is reachable in this environment, run `npx tsc --noEmit server/api/envelopes/ceilings.get.ts` to confirm it's type-correct, and note in your report that live verification is pending a real database connection — same precedent as Milestone 2's seed script.

- [ ] **Step 4: Commit**

```bash
git add server/api/envelopes/ceilings.get.ts
git commit -m "feat: add envelope ceilings API endpoint"
```

---

### Task 4: Sidebar shell (AppSidebar, PageHeader, SidebarCeilingsWidget, new default layout)

**Files:**
- Create: `app/components/AppSidebar.vue`
- Create: `app/components/SidebarCeilingsWidget.vue`
- Create: `app/components/PageHeader.vue`
- Delete: `app/components/EntrySheet.vue`
- Delete: `app/composables/useEntrySheet.ts`
- Modify: `app/layouts/default.vue`

**Interfaces:**
- Consumes: `GET /api/envelopes/ceilings` (Task 3), the primary color tokens (Task 1).
- Produces: `<AppSidebar>` (no props — reads the current route and the ceilings API itself), `<PageHeader :title><template #context>...</template><template #actions>...</template></PageHeader>` — consumed by every page built in Milestones 4–8. The default layout now renders `<AppSidebar>` beside a `<main>` slot instead of the old bottom tab bar.

- [ ] **Step 1: Write `app/components/PageHeader.vue`**

```vue
<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-extrabold text-ink">{{ title }}</h1>
      <slot name="context" />
    </div>
    <div class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Write `app/components/SidebarCeilingsWidget.vue`**

```vue
<script setup lang="ts">
interface EnvelopeCeiling {
  id: string
  name: string
  emoji: string
  ceiling: number
  netSpent: number
  remaining: number
}

const { data } = await useFetch<EnvelopeCeiling[]>('/api/envelopes/ceilings')

const envelopesList = computed(() => data.value ?? [])
const topThree = computed(() => envelopesList.value.slice(0, 3))
const totalRemaining = computed(() => envelopesList.value.reduce((sum, envelope) => sum + envelope.remaining, 0))
</script>

<template>
  <div class="rounded-[16px] bg-app-bg p-3">
    <div class="flex items-center justify-between">
      <p class="text-[11px] font-bold text-ink">Plafonds</p>
      <p class="text-[11px] font-bold text-ink">{{ totalRemaining.toFixed(2) }} € dispo.</p>
    </div>
    <ul class="mt-2 space-y-2">
      <li v-for="envelope in topThree" :key="envelope.id" class="flex items-center justify-between text-[11px]">
        <span class="flex items-center gap-1.5 font-semibold text-ink-muted">
          <span>{{ envelope.emoji }}</span>
          <span>{{ envelope.name }}</span>
        </span>
        <span class="font-bold" :class="envelope.remaining < 0 ? 'text-warn-ink' : 'text-ink'">
          {{ envelope.remaining.toFixed(2) }} €
        </span>
      </li>
    </ul>
    <NuxtLink to="/enveloppes" class="mt-2 block text-[11px] font-bold text-ink-muted">
      Voir les {{ envelopesList.length }} enveloppes
    </NuxtLink>
  </div>
</template>
```

- [ ] **Step 3: Write `app/components/AppSidebar.vue`**

```vue
<script setup lang="ts">
const route = useRoute()
const supabase = useSupabaseClient()

const navItems = [
  { path: '/', label: 'Tableau de bord' },
  { path: '/enveloppes', label: 'Enveloppes' },
  { path: '/mouvements', label: 'Mouvements' },
  { path: '/epargne', label: 'Épargne' },
  { path: '/envies', label: 'Envies' },
  { path: '/comptes', label: 'Comptes' },
  { path: '/compte-rendu', label: 'Compte rendu' },
  { path: '/parametres', label: 'Paramètres' },
]

async function handleLogout() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <aside class="flex h-screen w-[280px] shrink-0 flex-col justify-between border-r border-divider bg-white p-4">
    <div>
      <div class="flex items-center gap-2 px-2 py-2">
        <span class="flex size-8 items-center justify-center rounded-[10px] bg-primary text-[13px] font-extrabold text-primary-ink">B</span>
        <span class="text-[15px] font-extrabold text-ink">Budget</span>
      </div>

      <nav class="mt-4 flex flex-col gap-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="rounded-[10px] px-3 py-2 text-[13.5px] font-semibold"
          :class="route.path === item.path ? 'bg-toggle-track text-ink' : 'text-ink-muted'"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </div>

    <div class="flex flex-col gap-3">
      <SidebarCeilingsWidget />

      <button type="button" class="flex items-center gap-2 rounded-[10px] px-2 py-2 text-left" @click="handleLogout">
        <span class="flex size-7 items-center justify-center rounded-full bg-violet-bar text-[11px] font-bold text-white">M</span>
        <span class="text-[12.5px] font-bold text-ink">Marion</span>
      </button>
    </div>
  </aside>
</template>
```

- [ ] **Step 4: Delete the mobile bottom-sheet**

```bash
rm app/components/EntrySheet.vue app/composables/useEntrySheet.ts
```

- [ ] **Step 5: Rewrite `app/layouts/default.vue`**

```vue
<template>
  <div class="flex min-h-screen bg-app-bg">
    <AppSidebar />
    <main class="flex-1 overflow-y-auto p-8">
      <slot />
    </main>
  </div>
</template>
```

- [ ] **Step 6: Build to verify everything compiles**

Run: `npm run build`
Expected: builds without errors. (`app/pages/index.vue` still renders its Milestone-1 placeholder content — that's expected; it gets rebuilt as the real Tableau de bord in Milestone 4.)

- [ ] **Step 7: Manually verify in the browser**

Run `npm run dev`, log in, and confirm: the sidebar renders on the left with all 8 nav items, the active item (Tableau de bord) is highlighted, the Plafonds widget shows the seeded envelopes with their default ceilings as remaining amounts, and clicking "Marion" logs out and redirects to `/login`.

- [ ] **Step 8: Commit**

```bash
git add app/components/AppSidebar.vue app/components/SidebarCeilingsWidget.vue app/components/PageHeader.vue app/layouts/default.vue
git rm app/components/EntrySheet.vue app/composables/useEntrySheet.ts
git commit -m "feat: replace mobile bottom-nav shell with desktop sidebar"
```

---

### Task 5: Move Paramètres and update e2e coverage

**Files:**
- Create: `app/pages/parametres.vue` (moved from `app/pages/plus/parametres.vue`, contents unchanged)
- Delete: `app/pages/plus/parametres.vue`
- Modify: `tests/e2e/entry.spec.ts`

**Interfaces:**
- Consumes: nothing new — same `GET/POST /api/categories` etc. the page already used.
- Produces: `/parametres` route, replacing `/plus/parametres`.

- [ ] **Step 1: Move the page file**

```bash
mkdir -p app/pages
git mv app/pages/plus/parametres.vue app/pages/parametres.vue
rmdir app/pages/plus
```

- [ ] **Step 2: Update `tests/e2e/entry.spec.ts`**

Replace the file's contents — the entry-sheet test is removed (that flow no longer exists; it returns, rebuilt against the new `/mouvements` `EntryPanel`, in Milestone 4) and the Paramètres test's path is updated:

```ts
import { test, expect } from '@playwright/test'

test('adds a category from the Paramètres page', async ({ page }) => {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

  test.skip(!email || !password || !hasRealSupabaseConfig, 'SEED_USER_EMAIL, SEED_USER_PASSWORD, SUPABASE_URL, and SUPABASE_ANON_KEY must all be set to run this test')

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.goto('/parametres')
  await expect(page).toHaveURL('http://localhost:3000/parametres')
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('🛒').fill('🧪')
  await page.getByPlaceholder('Nouvelle catégorie').fill('Test E2E')
  await page.getByRole('button', { name: 'Ajouter' }).first().click()

  // .first(): this test isn't idempotent against a persistent real database —
  // repeated runs each add another "🧪 Test E2E" category (nothing archives
  // it afterward), so asserting the bare text can hit a Playwright strict-mode
  // violation once more than one match exists. Asserting on the first match is
  // enough to prove the add-category flow worked.
  await expect(page.getByText('🧪 Test E2E').first()).toBeVisible()
})
```

- [ ] **Step 3: Build to verify the route compiles**

Run: `npm run build`
Expected: builds without errors; `.output/public` (or the Nitro route manifest) shows `/parametres` and no longer `/plus/parametres`.

- [ ] **Step 4: Run the unit test suite (regression check)**

Run: `npx vitest run`
Expected: PASS — this task doesn't touch unit-tested logic, this just confirms nothing else broke.

- [ ] **Step 5: Manually verify in the browser**

Run `npm run dev`, log in, click "Paramètres" in the sidebar, confirm it navigates to `/parametres` and the four reference-data sections still render and still accept new entries.

- [ ] **Step 6: Commit**

```bash
git add app/pages/parametres.vue tests/e2e/entry.spec.ts
git rm app/pages/plus/parametres.vue
git commit -m "refactor: move Paramètres to /parametres, update e2e coverage for the new shell"
```

---

## Self-Review Notes

- **Spec coverage**: §2 (drop PWA/mobile) → Task 1, 4. §3 (app shell: logo, nav, ceilings widget, user chip, `PageHeader`) → Task 4. Domain-logic foundation → Task 2–3. Paramètres relocation (§4.8) → Task 5. Views themselves (§4.1–4.7) are explicitly out of scope for this milestone per the phasing decision.
- **Type consistency**: `EnvelopeLedgerInputs`/`EnvelopeLedgerResult` (Task 2) match the shape consumed in Task 3's route and the `EnvelopeCeiling` interface in Task 4's `SidebarCeilingsWidget.vue` (`id`, `name`, `emoji`, `ceiling`, `netSpent`, `remaining`).
- **No placeholders**: every step has real code or a real, runnable verification command.
