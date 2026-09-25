# Entry Panel Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the ability to add expense/income/transfer entries in the desktop shell — mount the existing `ExpenseForm`/`IncomeForm`/`TransferForm` components into a page-scoped `EntryPanel` on the Mouvements page, with a live "Après validation" ceiling-impact preview.

**Architecture:** `EntryPanel.vue` hosts a `SegmentedToggle` (Sortie/Entrée/Transfert) over the three existing form components, listening to new `amount-change`/`envelope-change` emits from each form to drive a live before/after preview against `/api/envelopes/ceilings` data. `mouvements.vue` becomes a two-column layout: the existing table on the left, `EntryPanel` on the right. This restores exactly the Milestone 4 Task 4 design (already built, reviewed, and merged once — reverted only because of an unrelated, since-diagnosed Vercel infrastructure issue, not a defect in this code), with one addition: honest `pending`/`error` states on both `mouvements.vue`'s and `EntryPanel`'s fetches, matching the pattern already used in `SidebarCeilingsWidget.vue` — a gap the first build had and a later fix closed, folded in from the start this time.

**Tech Stack:** Nuxt 4, Nuxt UI, Tailwind v4 `@theme`, Vitest. No new server routes, no domain logic — this is pure client-side wiring over the existing `/api/envelopes/ceilings` and `/api/movements` endpoints.

**Spec:** `docs/superpowers/specs/2026-09-20-desktop-web-redesign-design.md` §4.3 (Mouvements) — the `EntryPanel` paragraph.

## Global Constraints

- No hardcoded hex colors in new/modified Vue components — use Tailwind theme tokens (`ink`, `ink-muted`, `app-bg`, `toggle-track`, `divider`, `warn-ink`).
- Every `useFetch` call in a page or panel destructures `error` (and `pending` where useful) and renders a distinct, honest error branch — never silently render nothing or an empty-state message on a failed fetch. This is the exact pattern already in `app/components/SidebarCeilingsWidget.vue:11,22-28` — match it.
- `EntryPanel.vue` and `SidebarCeilingsWidget.vue` must share the exact `useFetch` key `'envelope-ceilings'` for `/api/envelopes/ceilings`, so `EntryPanel`'s `handleSaved` can call `refreshNuxtData('envelope-ceilings')` and have the sidebar widget's numbers update too.
- `app/pages/mouvements.vue`'s existing `useFetch<Movement[]>('/api/movements', { key: 'movements-feed' })` call (already present) must keep that exact key — `EntryPanel`'s `handleSaved` refreshes it by name.

---

## File Structure

```
app/
  components/
    entry/
      ExpenseForm.vue        (modify: add amount-change/envelope-change emits)
      IncomeForm.vue         (modify: add amount-change/envelope-change emits)
      TransferForm.vue       (modify: add amount-change/from-envelope-change/to-envelope-change emits)
      EntryPanel.vue         (create)
    SidebarCeilingsWidget.vue (modify: explicit useFetch key)
  pages/
    mouvements.vue           (modify: two-column layout + honest error state)
```

---

### Task 1: Entry forms emit draft state, SidebarCeilingsWidget gets an explicit fetch key

**Files:**
- Modify: `app/components/entry/ExpenseForm.vue`
- Modify: `app/components/entry/IncomeForm.vue`
- Modify: `app/components/entry/TransferForm.vue`
- Modify: `app/components/SidebarCeilingsWidget.vue`

**Interfaces:**
- Consumes: nothing new — these are the existing forms' own internal refs.
- Produces: `ExpenseForm`/`IncomeForm`/`TransferForm` now emit `'amount-change': [number]` and `'envelope-change': [string]` (`TransferForm` emits `'from-envelope-change'`/`'to-envelope-change'` instead of a single `'envelope-change'`) — consumed by `EntryPanel` (Task 2).

- [ ] **Step 1: Read the three forms' current internal ref names**

Run: `grep -n "const amount\|const envelopeId\|const targetEnvelopeId\|const fromEnvelopeId\|const toEnvelopeId" app/components/entry/ExpenseForm.vue app/components/entry/IncomeForm.vue app/components/entry/TransferForm.vue`

Confirm the exact ref names in each file before writing the `watch()` calls below — do not assume the names without checking, since a wrong name fails silently (Vue doesn't error on watching a nonexistent variable if it's merely unused, it errors at compile time only if truly undefined, so a typo here can slip through).

- [ ] **Step 2: Add emits to `ExpenseForm.vue`**

