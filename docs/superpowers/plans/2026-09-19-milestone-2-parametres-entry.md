# Milestone 2: Paramètres & Unified Entry Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Paramètres screen (reference-data management) and the unified Sortie/Entrée/Transfert entry screen, reachable from a floating "+" button in a new app shell — the first real data-entry surface of the app.

**Architecture:** Same as Milestone 1 — every data mutation goes through a Nitro `server/api/*` route that calls `requireUser()` first, using Drizzle against the existing schema. New: Zod schemas live in `shared/schemas/*.ts` so the same validation runs on both the client (before submit) and the server (source of truth). Presentational components (toggle, pills, form rows, keypad) carry no business logic and are reused across all three entry forms and Paramètres.

**Tech Stack:** Same as Milestone 1, plus `@nuxt/fonts` (Plus Jakarta Sans) and Tailwind v4's `@theme` directive for the design tokens.

**Spec:** `docs/superpowers/specs/2026-09-19-milestone-2-parametres-entry-design.md` (and the parent `docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md` for the data model)

## Global Constraints

- Every new `server/api/*` route calls `requireUser(event)` before touching the database, exactly like `server/api/health.get.ts`.
- Every mutation's input is validated with a Zod schema from `shared/schemas/*.ts` — the same schema is imported client-side for pre-submit validation and server-side as the source of truth.
- No hardcoded hex colors in new Vue components — use the Tailwind theme tokens defined in Task 1 (`bg-ink`, `text-ink-muted`, `bg-app-bg`, etc.).
- The entry screen is a global overlay component (`EntrySheet.vue`), not a routed page, per the design spec's assumption #1.
- Paramètres supports add/rename(not built this milestone)/archive only — no hard delete — per the design spec's assumption #2.
- Font is Plus Jakarta Sans, added via `@nuxt/fonts` (Google Fonts, auto-optimized by Nuxt) — resolves the design spec's assumption #3.
- Transfers and expenses derive `month_assigned`/`year_assigned` from their `date` field automatically; only income entries expose a separate, user-editable "mois d'affectation" field, per the Figma screens.

---

## File Structure

```
nuxt.config.ts                          (modify: add @nuxt/fonts)
app/
  assets/css/main.css                   (modify: add @theme tokens + font-family)
  components/
    SegmentedToggle.vue
    PillSelector.vue
    EntryFormRow.vue
    NumericKeypad.vue
    EntrySheet.vue
    entry/
      ExpenseForm.vue
      IncomeForm.vue
      TransferForm.vue
  composables/
    useAmountInput.ts
    useEntrySheet.ts
  layouts/
    default.vue
  pages/
    plus/
      parametres.vue
shared/
  schemas/
    category.ts
    envelope.ts
    incomeType.ts
    account.ts
    expenseEntry.ts
    incomeEntry.ts
    transfer.ts
server/
  utils/
    referenceCrud.ts
  api/
    categories/
      index.get.ts
      index.post.ts
      [id].patch.ts
    envelopes/
      index.get.ts
      index.post.ts
      [id].patch.ts
    income-types/
      index.get.ts
      index.post.ts
      [id].patch.ts
    accounts/
      index.get.ts
      index.post.ts
      [id].patch.ts
    expenses/
      index.post.ts
    incomes/
      index.post.ts
    transfers/
      index.post.ts
scripts/
  seed-reference-data.ts
tests/
  unit/
    composables/
      useAmountInput.test.ts
    server/
      utils/
        referenceCrud.test.ts
      schemas/
        expenseEntry.test.ts
        transfer.test.ts
  e2e/
    entry.spec.ts
```

---

### Task 1: Design tokens & font

**Files:**
- Modify: `nuxt.config.ts`
- Modify: `app/assets/css/main.css`

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind utility classes `bg-ink`, `text-ink`, `text-ink-muted`, `text-ink-faint`, `bg-app-bg`, `bg-toggle-track`, `border-divider`, `bg-mint`, `text-mint-ink`, `bg-mint-bar`, `bg-warn-bg`, `text-warn-ink`, `bg-warn-bar`, `bg-violet-bar`, `bg-azure-bar` — used by every component in this plan. `Plus Jakarta Sans` applied as the default body font.

- [ ] **Step 1: Install `@nuxt/fonts`**

Run: `npm install @nuxt/fonts`
Expected: added to `package.json` dependencies.

- [ ] **Step 2: Modify `nuxt.config.ts`**

```ts
export default defineNuxtConfig({
  compatibilityDate: '2026-09-19',
  modules: ['@nuxt/ui', '@vite-pwa/nuxt', '@nuxt/fonts'],
  css: ['~/assets/css/main.css'],
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
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Budget Planner',
      short_name: 'Budget',
      description: 'Budget planner pour Laura',
      theme_color: '#f97316',
      background_color: '#fff7ed',
      display: 'standalone',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
})
```

- [ ] **Step 3: Modify `app/assets/css/main.css`**

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
}

body {
  font-family: 'Plus Jakarta Sans', sans-serif;
  background-color: var(--color-app-bg);
}
```

- [ ] **Step 4: Build and verify the tokens and font are emitted**

Run:
```bash
npm run build
grep -r "Plus Jakarta Sans" .output/public/_nuxt/*.css
grep -r "\-\-color-ink" .output/public/_nuxt/*.css
```
Expected: both `grep` commands find matches (the font-family declaration and the CSS custom property).

- [ ] **Step 5: Commit**

```bash
git add nuxt.config.ts app/assets/css/main.css package.json package-lock.json
git commit -m "feat: add design tokens and Plus Jakarta Sans font"
```

---

### Task 2: Core primitive components

**Files:**
- Create: `app/components/SegmentedToggle.vue`
- Create: `app/components/PillSelector.vue`
- Create: `app/components/EntryFormRow.vue`

**Interfaces:**
- Consumes: the Tailwind tokens from Task 1.
- Produces: `<SegmentedToggle :options :model-value @update:model-value>`, `<PillSelector :options :model-value @update:model-value>`, `<EntryFormRow :label :icon-bg-class><template #default>...</template></EntryFormRow>` — all three consumed by the entry forms (Tasks 7–9) and Paramètres (Task 6).

- [ ] **Step 1: Write `app/components/SegmentedToggle.vue`**

```vue
<script setup lang="ts">
defineProps<{
  options: { value: string; label: string }[]
  modelValue: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="flex gap-1 rounded-[14px] bg-toggle-track p-1">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="flex-1 rounded-[11px] py-[9px] text-center text-[13px] font-bold transition-colors"
      :class="modelValue === option.value ? 'bg-ink text-white' : 'text-ink-muted'"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
```

- [ ] **Step 2: Write `app/components/PillSelector.vue`**

```vue
<script setup lang="ts">
defineProps<{
  options: { value: string; label: string }[]
  modelValue: string | null
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="rounded-full px-[13px] py-[9px] text-[12px] font-semibold transition-colors"
      :class="modelValue === option.value ? 'bg-ink text-white' : 'bg-app-bg text-ink-muted'"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
```

- [ ] **Step 3: Write `app/components/EntryFormRow.vue`**

```vue
<script setup lang="ts">
defineProps<{
  label: string
  iconBgClass?: string
}>()
</script>

<template>
  <div class="flex items-center gap-3 border-b border-divider py-[13px] last:border-b-0">
    <span class="size-7 shrink-0 rounded-[10px]" :class="iconBgClass ?? 'bg-toggle-track'" />
    <span class="flex-1 text-[13.5px] font-semibold text-ink-muted">{{ label }}</span>
    <div class="text-[13.5px] font-bold text-ink">
      <slot />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Verify the project still builds**

Run: `npm run build`
Expected: builds without errors (these components aren't imported anywhere yet, but this confirms no syntax/type errors). They get real interactive verification once wired into the entry forms (Tasks 7–9) and exercised by the Task 10 end-to-end test.

- [ ] **Step 5: Commit**

```bash
git add app/components/SegmentedToggle.vue app/components/PillSelector.vue app/components/EntryFormRow.vue
git commit -m "feat: add segmented toggle, pill selector, and form row components"
```

---

### Task 3: Numeric keypad & amount-input composable

**Files:**
- Create: `app/composables/useAmountInput.ts`
- Create: `app/components/NumericKeypad.vue`
- Test: `tests/unit/composables/useAmountInput.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `useAmountInput(initial?: string): { buffer: Ref<string>, displayValue: ComputedRef<string>, amount: ComputedRef<number>, pressDigit(d: string): void, pressComma(): void, backspace(): void, reset(): void }`. `<NumericKeypad @digit="..." @comma="..." @backspace="...">` — both consumed by the three entry forms (Tasks 7–9).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/composables/useAmountInput.test.ts
import { describe, it, expect } from 'vitest'
import { useAmountInput } from '../../../app/composables/useAmountInput'

describe('useAmountInput', () => {
  it('starts at zero', () => {
    const { displayValue, amount } = useAmountInput()
    expect(displayValue.value).toBe('0')
    expect(amount.value).toBe(0)
  })

  it('replaces the leading zero on the first digit', () => {
    const { pressDigit, displayValue } = useAmountInput()
    pressDigit('6')
    expect(displayValue.value).toBe('6')
  })

  it('appends digits to the integer part', () => {
    const { pressDigit, displayValue } = useAmountInput()
    pressDigit('6')
    pressDigit('2')
    expect(displayValue.value).toBe('62')
  })

  it('inserts a comma and appends decimal digits', () => {
    const { pressDigit, pressComma, displayValue, amount } = useAmountInput()
    pressDigit('6')
    pressDigit('2')
    pressComma()
    pressDigit('4')
    pressDigit('0')
    expect(displayValue.value).toBe('62,40')
    expect(amount.value).toBe(62.4)
  })

  it('ignores a second comma', () => {
    const { pressDigit, pressComma, displayValue } = useAmountInput()
    pressDigit('5')
    pressComma()
    pressComma()
    pressDigit('5')
    expect(displayValue.value).toBe('5,5')
  })

  it('ignores digits beyond two decimal places', () => {
    const { pressDigit, pressComma, displayValue } = useAmountInput()
    pressDigit('1')
    pressComma()
    pressDigit('2')
    pressDigit('3')
    pressDigit('4')
    expect(displayValue.value).toBe('1,23')
  })

  it('backspace removes the last character', () => {
    const { pressDigit, pressComma, backspace, displayValue } = useAmountInput()
    pressDigit('6')
    pressDigit('2')
    pressComma()
    pressDigit('4')
    backspace()
    expect(displayValue.value).toBe('62,')
    backspace()
    expect(displayValue.value).toBe('62')
  })

  it('backspace on a single digit resets to zero', () => {
    const { pressDigit, backspace, displayValue } = useAmountInput()
    pressDigit('7')
    backspace()
    expect(displayValue.value).toBe('0')
  })

  it('ignores non-digit input passed to pressDigit', () => {
    const { pressDigit, displayValue } = useAmountInput()
    pressDigit('a')
    expect(displayValue.value).toBe('0')
  })

  it('reset returns to zero', () => {
    const { pressDigit, reset, displayValue } = useAmountInput()
    pressDigit('9')
    reset()
    expect(displayValue.value).toBe('0')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/composables/useAmountInput.test.ts`
Expected: FAIL — `Cannot find module '../../../app/composables/useAmountInput'`.

- [ ] **Step 3: Write `app/composables/useAmountInput.ts`**

```ts
import { ref, computed } from 'vue'

export function useAmountInput(initial = '0') {
  const buffer = ref(initial)

  const displayValue = computed(() => buffer.value)

  const amount = computed(() => Number(buffer.value.replace(',', '.')) || 0)

  function pressDigit(digit: string) {
    if (!/^[0-9]$/.test(digit)) return

    const [integerPart, decimalPart] = buffer.value.split(',')

    if (decimalPart !== undefined) {
      if (decimalPart.length >= 2) return
      buffer.value = `${integerPart},${decimalPart}${digit}`
      return
    }

    buffer.value = buffer.value === '0' ? digit : `${buffer.value}${digit}`
  }

  function pressComma() {
    if (buffer.value.includes(',')) return
    buffer.value = `${buffer.value},`
  }

  function backspace() {
    if (buffer.value.length <= 1) {
      buffer.value = '0'
      return
    }
    buffer.value = buffer.value.slice(0, -1)
  }

  function reset() {
    buffer.value = '0'
  }

  return { buffer, displayValue, amount, pressDigit, pressComma, backspace, reset }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/composables/useAmountInput.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Write `app/components/NumericKeypad.vue`**

```vue
<script setup lang="ts">
const emit = defineEmits<{
  digit: [value: string]
  comma: []
  backspace: []
}>()

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '←']

function handlePress(key: string) {
  if (key === ',') {
    emit('comma')
    return
  }
  if (key === '←') {
    emit('backspace')
    return
  }
  emit('digit', key)
}
</script>

<template>
  <div class="grid grid-cols-3 gap-1.5">
    <button
      v-for="key in keys"
      :key="key"
      type="button"
      class="rounded-[13px] bg-app-bg py-[11px] text-center text-[20px] font-semibold text-ink"
      @click="handlePress(key)"
    >
      {{ key }}
    </button>
  </div>
</template>
```

- [ ] **Step 6: Commit**

```bash
git add app/composables/useAmountInput.ts app/components/NumericKeypad.vue tests/unit/composables/useAmountInput.test.ts
git commit -m "feat: add amount-input composable and numeric keypad"
```

---

### Task 4: Reference-data CRUD API

**Files:**
- Create: `shared/schemas/category.ts`
- Create: `shared/schemas/envelope.ts`
- Create: `shared/schemas/incomeType.ts`
- Create: `shared/schemas/account.ts`
- Create: `server/utils/referenceCrud.ts`
- Create: `server/api/categories/index.get.ts`
- Create: `server/api/categories/index.post.ts`
- Create: `server/api/categories/[id].patch.ts`
- Create: `server/api/envelopes/index.get.ts`
- Create: `server/api/envelopes/index.post.ts`
- Create: `server/api/envelopes/[id].patch.ts`
- Create: `server/api/income-types/index.get.ts`
- Create: `server/api/income-types/index.post.ts`
- Create: `server/api/income-types/[id].patch.ts`
- Create: `server/api/accounts/index.get.ts`
- Create: `server/api/accounts/index.post.ts`
- Create: `server/api/accounts/[id].patch.ts`
- Test: `tests/unit/server/utils/referenceCrud.test.ts`

**Interfaces:**
- Consumes: `db` from `server/utils/db.ts` (Milestone 1), `requireUser` from `server/utils/auth.ts` (Milestone 1), `categories`/`envelopes`/`incomeTypes`/`accounts` tables from `drizzle/schema` (Milestone 1).
- Produces: `listActiveRows(table)`, `insertRow(table, values)`, `patchRow(table, id, values)` from `server/utils/referenceCrud.ts` — reused as-is by all 12 routes here. `GET/POST /api/categories`, `PATCH /api/categories/:id` and the equivalent for `envelopes`, `income-types`, `accounts` — consumed by the Paramètres page (Task 6) and the entry forms (Tasks 7–9, which read categories/envelopes/income-types/accounts to populate their pickers).

- [ ] **Step 1: Write `shared/schemas/category.ts`**

```ts
import { z } from 'zod'

export const categoryInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  isFixed: z.boolean(),
  defaultTarget: z.number().nonnegative().nullable().optional(),
  fiftyThirtyTwentyBucket: z.enum(['besoins', 'envies', 'epargne']).nullable().optional(),
})

export const categoryPatchSchema = categoryInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
})

export type CategoryInput = z.infer<typeof categoryInputSchema>
```

- [ ] **Step 2: Write `shared/schemas/envelope.ts`**

```ts
import { z } from 'zod'

export const envelopeInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  kind: z.enum(['budget', 'reserve']),
  defaultCeiling: z.number().nonnegative().nullable().optional(),
  fiftyThirtyTwentyBucket: z.enum(['besoins', 'envies', 'epargne']).nullable().optional(),
  carryOverDefault: z.boolean().optional(),
  showOnHome: z.boolean().optional(),
})

export const envelopePatchSchema = envelopeInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
})

export type EnvelopeInput = z.infer<typeof envelopeInputSchema>
```

- [ ] **Step 3: Write `shared/schemas/incomeType.ts`**

```ts
import { z } from 'zod'

export const incomeTypeInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  requiresDetailsText: z.boolean().optional(),
  defaultTargetEnvelopeId: z.string().uuid().nullable().optional(),
})

export const incomeTypePatchSchema = incomeTypeInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
})

export type IncomeTypeInput = z.infer<typeof incomeTypeInputSchema>
```

- [ ] **Step 4: Write `shared/schemas/account.ts`**

```ts
import { z } from 'zod'

export const accountInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
})

export const accountPatchSchema = accountInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
})

export type AccountInput = z.infer<typeof accountInputSchema>
```

- [ ] **Step 5: Write the failing test for `referenceCrud.ts`**

```ts
// tests/unit/server/utils/referenceCrud.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', () => ({
  isNull: vi.fn((col) => ({ type: 'isNull', col })),
  eq: vi.fn((col, val) => ({ type: 'eq', col, val })),
  asc: vi.fn((col) => ({ type: 'asc', col })),
  and: vi.fn((...args) => ({ type: 'and', args })),
}))

const chain: any = {}
chain.select = vi.fn(() => chain)
chain.from = vi.fn(() => chain)
chain.where = vi.fn(() => chain)
chain.orderBy = vi.fn(() => Promise.resolve([{ id: '1' }]))
chain.insert = vi.fn(() => chain)
chain.values = vi.fn(() => chain)
chain.update = vi.fn(() => chain)
chain.set = vi.fn(() => chain)
chain.returning = vi.fn(() => Promise.resolve([{ id: '2' }]))

vi.mock('../../../../server/utils/db', () => ({ db: chain }))

import { listActiveRows, insertRow, patchRow } from '../../../../server/utils/referenceCrud'

const fakeTable = { archivedAt: 'archivedAt', sortOrder: 'sortOrder', id: 'id' } as any

describe('referenceCrud', () => {
  beforeEach(() => {
    chain.returning.mockResolvedValue([{ id: '2' }])
  })

  it('listActiveRows returns the active rows', async () => {
    const rows = await listActiveRows(fakeTable)
    expect(rows).toEqual([{ id: '1' }])
  })

  it('insertRow returns the inserted row', async () => {
    const row = await insertRow(fakeTable, { name: 'Test' })
    expect(row).toEqual({ id: '2' })
  })

  it('patchRow returns the updated row', async () => {
    const row = await patchRow(fakeTable, 'some-id', { name: 'Updated' })
    expect(row).toEqual({ id: '2' })
  })

  it('patchRow throws a 404 when no row matches', async () => {
    chain.returning.mockResolvedValueOnce([])
    await expect(patchRow(fakeTable, 'missing-id', {})).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/unit/server/utils/referenceCrud.test.ts`
Expected: FAIL — `Cannot find module '../../../../server/utils/referenceCrud'`.

- [ ] **Step 7: Write `server/utils/referenceCrud.ts`**

```ts
import { asc, eq, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from './db'

export async function listActiveRows(table: any) {
  return db.select().from(table).where(isNull(table.archivedAt)).orderBy(asc(table.sortOrder))
}

export async function insertRow(table: any, values: Record<string, unknown>) {
  const [row] = await db.insert(table).values(values).returning()
  return row
}

export async function patchRow(table: any, id: string, values: Record<string, unknown>) {
  const [row] = await db.update(table).set(values).where(eq(table.id, id)).returning()

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return row
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/unit/server/utils/referenceCrud.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: Write the categories routes**

```ts
// server/api/categories/index.get.ts
import { requireUser } from '../../utils/auth'
import { listActiveRows } from '../../utils/referenceCrud'
import { categories } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return listActiveRows(categories)
})
```

```ts
// server/api/categories/index.post.ts
import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { categories } from '../../../drizzle/schema'
import { categoryInputSchema } from '../../../shared/schemas/category'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = categoryInputSchema.parse(body)
  return insertRow(categories, input)
})
```

```ts
// server/api/categories/[id].patch.ts
import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { categories } from '../../../drizzle/schema'
import { categoryPatchSchema } from '../../../shared/schemas/category'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const body = await readBody(event)
  const input = categoryPatchSchema.parse(body)
  return patchRow(categories, id, input)
})
```

- [ ] **Step 10: Write the envelopes routes**

```ts
// server/api/envelopes/index.get.ts
import { requireUser } from '../../utils/auth'
import { listActiveRows } from '../../utils/referenceCrud'
import { envelopes } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return listActiveRows(envelopes)
})
```

```ts
// server/api/envelopes/index.post.ts
import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { envelopes } from '../../../drizzle/schema'
import { envelopeInputSchema } from '../../../shared/schemas/envelope'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = envelopeInputSchema.parse(body)
  return insertRow(envelopes, input)
})
```

```ts
// server/api/envelopes/[id].patch.ts
import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { envelopes } from '../../../drizzle/schema'
import { envelopePatchSchema } from '../../../shared/schemas/envelope'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const body = await readBody(event)
  const input = envelopePatchSchema.parse(body)
  return patchRow(envelopes, id, input)
})
```

- [ ] **Step 11: Write the income-types routes**

```ts
// server/api/income-types/index.get.ts
import { requireUser } from '../../utils/auth'
import { listActiveRows } from '../../utils/referenceCrud'
import { incomeTypes } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return listActiveRows(incomeTypes)
})
```

```ts
// server/api/income-types/index.post.ts
import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { incomeTypes } from '../../../drizzle/schema'
import { incomeTypeInputSchema } from '../../../shared/schemas/incomeType'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = incomeTypeInputSchema.parse(body)
  return insertRow(incomeTypes, input)
})
```

```ts
// server/api/income-types/[id].patch.ts
import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { incomeTypes } from '../../../drizzle/schema'
import { incomeTypePatchSchema } from '../../../shared/schemas/incomeType'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const body = await readBody(event)
  const input = incomeTypePatchSchema.parse(body)
  return patchRow(incomeTypes, id, input)
})
```

- [ ] **Step 12: Write the accounts routes**

```ts
// server/api/accounts/index.get.ts
import { requireUser } from '../../utils/auth'
import { listActiveRows } from '../../utils/referenceCrud'
import { accounts } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return listActiveRows(accounts)
})
```

```ts
// server/api/accounts/index.post.ts
import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { accounts } from '../../../drizzle/schema'
import { accountInputSchema } from '../../../shared/schemas/account'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = accountInputSchema.parse(body)
  return insertRow(accounts, input)
})
```

```ts
// server/api/accounts/[id].patch.ts
import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { accounts } from '../../../drizzle/schema'
import { accountPatchSchema } from '../../../shared/schemas/account'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const body = await readBody(event)
  const input = accountPatchSchema.parse(body)
  return patchRow(accounts, id, input)
})
```

- [ ] **Step 13: Build to verify all routes compile**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 14: Commit**

```bash
git add shared/schemas/category.ts shared/schemas/envelope.ts shared/schemas/incomeType.ts shared/schemas/account.ts server/utils/referenceCrud.ts server/api/categories server/api/envelopes server/api/income-types server/api/accounts tests/unit/server/utils/referenceCrud.test.ts
git commit -m "feat: add reference-data CRUD API for categories, envelopes, income types, accounts"
```

---

### Task 5: Seed default reference data

**Files:**
- Create: `scripts/seed-reference-data.ts`
- Modify: `package.json` (add `seed:reference-data` script)

**Interfaces:**
- Consumes: `db` from `server/utils/db.ts`, the four reference tables from `drizzle/schema`.
- Produces: populated `categories`, `envelopes`, `income_types`, `accounts`, `savings_goals` rows, matching the original spreadsheet/Figma defaults — required by every later task's manual/e2e verification (there's nothing to pick in a dropdown otherwise).

- [ ] **Step 1: Write `scripts/seed-reference-data.ts`**

```ts
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../server/utils/db'
import { categories, envelopes, incomeTypes, accounts, savingsGoals } from '../drizzle/schema'

const fixedCategories = [
  { name: 'Loyer', emoji: '🏠', isFixed: true, defaultTarget: '650', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 0 },
  { name: 'Électricité', emoji: '⚡', isFixed: true, defaultTarget: '49', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 1 },
  { name: 'Internet', emoji: '📶', isFixed: true, defaultTarget: '30', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 2 },
  { name: 'Téléphone', emoji: '📱', isFixed: true, defaultTarget: '15', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 3 },
  { name: 'Mutuelle', emoji: '🏥', isFixed: true, defaultTarget: '40', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 4 },
  { name: 'Transport', emoji: '🚗', isFixed: true, defaultTarget: '33', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 5 },
  { name: 'MACSF — assurance pro', emoji: '🩺', isFixed: true, defaultTarget: '0', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 6 },
]

const variableCategories = [
  { name: 'Courses', emoji: '🛒', isFixed: false, defaultTarget: '320', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 7 },
  { name: 'Essence', emoji: '⛽', isFixed: false, defaultTarget: '40', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 8 },
  { name: 'Santé', emoji: '💊', isFixed: false, defaultTarget: '40', fiftyThirtyTwentyBucket: 'besoins' as const, sortOrder: 9 },
]

const envelopeDefaults = [
  { name: 'Sorties', emoji: '🥂', kind: 'budget' as const, defaultCeiling: '90', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 0 },
  { name: 'Restaurants', emoji: '🍽️', kind: 'budget' as const, defaultCeiling: '110', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 1 },
  { name: 'Beauté', emoji: '💅', kind: 'budget' as const, defaultCeiling: '40', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 2 },
  { name: 'Mode', emoji: '👗', kind: 'budget' as const, defaultCeiling: '60', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 3 },
  { name: 'Sport', emoji: '🏃', kind: 'budget' as const, defaultCeiling: '25', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: true, sortOrder: 4 },
  { name: 'Cadeaux', emoji: '🎁', kind: 'budget' as const, defaultCeiling: '50', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 5 },
  { name: 'Culture', emoji: '🎬', kind: 'budget' as const, defaultCeiling: '35', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 6 },
  { name: 'Plaisirs perso', emoji: '🧸', kind: 'budget' as const, defaultCeiling: '45', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: false, sortOrder: 7 },
  { name: 'Voyage', emoji: '✈️', kind: 'budget' as const, defaultCeiling: '0', fiftyThirtyTwentyBucket: 'envies' as const, carryOverDefault: true, showOnHome: true, sortOrder: 8 },
  { name: 'Anniversaire et fêtes', emoji: '🎂', kind: 'reserve' as const, defaultCeiling: null, fiftyThirtyTwentyBucket: null, carryOverDefault: false, showOnHome: false, sortOrder: 9 },
]

const incomeTypeDefaults = [
  { name: 'Salaire', emoji: '💼', requiresDetailsText: false, sortOrder: 0 },
  { name: 'Prime', emoji: '✨', requiresDetailsText: false, sortOrder: 1 },
  { name: 'Babysitting', emoji: '🧸', requiresDetailsText: false, sortOrder: 2 },
  { name: 'Remboursement', emoji: '🔁', requiresDetailsText: false, sortOrder: 3 },
  { name: 'Cadeau reçu', emoji: '🎁', requiresDetailsText: false, sortOrder: 4 },
  { name: 'Autre', emoji: '📎', requiresDetailsText: true, sortOrder: 5 },
]

const accountDefaults = [
  { name: 'Compte courant', emoji: '🏦', sortOrder: 0 },
  { name: 'Compte joint', emoji: '💳', sortOrder: 1 },
  { name: 'Espèces', emoji: '💶', sortOrder: 2 },
]

const savingsGoalDefaults = [
  { name: 'Long terme', receivesSalaryVariance: true, sortOrder: 0 },
  { name: 'Cadeaux et fêtes', receivesSalaryVariance: false, sortOrder: 1 },
  { name: 'Vacances et imprévus', receivesSalaryVariance: false, sortOrder: 2 },
]

async function seedTable<T extends { name: string }>(
  table: any,
  rows: T[],
) {
  for (const row of rows) {
    const [existing] = await db.select().from(table).where(eq(table.name, row.name))

    if (existing) {
      console.log(`  skip: "${row.name}" already exists`)
      continue
    }

    await db.insert(table).values(row)
    console.log(`  created: "${row.name}"`)
  }
}

async function main() {
  console.log('Categories:')
  await seedTable(categories, [...fixedCategories, ...variableCategories])

  console.log('Envelopes:')
  await seedTable(envelopes, envelopeDefaults)

  console.log('Income types:')
  await seedTable(incomeTypes, incomeTypeDefaults)

  console.log('Accounts:')
  await seedTable(accounts, accountDefaults)

  console.log('Savings goals:')
  await seedTable(savingsGoals, savingsGoalDefaults)

  console.log('Done.')
}

main()
```

- [ ] **Step 2: Add the npm script**

Add to `package.json`'s `"scripts"` block: `"seed:reference-data": "tsx scripts/seed-reference-data.ts"`.

- [ ] **Step 3: Run it against the real database**

Requires a working `DATABASE_URL` in `.env` with migrations already applied (`npm run db:migrate`).

Run: `npm run seed:reference-data`
Expected: logs `created: "..."` for every row on first run, and `skip: "..." already exists` on any re-run.

If no real database is reachable in this environment, run `npx tsc --noEmit scripts/seed-reference-data.ts` (or include it in the project's normal build/typecheck) to confirm it's at least syntactically and type-correct, and note in your report that live execution is pending a real database connection — same precedent as Milestone 1's `db:migrate` step.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-reference-data.ts package.json
git commit -m "feat: add script to seed default reference data"
```

---

### Task 6: Paramètres page

**Files:**
- Create: `app/pages/plus/parametres.vue`

**Interfaces:**
- Consumes: `GET/POST /api/categories`, `GET/POST /api/envelopes`, `GET/POST /api/income-types`, `GET/POST /api/accounts`, `PATCH /api/categories/:id` etc. (Task 4).
- Produces: a working add/archive UI for all four reference lists — the first real UI screen of the app (besides login/home).

- [ ] **Step 1: Write `app/pages/plus/parametres.vue`**

```vue
<script setup lang="ts">
interface ReferenceItem {
  id: string
  name: string
  emoji: string
}

const categories = ref<ReferenceItem[]>([])
const envelopes = ref<ReferenceItem[]>([])
const incomeTypes = ref<ReferenceItem[]>([])
const accounts = ref<ReferenceItem[]>([])

async function loadAll() {
  categories.value = await $fetch('/api/categories')
  envelopes.value = await $fetch('/api/envelopes')
  incomeTypes.value = await $fetch('/api/income-types')
  accounts.value = await $fetch('/api/accounts')
}

await loadAll()

const newCategory = reactive({ name: '', emoji: '' })
const newEnvelope = reactive({ name: '', emoji: '' })
const newIncomeType = reactive({ name: '', emoji: '' })
const newAccount = reactive({ name: '', emoji: '' })

async function addCategory() {
  if (!newCategory.name || !newCategory.emoji) return
  await $fetch('/api/categories', {
    method: 'POST',
    body: { name: newCategory.name, emoji: newCategory.emoji, isFixed: false },
  })
  newCategory.name = ''
  newCategory.emoji = ''
  await loadAll()
}

async function addEnvelope() {
  if (!newEnvelope.name || !newEnvelope.emoji) return
  await $fetch('/api/envelopes', {
    method: 'POST',
    body: { name: newEnvelope.name, emoji: newEnvelope.emoji, kind: 'budget', defaultCeiling: 0 },
  })
  newEnvelope.name = ''
  newEnvelope.emoji = ''
  await loadAll()
}

async function addIncomeType() {
  if (!newIncomeType.name || !newIncomeType.emoji) return
  await $fetch('/api/income-types', {
    method: 'POST',
    body: { name: newIncomeType.name, emoji: newIncomeType.emoji },
  })
  newIncomeType.name = ''
  newIncomeType.emoji = ''
  await loadAll()
}

async function addAccount() {
  if (!newAccount.name || !newAccount.emoji) return
  await $fetch('/api/accounts', {
    method: 'POST',
    body: { name: newAccount.name, emoji: newAccount.emoji },
  })
  newAccount.name = ''
  newAccount.emoji = ''
  await loadAll()
}

async function archive(endpoint: string, id: string) {
  await $fetch(`${endpoint}/${id}`, {
    method: 'PATCH',
    body: { archivedAt: new Date().toISOString() },
  })
  await loadAll()
}
</script>

<template>
  <div class="min-h-screen bg-app-bg p-5 pb-28">
    <h1 class="text-xl font-extrabold text-ink">⚙️ Listes et paramètres</h1>
    <p class="mt-1 text-xs font-medium text-ink-muted">
      Modifié ici, disponible partout : saisie, budget mensuel, enveloppes.
    </p>

    <section class="mt-4 rounded-[22px] bg-white p-4">
      <h2 class="text-[13.5px] font-extrabold text-ink">📂 Catégories</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="category in categories"
          :key="category.id"
          class="flex items-center gap-1 rounded-full bg-app-bg px-3 py-2 text-[11.5px] font-semibold text-ink"
        >
          {{ category.emoji }} {{ category.name }}
          <button type="button" class="text-ink-faint" @click="archive('/api/categories', category.id)">×</button>
        </span>
      </div>
      <div class="mt-3 flex gap-2">
        <input v-model="newCategory.emoji" placeholder="🛒" class="w-12 rounded-lg border border-divider px-2 py-1 text-center">
        <input v-model="newCategory.name" placeholder="Nouvelle catégorie" class="flex-1 rounded-lg border border-divider px-2 py-1">
        <button type="button" class="rounded-lg bg-ink px-3 py-1 text-white" @click="addCategory">Ajouter</button>
      </div>
    </section>

    <section class="mt-4 rounded-[22px] bg-white p-4">
      <h2 class="text-[13.5px] font-extrabold text-ink">👜 Enveloppes</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="envelope in envelopes"
          :key="envelope.id"
          class="flex items-center gap-1 rounded-full bg-app-bg px-3 py-2 text-[11.5px] font-semibold text-ink"
        >
          {{ envelope.emoji }} {{ envelope.name }}
          <button type="button" class="text-ink-faint" @click="archive('/api/envelopes', envelope.id)">×</button>
        </span>
      </div>
      <div class="mt-3 flex gap-2">
        <input v-model="newEnvelope.emoji" placeholder="👜" class="w-12 rounded-lg border border-divider px-2 py-1 text-center">
        <input v-model="newEnvelope.name" placeholder="Nouvelle enveloppe" class="flex-1 rounded-lg border border-divider px-2 py-1">
        <button type="button" class="rounded-lg bg-ink px-3 py-1 text-white" @click="addEnvelope">Ajouter</button>
      </div>
    </section>

    <section class="mt-4 rounded-[22px] bg-white p-4">
      <h2 class="text-[13.5px] font-extrabold text-ink">💰 Types de revenus</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="incomeType in incomeTypes"
          :key="incomeType.id"
          class="flex items-center gap-1 rounded-full bg-app-bg px-3 py-2 text-[11.5px] font-semibold text-ink"
        >
          {{ incomeType.emoji }} {{ incomeType.name }}
          <button type="button" class="text-ink-faint" @click="archive('/api/income-types', incomeType.id)">×</button>
        </span>
      </div>
      <div class="mt-3 flex gap-2">
        <input v-model="newIncomeType.emoji" placeholder="💰" class="w-12 rounded-lg border border-divider px-2 py-1 text-center">
        <input v-model="newIncomeType.name" placeholder="Nouveau type" class="flex-1 rounded-lg border border-divider px-2 py-1">
        <button type="button" class="rounded-lg bg-ink px-3 py-1 text-white" @click="addIncomeType">Ajouter</button>
      </div>
    </section>

    <section class="mt-4 rounded-[22px] bg-white p-4">
      <h2 class="text-[13.5px] font-extrabold text-ink">🏦 Comptes</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="account in accounts"
          :key="account.id"
          class="flex items-center gap-1 rounded-full bg-app-bg px-3 py-2 text-[11.5px] font-semibold text-ink"
        >
          {{ account.emoji }} {{ account.name }}
          <button type="button" class="text-ink-faint" @click="archive('/api/accounts', account.id)">×</button>
        </span>
      </div>
      <div class="mt-3 flex gap-2">
        <input v-model="newAccount.emoji" placeholder="🏦" class="w-12 rounded-lg border border-divider px-2 py-1 text-center">
        <input v-model="newAccount.name" placeholder="Nouveau compte" class="flex-1 rounded-lg border border-divider px-2 py-1">
        <button type="button" class="rounded-lg bg-ink px-3 py-1 text-white" @click="addAccount">Ajouter</button>
      </div>
    </section>
  </div>
</template>
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 3: Manually verify against the real API**

This page needs the auth middleware and a real session to load (it calls the same protected APIs as everything else). Run `npm run dev`, log in, navigate to `http://localhost:3000/plus/parametres`, and confirm the four sections render with the seeded data from Task 5, and that adding a category via the form makes it appear in the list.

- [ ] **Step 4: Commit**

```bash
git add app/pages/plus/parametres.vue
git commit -m "feat: add Paramètres page for managing reference data"
```

---

### Task 7: Expense entry (Sortie)

**Files:**
- Create: `shared/schemas/expenseEntry.ts`
- Create: `server/api/expenses/index.post.ts`
- Create: `app/components/entry/ExpenseForm.vue`
- Test: `tests/unit/server/schemas/expenseEntry.test.ts`

**Interfaces:**
- Consumes: `useAmountInput` (Task 3), `NumericKeypad`, `EntryFormRow`, `PillSelector` (Tasks 2–3), `requireUser`/`insertRow` (Milestone 1 / Task 4), `expenseEntries`/`categories`/`accounts`/`envelopes` tables from `drizzle/schema`.
- Produces: `<ExpenseForm @saved="...">` — mounted by `EntrySheet.vue` in Task 10. `POST /api/expenses`.

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/unit/server/schemas/expenseEntry.test.ts
import { describe, it, expect } from 'vitest'
import { expenseEntryInputSchema } from '../../../../shared/schemas/expenseEntry'

describe('expenseEntryInputSchema', () => {
  const validInput = {
    date: '2026-09-18',
    categoryId: '11111111-1111-1111-1111-111111111111',
    label: 'Monoprix',
    amount: 62.4,
    accountId: '22222222-2222-2222-2222-222222222222',
    envelopeId: null,
    financedBy: 'budget' as const,
  }

  it('accepts a valid expense', () => {
    expect(() => expenseEntryInputSchema.parse(validInput)).not.toThrow()
  })

  it('defaults financedBy to budget when omitted', () => {
    const { financedBy, ...rest } = validInput
    const result = expenseEntryInputSchema.parse(rest)
    expect(result.financedBy).toBe('budget')
  })

  it('rejects a non-positive amount', () => {
    expect(() => expenseEntryInputSchema.parse({ ...validInput, amount: 0 })).toThrow()
  })

  it('rejects a missing categoryId', () => {
    const { categoryId, ...rest } = validInput
    expect(() => expenseEntryInputSchema.parse(rest)).toThrow()
  })

  it('rejects an invalid financedBy value', () => {
    expect(() => expenseEntryInputSchema.parse({ ...validInput, financedBy: 'not_a_real_value' })).toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/server/schemas/expenseEntry.test.ts`
Expected: FAIL — `Cannot find module '../../../../shared/schemas/expenseEntry'`.

- [ ] **Step 3: Write `shared/schemas/expenseEntry.ts`**

```ts
import { z } from 'zod'

export const expenseEntryInputSchema = z.object({
  date: z.string().min(1),
  categoryId: z.string().uuid(),
  label: z.string().min(1),
  amount: z.number().positive(),
  accountId: z.string().uuid().nullable().optional(),
  envelopeId: z.string().uuid().nullable().optional(),
  financedBy: z.enum(['budget', 'gift_given', 'gift_received']).default('budget'),
})

export type ExpenseEntryInput = z.infer<typeof expenseEntryInputSchema>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/server/schemas/expenseEntry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write `server/api/expenses/index.post.ts`**

```ts
import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { expenseEntries } from '../../../drizzle/schema'
import { expenseEntryInputSchema } from '../../../shared/schemas/expenseEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = expenseEntryInputSchema.parse(body)

  const entryDate = new Date(input.date)

  const [row] = await db
    .insert(expenseEntries)
    .values({
      date: input.date,
      categoryId: input.categoryId,
      label: input.label,
      amount: String(input.amount),
      accountId: input.accountId ?? null,
      envelopeId: input.envelopeId ?? null,
      financedBy: input.financedBy,
      monthAssigned: entryDate.getMonth() + 1,
      yearAssigned: entryDate.getFullYear(),
    })
    .returning()

  return row
})
```

- [ ] **Step 6: Write `app/components/entry/ExpenseForm.vue`**

```vue
<script setup lang="ts">
interface ReferenceItem {
  id: string
  name: string
  emoji: string
}

const emit = defineEmits<{ saved: [] }>()

const categories = ref<ReferenceItem[]>([])
const accounts = ref<ReferenceItem[]>([])
const envelopes = ref<ReferenceItem[]>([])

categories.value = await $fetch('/api/categories')
accounts.value = await $fetch('/api/accounts')
envelopes.value = await $fetch('/api/envelopes')

const { displayValue, amount, pressDigit, pressComma, backspace } = useAmountInput()

const categoryId = ref(categories.value[0]?.id ?? '')
const label = ref('')
const date = ref(new Date().toISOString().slice(0, 10))
const accountId = ref(accounts.value[0]?.id ?? '')
const envelopeId = ref<string>('')
const financedBy = ref<'budget' | 'gift_given' | 'gift_received'>('budget')

const financedByOptions = [
  { value: 'budget', label: 'Budget du mois' },
  { value: 'gift_given', label: "Cadeau que j'offre" },
  { value: 'gift_received', label: 'Argent de cadeau reçu' },
]

const reserveEnvelope = computed(() => envelopes.value.find((envelope: any) => envelope.kind === 'reserve'))

async function submit() {
  await $fetch('/api/expenses', {
    method: 'POST',
    body: {
      date: date.value,
      categoryId: categoryId.value,
      label: label.value,
      amount: amount.value,
      accountId: financedBy.value === 'gift_received' ? null : (accountId.value || null),
      envelopeId: financedBy.value === 'gift_received' ? (reserveEnvelope.value?.id ?? null) : (envelopeId.value || null),
      financedBy: financedBy.value,
    },
  })
  emit('saved')
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="text-center">
      <p class="text-[40px] font-extrabold tracking-tight text-ink">{{ displayValue }} <span class="text-ink-muted">€</span></p>
    </div>

    <div class="rounded-[22px] bg-white px-4">
      <EntryFormRow label="Catégorie">
        <select v-model="categoryId" class="bg-transparent text-right font-bold text-ink">
          <option v-for="category in categories" :key="category.id" :value="category.id">
            {{ category.emoji }} {{ category.name }}
          </option>
        </select>
      </EntryFormRow>
      <EntryFormRow label="Libellé">
        <input v-model="label" class="bg-transparent text-right font-bold text-ink" placeholder="Monoprix">
      </EntryFormRow>
      <EntryFormRow label="Date">
        <input v-model="date" type="date" class="bg-transparent text-right font-bold text-ink">
      </EntryFormRow>
      <EntryFormRow label="Enveloppe associée">
        <select v-model="envelopeId" class="bg-transparent text-right font-bold text-ink">
          <option value="">Aucune</option>
          <option v-for="envelope in envelopes" :key="envelope.id" :value="envelope.id">
            {{ envelope.emoji }} {{ envelope.name }}
          </option>
        </select>
      </EntryFormRow>
    </div>

    <div class="rounded-[22px] bg-white p-4">
      <p class="text-[12.5px] font-bold text-ink">Financé par</p>
      <div class="mt-3">
        <PillSelector :options="financedByOptions" :model-value="financedBy" @update:model-value="financedBy = $event as typeof financedBy" />
      </div>
      <p v-if="financedBy === 'gift_received'" class="mt-3 text-[11.5px] font-medium text-ink-muted">
        Imputé sur l'enveloppe Anniversaire et fêtes, hors budget
      </p>
    </div>

    <NumericKeypad @digit="pressDigit" @comma="pressComma" @backspace="backspace" />

    <button type="button" class="rounded-[18px] bg-ink py-[14px] text-center text-[14.5px] font-bold text-white" @click="submit">
      Enregistrer la sortie
    </button>
  </div>
</template>
```

- [ ] **Step 7: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors. (This component isn't mounted anywhere yet — full interactive verification happens in Task 10.)

- [ ] **Step 8: Commit**

```bash
git add shared/schemas/expenseEntry.ts server/api/expenses tests/unit/server/schemas/expenseEntry.test.ts app/components/entry/ExpenseForm.vue
git commit -m "feat: add expense entry form and API"
```

---

### Task 8: Income entry (Entrée)

**Files:**
- Create: `shared/schemas/incomeEntry.ts`
- Create: `server/api/incomes/index.post.ts`
- Create: `app/components/entry/IncomeForm.vue`

**Interfaces:**
- Consumes: same shared components as Task 7, plus `incomeEntries`/`incomeTypes` tables from `drizzle/schema`.
- Produces: `<IncomeForm @saved="...">` — mounted by `EntrySheet.vue` in Task 10. `POST /api/incomes`.

- [ ] **Step 1: Write `shared/schemas/incomeEntry.ts`**

```ts
import { z } from 'zod'

export const incomeEntryInputSchema = z.object({
  incomeTypeId: z.string().uuid(),
  label: z.string().min(1),
  amount: z.number().positive(),
  dateReceived: z.string().min(1),
  monthAssigned: z.number().int().min(1).max(12),
  yearAssigned: z.number().int().min(2000),
  detailsText: z.string().nullable().optional(),
  targetEnvelopeId: z.string().uuid().nullable().optional(),
})

export type IncomeEntryInput = z.infer<typeof incomeEntryInputSchema>
```

- [ ] **Step 2: Write the passing test alongside it**

```ts
// tests/unit/server/schemas/incomeEntry.test.ts
import { describe, it, expect } from 'vitest'
import { incomeEntryInputSchema } from '../../../../shared/schemas/incomeEntry'

describe('incomeEntryInputSchema', () => {
  const validInput = {
    incomeTypeId: '11111111-1111-1111-1111-111111111111',
    label: 'Coline — Airbnb',
    amount: 210,
    dateReceived: '2026-09-17',
    monthAssigned: 9,
    yearAssigned: 2026,
    detailsText: null,
    targetEnvelopeId: '22222222-2222-2222-2222-222222222222',
  }

  it('accepts a valid income', () => {
    expect(() => incomeEntryInputSchema.parse(validInput)).not.toThrow()
  })

  it('rejects a month outside 1-12', () => {
    expect(() => incomeEntryInputSchema.parse({ ...validInput, monthAssigned: 13 })).toThrow()
  })

  it('rejects a non-positive amount', () => {
    expect(() => incomeEntryInputSchema.parse({ ...validInput, amount: -5 })).toThrow()
  })
})
```

Run: `npx vitest run tests/unit/server/schemas/incomeEntry.test.ts`
Expected: PASS (3 tests) — written straight to green since the schema is a direct sibling of Task 7's already-proven pattern; the value here is the regression coverage, not a red/green cycle on genuinely new logic.

- [ ] **Step 3: Write `server/api/incomes/index.post.ts`**

```ts
import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { incomeEntries } from '../../../drizzle/schema'
import { incomeEntryInputSchema } from '../../../shared/schemas/incomeEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = incomeEntryInputSchema.parse(body)

  const [row] = await db
    .insert(incomeEntries)
    .values({
      incomeTypeId: input.incomeTypeId,
      label: input.label,
      amount: String(input.amount),
      dateReceived: input.dateReceived,
      monthAssigned: input.monthAssigned,
      yearAssigned: input.yearAssigned,
      detailsText: input.detailsText ?? null,
      targetEnvelopeId: input.targetEnvelopeId ?? null,
    })
    .returning()

  return row
})
```

- [ ] **Step 4: Write `app/components/entry/IncomeForm.vue`**

```vue
<script setup lang="ts">
interface ReferenceItem {
  id: string
  name: string
  emoji: string
  requiresDetailsText?: boolean
}

const emit = defineEmits<{ saved: [] }>()

const incomeTypes = ref<ReferenceItem[]>([])
const envelopes = ref<ReferenceItem[]>([])

incomeTypes.value = await $fetch('/api/income-types')
envelopes.value = await $fetch('/api/envelopes')

const { displayValue, amount, pressDigit, pressComma, backspace } = useAmountInput()

const incomeTypeId = ref(incomeTypes.value[0]?.id ?? '')
const label = ref('')
const dateReceived = ref(new Date().toISOString().slice(0, 10))
const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const now = new Date()
const monthAssigned = ref(now.getMonth() + 1)
const yearAssigned = ref(now.getFullYear())
const detailsText = ref('')
const targetEnvelopeId = ref('')

const selectedIncomeType = computed(() => incomeTypes.value.find((incomeType: any) => incomeType.id === incomeTypeId.value))

async function submit() {
  await $fetch('/api/incomes', {
    method: 'POST',
    body: {
      incomeTypeId: incomeTypeId.value,
      label: label.value,
      amount: amount.value,
      dateReceived: dateReceived.value,
      monthAssigned: monthAssigned.value,
      yearAssigned: yearAssigned.value,
      detailsText: selectedIncomeType.value?.requiresDetailsText ? detailsText.value : null,
      targetEnvelopeId: targetEnvelopeId.value || null,
    },
  })
  emit('saved')
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="text-center">
      <p class="text-[40px] font-extrabold tracking-tight text-ink">+ {{ displayValue }} <span class="text-ink-muted">€</span></p>
    </div>

    <div class="rounded-[22px] bg-white px-4">
      <EntryFormRow label="Type de revenu">
        <select v-model="incomeTypeId" class="bg-transparent text-right font-bold text-ink">
          <option v-for="incomeType in incomeTypes" :key="incomeType.id" :value="incomeType.id">
            {{ incomeType.emoji }} {{ incomeType.name }}
          </option>
        </select>
      </EntryFormRow>
      <EntryFormRow v-if="selectedIncomeType?.requiresDetailsText" label="Détails">
        <input v-model="detailsText" class="bg-transparent text-right font-bold text-ink" placeholder="ex. vente Vinted">
      </EntryFormRow>
      <EntryFormRow label="Libellé">
        <input v-model="label" class="bg-transparent text-right font-bold text-ink" placeholder="Coline — Airbnb">
      </EntryFormRow>
      <EntryFormRow label="Date reçue">
        <input v-model="dateReceived" type="date" class="bg-transparent text-right font-bold text-ink">
      </EntryFormRow>
      <EntryFormRow label="Mois d'affectation">
        <select v-model.number="monthAssigned" class="bg-transparent text-right font-bold text-ink">
          <option v-for="(monthName, index) in monthNames" :key="monthName" :value="index + 1">{{ monthName }}</option>
        </select>
      </EntryFormRow>
      <EntryFormRow label="Diriger vers une enveloppe">
        <select v-model="targetEnvelopeId" class="bg-transparent text-right font-bold text-ink">
          <option value="">Aucune</option>
          <option v-for="envelope in envelopes" :key="envelope.id" :value="envelope.id">
            {{ envelope.emoji }} {{ envelope.name }}
          </option>
        </select>
      </EntryFormRow>
    </div>

    <NumericKeypad @digit="pressDigit" @comma="pressComma" @backspace="backspace" />

    <button type="button" class="rounded-[18px] bg-ink py-[14px] text-center text-[14.5px] font-bold text-white" @click="submit">
      Enregistrer l'entrée
    </button>
  </div>
</template>
```

- [ ] **Step 5: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 6: Commit**

```bash
git add shared/schemas/incomeEntry.ts server/api/incomes tests/unit/server/schemas/incomeEntry.test.ts app/components/entry/IncomeForm.vue
git commit -m "feat: add income entry form and API"
```

---

### Task 9: Transfer entry (Transfert)

**Files:**
- Create: `shared/schemas/transfer.ts`
- Create: `server/api/transfers/index.post.ts`
- Create: `app/components/entry/TransferForm.vue`
- Test: `tests/unit/server/schemas/transfer.test.ts`

**Interfaces:**
- Consumes: same shared components as Tasks 7–8, plus `transfers`/`envelopes` tables from `drizzle/schema`.
- Produces: `<TransferForm @saved="...">` — mounted by `EntrySheet.vue` in Task 10. `POST /api/transfers`.

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/unit/server/schemas/transfer.test.ts
import { describe, it, expect } from 'vitest'
import { transferInputSchema } from '../../../../shared/schemas/transfer'

describe('transferInputSchema', () => {
  const validInput = {
    fromEnvelopeId: '11111111-1111-1111-1111-111111111111',
    toEnvelopeId: '22222222-2222-2222-2222-222222222222',
    amount: 20,
    reason: "Dîner d'anniversaire",
  }

  it('accepts a valid transfer', () => {
    expect(() => transferInputSchema.parse(validInput)).not.toThrow()
  })

  it('rejects a transfer from an envelope to itself', () => {
    expect(() => transferInputSchema.parse({ ...validInput, toEnvelopeId: validInput.fromEnvelopeId })).toThrow()
  })

  it('rejects a non-positive amount', () => {
    expect(() => transferInputSchema.parse({ ...validInput, amount: 0 })).toThrow()
  })

  it('rejects an empty reason', () => {
    expect(() => transferInputSchema.parse({ ...validInput, reason: '' })).toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/server/schemas/transfer.test.ts`
Expected: FAIL — `Cannot find module '../../../../shared/schemas/transfer'`.

- [ ] **Step 3: Write `shared/schemas/transfer.ts`**

```ts
import { z } from 'zod'

export const transferInputSchema = z
  .object({
    fromEnvelopeId: z.string().uuid(),
    toEnvelopeId: z.string().uuid(),
    amount: z.number().positive(),
    reason: z.string().min(1),
  })
  .refine((data) => data.fromEnvelopeId !== data.toEnvelopeId, {
    message: 'fromEnvelopeId and toEnvelopeId must differ',
    path: ['toEnvelopeId'],
  })

export type TransferInput = z.infer<typeof transferInputSchema>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/server/schemas/transfer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write `server/api/transfers/index.post.ts`**

```ts
import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { transfers } from '../../../drizzle/schema'
import { transferInputSchema } from '../../../shared/schemas/transfer'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = transferInputSchema.parse(body)

  // Derive date/month/year from the same UTC-based ISO string, not from
  // Date's local-timezone getters — mixing UTC parsing with local getters
  // causes an off-by-one near month boundaries on hosts running behind UTC.
  const isoDate = new Date().toISOString().slice(0, 10)
  const [transferYear, transferMonth] = isoDate.split('-').map(Number)

  const [row] = await db
    .insert(transfers)
    .values({
      date: isoDate,
      fromEnvelopeId: input.fromEnvelopeId,
      toEnvelopeId: input.toEnvelopeId,
      amount: String(input.amount),
      reason: input.reason,
      monthAssigned: transferMonth,
      yearAssigned: transferYear,
    })
    .returning()

  return row
})
```

- [ ] **Step 6: Write `app/components/entry/TransferForm.vue`**

```vue
<script setup lang="ts">
interface ReferenceItem {
  id: string
  name: string
  emoji: string
}

const emit = defineEmits<{ saved: [] }>()

const envelopes = ref<ReferenceItem[]>([])
envelopes.value = await $fetch('/api/envelopes')

const { displayValue, amount, pressDigit, pressComma, backspace } = useAmountInput()

const fromEnvelopeId = ref(envelopes.value[0]?.id ?? '')
const toEnvelopeId = ref(envelopes.value[1]?.id ?? '')
const reason = ref('')

async function submit() {
  await $fetch('/api/transfers', {
    method: 'POST',
    body: {
      fromEnvelopeId: fromEnvelopeId.value,
      toEnvelopeId: toEnvelopeId.value,
      amount: amount.value,
      reason: reason.value,
    },
  })
  emit('saved')
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="text-center">
      <p class="text-[40px] font-extrabold tracking-tight text-ink">{{ displayValue }} <span class="text-ink-muted">€</span></p>
      <p class="mt-1 text-[12px] font-medium text-ink-muted">Entre deux enveloppes</p>
    </div>

    <div class="rounded-[22px] bg-white px-4">
      <EntryFormRow label="Retirer à">
        <select v-model="fromEnvelopeId" class="bg-transparent text-right font-bold text-ink">
          <option v-for="envelope in envelopes" :key="envelope.id" :value="envelope.id">
            {{ envelope.emoji }} {{ envelope.name }}
          </option>
        </select>
      </EntryFormRow>
      <EntryFormRow label="Ajouter à">
        <select v-model="toEnvelopeId" class="bg-transparent text-right font-bold text-ink">
          <option v-for="envelope in envelopes" :key="envelope.id" :value="envelope.id">
            {{ envelope.emoji }} {{ envelope.name }}
          </option>
        </select>
      </EntryFormRow>
      <EntryFormRow label="Motif">
        <input v-model="reason" class="bg-transparent text-right font-bold text-ink" placeholder="Dîner d'anniversaire">
      </EntryFormRow>
    </div>

    <p class="text-center text-[11.5px] font-medium text-ink-muted">Portée : ce mois seulement</p>

    <NumericKeypad @digit="pressDigit" @comma="pressComma" @backspace="backspace" />

    <button type="button" class="rounded-[18px] bg-ink py-[14px] text-center text-[14.5px] font-bold text-white" @click="submit">
      Valider le transfert
    </button>
  </div>
</template>
```

- [ ] **Step 7: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 8: Commit**

```bash
git add shared/schemas/transfer.ts server/api/transfers tests/unit/server/schemas/transfer.test.ts app/components/entry/TransferForm.vue
git commit -m "feat: add transfer form and API"
```

---

### Task 10: App shell, entry sheet assembly, and end-to-end test

**Files:**
- Create: `app/composables/useEntrySheet.ts`
- Create: `app/components/EntrySheet.vue`
- Create: `app/layouts/default.vue`
- Modify: `app/app.vue` (wrap `<NuxtPage />` in `<NuxtLayout>` — without this, Nuxt never applies `layouts/default.vue` at all)
- Modify: `app/pages/index.vue` (use the new layout — remove its own logout button's ad hoc styling if it clashes; keep its existing content otherwise)
- Test: `tests/e2e/entry.spec.ts`

**Interfaces:**
- Consumes: `SegmentedToggle` (Task 2), `ExpenseForm`/`IncomeForm`/`TransferForm` (Tasks 7–9).
- Produces: `useEntrySheet()` returning `{ isOpen, open, close }` — a global singleton state any page can call to open the entry sheet via the FAB. This is the final assembly task; nothing downstream in this milestone depends on it.

- [ ] **Step 1: Write `app/composables/useEntrySheet.ts`**

```ts
export function useEntrySheet() {
  const isOpen = useState('entry-sheet-open', () => false)

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  return { isOpen, open, close }
}
```

- [ ] **Step 2: Write `app/components/EntrySheet.vue`**

```vue
<script setup lang="ts">
const { isOpen, close } = useEntrySheet()

const mode = ref<'expense' | 'income' | 'transfer'>('expense')

const modeOptions = [
  { value: 'expense', label: '− Sortie' },
  { value: 'income', label: '+ Entrée' },
  { value: 'transfer', label: '⇄ Transfert' },
]

function handleSaved() {
  close()
  mode.value = 'expense'
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-end justify-center bg-black/30">
    <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[40px] bg-app-bg p-5">
      <div class="flex items-center justify-between">
        <button type="button" class="text-[13px] font-bold text-ink-muted" @click="close">Annuler</button>
        <p class="text-[15px] font-extrabold text-ink">Nouvelle ligne</p>
        <span class="w-[52px]" />
      </div>

      <div class="mt-4">
        <SegmentedToggle :options="modeOptions" :model-value="mode" @update:model-value="mode = $event as typeof mode" />
      </div>

      <div class="mt-4">
        <ExpenseForm v-if="mode === 'expense'" @saved="handleSaved" />
        <IncomeForm v-else-if="mode === 'income'" @saved="handleSaved" />
        <TransferForm v-else @saved="handleSaved" />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Write `app/layouts/default.vue`**

```vue
<script setup lang="ts">
const { open } = useEntrySheet()
const route = useRoute()

const navItems = [
  { path: '/', label: 'Accueil' },
  { path: '/enveloppes', label: 'Enveloppes' },
  { path: '/epargne', label: 'Épargne' },
  { path: '/plus/parametres', label: 'Plus' },
]
</script>

<template>
  <div class="min-h-screen bg-app-bg">
    <slot />

    <nav class="fixed inset-x-0 bottom-0 flex items-end border-t border-divider bg-white px-3 pb-6 pt-3">
      <NuxtLink
        v-for="item in navItems.slice(0, 2)"
        :key="item.path"
        :to="item.path"
        class="flex flex-1 flex-col items-center gap-1 text-[10px] font-semibold"
        :class="route.path === item.path ? 'text-ink' : 'text-ink-muted'"
      >
        {{ item.label }}
      </NuxtLink>

      <div class="flex w-[52px] items-start justify-center pb-2">
        <button
          type="button"
          class="flex size-[50px] items-center justify-center rounded-full bg-ink text-[28px] text-white"
          @click="open"
        >
          +
        </button>
      </div>

      <NuxtLink
        v-for="item in navItems.slice(2)"
        :key="item.path"
        :to="item.path"
        class="flex flex-1 flex-col items-center gap-1 text-[10px] font-semibold"
        :class="route.path === item.path ? 'text-ink' : 'text-ink-muted'"
      >
        {{ item.label }}
      </NuxtLink>
    </nav>

    <EntrySheet />
  </div>
</template>
```

Note: `/enveloppes` and `/epargne` routes don't exist yet (later milestones) — `NuxtLink` to a non-existent route in Nuxt doesn't error at build time, it 404s at navigation time, which is acceptable for this milestone since those tabs aren't functional yet.

- [ ] **Step 4: Modify `app/app.vue` to actually apply the layout**

Nuxt only wraps pages in `layouts/default.vue` when `app.vue` explicitly uses `<NuxtLayout>` — defining the layout file alone does nothing. Replace the file's content:

```vue
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

- [ ] **Step 5: Modify `app/pages/index.vue`**

Read the current file first, then replace its content with the same logic wrapped for the new layout (Nuxt applies `layouts/default.vue` automatically to every page unless a different layout is set, so no explicit `<NuxtLayout>` change is needed in the page itself — this step only needs to happen if the current `index.vue` has styling that visually conflicts with the new bottom nav, e.g. its own full-height background). Update the wrapping `<div>`'s classes to leave room for the bottom nav:

```vue
<script setup lang="ts">
const supabase = useSupabaseClient()
const { data: health } = await useFetch('/api/health')

async function handleLogout() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-app-bg p-8 pb-28">
    <h1 class="text-2xl font-semibold text-gray-900">Connecté 🎉</h1>
    <p v-if="health" class="mt-2 text-gray-700">Session vérifiée côté serveur pour {{ health.userId }}</p>
    <button class="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-white" @click="handleLogout">
      Se déconnecter
    </button>
  </div>
</template>
```

(Only the wrapping `<div>`'s class changed — `min-h-screen bg-orange-50 p-8` became `min-h-screen bg-app-bg p-8 pb-28`, adding bottom padding so content isn't hidden behind the fixed nav bar. Everything else is unchanged from Milestone 1.)

- [ ] **Step 6: Build to verify everything compiles together**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 7: Write the end-to-end test**

```ts
// tests/e2e/entry.spec.ts
import { test, expect } from '@playwright/test'

test('records an expense through the entry sheet', async ({ page }) => {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

  test.skip(!email || !password || !hasRealSupabaseConfig, 'SEED_USER_EMAIL, SEED_USER_PASSWORD, SUPABASE_URL, and SUPABASE_ANON_KEY must all be set (against a real, seeded Supabase project with reference data loaded) to run this test')

  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.getByRole('button', { name: '+' }).click()
  await expect(page.getByText('Nouvelle ligne')).toBeVisible()

  await page.getByRole('button', { name: '6' }).click()
  await page.getByRole('button', { name: '2' }).click()
  await page.getByRole('button', { name: ',' }).click()
  await page.getByRole('button', { name: '4' }).click()
  await page.getByRole('button', { name: '0' }).click()

  await page.getByText("Enregistrer la sortie").click()

  await expect(page.getByText('Nouvelle ligne')).not.toBeVisible()
})

test('adds a category from the Paramètres page', async ({ page }) => {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

  test.skip(!email || !password || !hasRealSupabaseConfig, 'SEED_USER_EMAIL, SEED_USER_PASSWORD, SUPABASE_URL, and SUPABASE_ANON_KEY must all be set to run this test')

  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await page.goto('/plus/parametres')
  await page.getByPlaceholder('🛒').fill('🧪')
  await page.getByPlaceholder('Nouvelle catégorie').fill('Test E2E')
  await page.getByRole('button', { name: 'Ajouter' }).first().click()

  await expect(page.getByText('🧪 Test E2E')).toBeVisible()
})
```

- [ ] **Step 8: Run the e2e suite**

Run: `SEED_USER_EMAIL=<seeded email> SEED_USER_PASSWORD=<seeded password> SUPABASE_URL=<url> SUPABASE_ANON_KEY=<key> npm run test:e2e`
Expected: both new tests pass (or skip cleanly if the environment lacks real Supabase credentials, matching Milestone 1's precedent) alongside the existing Milestone 1 auth tests.

- [ ] **Step 9: Commit**

```bash
git add app/composables/useEntrySheet.ts app/components/EntrySheet.vue app/layouts/default.vue app/app.vue app/pages/index.vue tests/e2e/entry.spec.ts
git commit -m "feat: assemble app shell and entry sheet, add end-to-end coverage"
```

---

## Self-Review Notes

- **Spec coverage**: every item in the Milestone 2 design spec's §5 (screens & routes) and §6 (API routes) is covered by a task. The three flagged assumptions (§8) are resolved directly by this plan: entry screen is an overlay (Task 10), Paramètres is add/archive only with no rename UI (Task 6 — matches spec exactly), font is Plus Jakarta Sans via `@nuxt/fonts` (Task 1).
- **Placeholder scan**: no TBD/TODO; Task 10's note about `/enveloppes` and `/epargne` not existing yet is an explicit, documented consequence of scope (later milestones), not a gap in this one.
- **Type consistency**: `useAmountInput()`'s returned shape (`buffer`, `displayValue`, `amount`, `pressDigit`, `pressComma`, `backspace`, `reset`) is identical everywhere it's consumed (Tasks 7, 8, 9). `listActiveRows`/`insertRow`/`patchRow` signatures from Task 4 are used identically by all 12 routes. `useEntrySheet()`'s `{ isOpen, open, close }` matches between its definition (Task 10 Step 1) and its two consumers (`EntrySheet.vue`, `default.vue`, both Task 10).