Replace the `defineEmits` line:

```ts
const emit = defineEmits<{ saved: []; 'amount-change': [number]; 'envelope-change': [string] }>()
```

Add two `watch` calls right after the existing `ref`/`computed` declarations (after the `reserveEnvelope` computed if present, before `errorMessage`):

```ts
watch(amount, (value) => emit('amount-change', value))
watch(envelopeId, (value) => emit('envelope-change', value))
```

(Use the exact ref names confirmed in Step 1 — `amount` and `envelopeId` are what Milestone 4's original implementation found, but verify against the current file.)

- [ ] **Step 3: Add emits to `IncomeForm.vue`**

Replace the `defineEmits` line:

```ts
const emit = defineEmits<{ saved: []; 'amount-change': [number]; 'envelope-change': [string] }>()
```

Add two `watch` calls after the existing declarations:

```ts
watch(amount, (value) => emit('amount-change', value))
watch(targetEnvelopeId, (value) => emit('envelope-change', value))
```

- [ ] **Step 4: Add emits to `TransferForm.vue`**

Replace the `defineEmits` line:

```ts
const emit = defineEmits<{ saved: []; 'amount-change': [number]; 'from-envelope-change': [string]; 'to-envelope-change': [string] }>()
```

Add three `watch` calls after the existing declarations:

```ts
watch(amount, (value) => emit('amount-change', value))
watch(fromEnvelopeId, (value) => emit('from-envelope-change', value))
watch(toEnvelopeId, (value) => emit('to-envelope-change', value))
```

- [ ] **Step 5: Add an explicit fetch key to `SidebarCeilingsWidget.vue`**

Change line 11 from:

```ts
const { data, error, pending } = await useFetch<EnvelopeCeiling[]>('/api/envelopes/ceilings')
```

to:

```ts
const { data, error, pending } = await useFetch<EnvelopeCeiling[]>('/api/envelopes/ceilings', { key: 'envelope-ceilings' })
```

Nothing else in this file changes — it already has correct `pending`/`error` handling (lines 22-28), which is the pattern Task 2's `EntryPanel` and this task's `mouvements.vue` changes must match.

- [ ] **Step 6: Build to verify it compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 7: Commit**

```bash
git add app/components/entry/ExpenseForm.vue app/components/entry/IncomeForm.vue app/components/entry/TransferForm.vue app/components/SidebarCeilingsWidget.vue
git commit -m "feat: add draft-state emits to entry forms, explicit fetch key to ceilings widget"
```

---

### Task 2: EntryPanel component + Mouvements page wiring

**Files:**
- Create: `app/components/entry/EntryPanel.vue`
- Modify: `app/pages/mouvements.vue`

**Interfaces:**
- Consumes: `GET /api/envelopes/ceilings` (existing); `ExpenseForm`/`IncomeForm`/`TransferForm`'s new emits (Task 1); `SegmentedToggle` (existing, `app/components/SegmentedToggle.vue`).
- Produces: `<EntryPanel @saved="...">` — mounted by the Mouvements page.

- [ ] **Step 1: Write `app/components/entry/EntryPanel.vue`**

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

const emit = defineEmits<{ saved: [] }>()

const mode = ref<'expense' | 'income' | 'transfer'>('expense')

const modeOptions = [
  { value: 'expense', label: '− Sortie' },
  { value: 'income', label: '+ Entrée' },
  { value: 'transfer', label: '⇄ Transfert' },
]

const { data: ceilingsData, error: ceilingsError } = await useFetch<EnvelopeCeiling[]>('/api/envelopes/ceilings', { key: 'envelope-ceilings' })
const ceilingsById = computed(() => new Map((ceilingsData.value ?? []).map((envelope) => [envelope.id, envelope])))

const draftAmount = ref(0)
const draftExpenseEnvelopeId = ref('')
const draftIncomeEnvelopeId = ref('')
const draftTransferFromId = ref('')
const draftTransferToId = ref('')

interface PreviewLine {
  label: string
  before: number
  after: number
  suffix: string
}

const previewLines = computed<PreviewLine[]>(() => {
  if (mode.value === 'transfer') {
    const from = ceilingsById.value.get(draftTransferFromId.value)
    const to = ceilingsById.value.get(draftTransferToId.value)
    if (!from || !to || draftAmount.value <= 0) return []
    return [
      { label: `Retirer à ${from.emoji} ${from.name}`, before: from.ceiling, after: from.ceiling - draftAmount.value, suffix: 'plafond' },
      { label: `Ajouter à ${to.emoji} ${to.name}`, before: to.ceiling, after: to.ceiling + draftAmount.value, suffix: 'plafond' },
    ]
  }

  const envelopeId = mode.value === 'expense' ? draftExpenseEnvelopeId.value : draftIncomeEnvelopeId.value
  const envelope = ceilingsById.value.get(envelopeId)
  if (!envelope || draftAmount.value <= 0) return []

  const delta = mode.value === 'expense' ? -draftAmount.value : draftAmount.value
  return [{ label: `${envelope.emoji} ${envelope.name}`, before: envelope.remaining, after: envelope.remaining + delta, suffix: 'restant' }]
})

function formatEuro(value: number) {
  return `${value.toFixed(2).replace('.', ',')} €`
}

function handleSaved() {
  refreshNuxtData('movements-feed')
  refreshNuxtData('envelope-ceilings')
  draftAmount.value = 0
  emit('saved')
}
</script>

<template>
  <div class="flex flex-col gap-4 rounded-[22px] bg-white p-5">
    <p class="text-[15px] font-extrabold text-ink">Nouvelle saisie</p>

    <SegmentedToggle :options="modeOptions" :model-value="mode" @update:model-value="mode = $event as typeof mode" />

    <ExpenseForm
      v-if="mode === 'expense'"
      @saved="handleSaved"
      @amount-change="draftAmount = $event"
      @envelope-change="draftExpenseEnvelopeId = $event"
    />
    <IncomeForm
      v-else-if="mode === 'income'"
      @saved="handleSaved"
      @amount-change="draftAmount = $event"
      @envelope-change="draftIncomeEnvelopeId = $event"
    />
    <TransferForm
      v-else
      @saved="handleSaved"
      @amount-change="draftAmount = $event"
      @from-envelope-change="draftTransferFromId = $event"
      @to-envelope-change="draftTransferToId = $event"
    />

    <p v-if="ceilingsError" class="rounded-[16px] bg-app-bg p-3 text-[11px] font-semibold text-warn-ink">
      Aperçu indisponible — impossible de charger les plafonds des enveloppes.
    </p>
    <div v-else-if="previewLines.length" class="rounded-[16px] bg-app-bg p-3">
      <p class="text-[11px] font-bold text-ink">Après validation</p>
      <div v-for="line in previewLines" :key="line.label" class="mt-1 flex items-center justify-between text-[11.5px]">
        <span class="font-semibold text-ink-muted">{{ line.label }}</span>
        <span class="font-bold text-ink">{{ formatEuro(line.before) }} → {{ formatEuro(line.after) }} {{ line.suffix }}</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Restructure `app/pages/mouvements.vue` into a two-column layout with an honest error state**

Replace the file's entire `<template>` block (the `<script setup>` block stays exactly as-is — do not touch it in this step) with:

```vue
<template>
  <div class="grid grid-cols-[1fr_360px] gap-5">
    <div class="flex flex-col gap-5">
      <PageHeader title="Mouvements">
        <template #context>
          <div class="flex gap-1 rounded-[12px] bg-toggle-track p-1">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              class="rounded-[9px] px-3 py-1.5 text-[12.5px] font-bold"
              :class="activeFilter === option.value ? 'bg-white text-ink' : 'text-ink-muted'"
              @click="activeFilter = option.value as typeof activeFilter"
            >
              {{ option.label }}
            </button>
          </div>
        </template>
        <template #actions>
          <input
            v-model="searchText"
            type="search"
            placeholder="Rechercher un mouvement…"
            class="rounded-[12px] border border-divider bg-white px-3 py-2 text-[12.5px]"
          >
        </template>
      </PageHeader>

      <div class="rounded-[22px] bg-white p-4">
        <p v-if="error" class="py-6 text-center text-[12.5px] font-semibold text-warn-ink">
          Impossible de charger les mouvements.
        </p>
        <template v-else>
          <table class="w-full text-left text-[12.5px]">
            <thead>
              <tr class="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                <th class="pb-2">Date</th>
                <th class="pb-2">Libellé</th>
                <th class="pb-2">Enveloppe</th>
                <th class="pb-2">Origine</th>
                <th class="pb-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="movement in filteredMovements" :key="movement.id" class="border-t border-divider">
                <td class="py-2.5 text-ink-muted">{{ formatDate(movement.date) }}</td>
                <td class="py-2.5 font-semibold text-ink">{{ movement.label }}</td>
                <td class="py-2.5 text-ink-muted">{{ movement.envelopeLabel }}</td>
                <td class="py-2.5 text-ink-muted">{{ movement.origin }}</td>
                <td class="py-2.5 text-right font-bold" :class="amountColorClass(movement)">{{ formatAmount(movement) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="filteredMovements.length === 0" class="py-6 text-center text-[12.5px] font-medium text-ink-muted">
            Aucun mouvement ce mois-ci.
          </p>
        </template>
      </div>
    </div>

    <EntryPanel />
  </div>
</template>
```

- [ ] **Step 3: Destructure `error` from the existing `useFetch` call in `mouvements.vue`'s `<script setup>`**

Find the existing line:

```ts
const { data } = await useFetch<Movement[]>('/api/movements', { key: 'movements-feed' })
```

Change it to:

```ts
const { data, error } = await useFetch<Movement[]>('/api/movements', { key: 'movements-feed' })
```

This is the only change to the script block — everything else (the `Movement` interface, `activeFilter`, `searchText`, `filterOptions`, `filteredMovements`, `formatAmount`, `amountColorClass`, `formatDate`) stays exactly as it already is.

- [ ] **Step 4: Build to verify everything compiles**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 5: Run the unit suite (regression check)**

Run: `npx vitest run`
Expected: PASS — this task adds no new unit-tested logic (pure UI wiring), this confirms nothing else broke.

- [ ] **Step 6: Manually verify in the browser**

Run `npm run dev`, log in, navigate to `/mouvements`. Confirm:
- The entry panel renders on the right with the Sortie/Entrée/Transfert toggle.
- Typing an amount and picking an envelope in the Sortie tab shows an "Après validation" line.
- Switching to Transfert and picking two different envelopes shows two preview lines (plafond before → after).
- Submitting a valid entry clears the panel's amount and the movements table refreshes with the new row without a page reload.
- The sidebar's Plafonds widget numbers update too after a save.

If you don't have a way to drive a browser and a working `DATABASE_URL` in this environment, it's fine to skip live manual verification — rely on build + vitest passing, and note in your report that live browser verification was not performed.

- [ ] **Step 7: Commit**

```bash
git add app/components/entry/EntryPanel.vue app/pages/mouvements.vue
git commit -m "feat: add page-scoped EntryPanel with live après-validation preview"
```

---

## Self-Review Notes

- **Spec coverage:** §4.3 Mouvements's `EntryPanel` paragraph — the toggle, live preview, and page-scoped (not modal) placement are all covered by Task 2. The "dashboard's + Nouvelle saisie and Enveloppes' Transférer both land here with the panel pre-opened to the relevant tab" detail is explicitly **not** in scope for this plan — the dashboard and Enveloppes pages don't exist yet post-revert, so there's nothing to wire that navigation from yet. That's each of those pages' own future task to add (a query param read on mount, e.g. `?mode=transfer`), not this plan's.
- **Spec deviation (found by final review, recorded here after the fact):** §4.3 also says the panel "ends with Annuler / Valider buttons." Task 2 built Valider (each form's own submit button: "Enregistrer la sortie" / "Enregistrer l'entrée" / "Valider le transfert") but no Annuler/cancel button. This is a deliberate, accepted deviation, not an oversight: the spec's original wording describes a dismissible panel, but this `EntryPanel` is always rendered on the Mouvements page (not a modal/overlay), so there's nothing to "cancel" back to — an Annuler button would just clear the current draft, which isn't a requested feature and would be scope creep for this plan. If a future plan turns this panel into something dismissible (e.g. a drawer opened from elsewhere), add Annuler then.
- **Placeholder scan:** no TBD/TODO. Every step has real code.
- **Type consistency:** `EnvelopeCeiling` (both files' local copy) matches the real `/api/envelopes/ceilings` response shape (`id, name, emoji, ceiling, netSpent, remaining`) — checked against the current `server/api/envelopes/ceilings.get.ts` response. `Movement`'s shape in `mouvements.vue` is untouched by this plan (Task 2 only adds `error` to the destructure, doesn't touch the interface).
- **Known duplication, accepted deliberately:** `EntryPanel.vue` redeclares the `EnvelopeCeiling` interface that `SidebarCeilingsWidget.vue` also declares locally. This was flagged in Milestone 4's original review as acceptable at 2 copies; it's the same 2 copies here (nothing else in this codebase currently needs this shape), so it's not re-litigated in this plan.
