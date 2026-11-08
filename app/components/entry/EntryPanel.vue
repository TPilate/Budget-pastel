<script setup lang="ts">
import type { TransferEndpoint } from '~~/shared/schemas/transfer'
import type { MonthContext } from '~~/server/utils/monthContext'

interface EnvelopeCeiling {
  id: string
  name: string
  emoji: string
  ceiling: number
  netSpent: number
  remaining: number
}

const emit = defineEmits<{ saved: [] }>()

const route = useRoute()
const initialMode = route.query.mode === 'transfer' || route.query.mode === 'savings' ? route.query.mode : 'expense'
const mode = ref<'expense' | 'income' | 'transfer' | 'savings'>(initialMode)

const modeOptions = [
  { value: 'expense', label: '− Sortie' },
  { value: 'income', label: '+ Entrée' },
  { value: 'transfer', label: '⇄ Transfert' },
  { value: 'savings', label: '🐷 Épargne' },
]

interface ReferenceItem {
  id: string
  name: string
  emoji: string
  requiresDetailsText?: boolean
}
type EnvelopeItem = ReferenceItem & { kind: 'budget' | 'reserve' }

interface EntryReferenceData {
  categories: ReferenceItem[]
  accounts: ReferenceItem[]
  envelopes: EnvelopeItem[]
  incomeTypes: ReferenceItem[]
  savingsGoals: { id: string, name: string }[]
}

const props = defineProps<{
  referenceData: EntryReferenceData | null
  referenceError: boolean
  budgetLibre?: number | null
  monthContext?: MonthContext | null
}>()

const selectedMonth = computed(() => props.monthContext?.selected ?? null)
const closed = computed(() => Boolean(props.monthContext?.closed))
// Forms are remounted when the month changes so their date defaults follow it.
const formKey = computed(() => selectedMonth.value ? `${selectedMonth.value.year}-${selectedMonth.value.month}` : 'none')
const entryDate = computed(() => selectedMonth.value ? defaultEntryDate(selectedMonth.value, todayLocalIso()) : todayLocalIso())

// The sidebar widget already loads the ceilings under this key on every page; reading the
// same entry avoids a second request on each visit to Mouvements.
const { data: ceilingsData } = useNuxtData<EnvelopeCeiling[]>('envelope-ceilings')
// useNuxtData exposes no error in this Nuxt version; the sidebar widget reports ceiling failures.
const ceilingsError = computed(() => false)
const referenceData = computed(() => props.referenceData)
const referenceError = computed(() => props.referenceError)

const ceilingsById = computed(() => new Map((ceilingsData.value ?? []).map((envelope) => [envelope.id, envelope])))

const categories = computed(() => referenceData.value?.categories ?? [])
const accounts = computed(() => referenceData.value?.accounts ?? [])
const envelopes = computed(() => referenceData.value?.envelopes ?? [])
const incomeTypes = computed(() => referenceData.value?.incomeTypes ?? [])
const savingsGoals = computed(() => referenceData.value?.savingsGoals ?? [])

const draftAmount = ref(0)
const draftExpenseEnvelopeId = ref('')
const draftIncomeEnvelopeId = ref('')
const draftTransferFrom = ref<TransferEndpoint | null>(null)
const draftTransferTo = ref<TransferEndpoint | null>(null)

interface PreviewLine {
  label: string
  before: number
  after: number
  suffix: string
}

const previewLines = computed<PreviewLine[]>(() => {
  if (mode.value === 'savings') return []

  if (mode.value === 'transfer') {
    if (draftAmount.value <= 0) return []
    // Preview lines exist for envelope sides only; the budget and accounts have no ceiling.
    const lines: PreviewLine[] = []
    const from = draftTransferFrom.value?.kind === 'envelope' ? ceilingsById.value.get(draftTransferFrom.value.envelopeId) : undefined
    const to = draftTransferTo.value?.kind === 'envelope' ? ceilingsById.value.get(draftTransferTo.value.envelopeId) : undefined
    if (from) lines.push({ label: `Retirer à ${from.emoji} ${from.name}`, before: from.ceiling, after: from.ceiling - draftAmount.value, suffix: 'plafond' })
    if (to) lines.push({ label: `Verser à ${to.emoji} ${to.name}`, before: to.ceiling, after: to.ceiling + draftAmount.value, suffix: 'plafond' })
    return lines
  }

  const envelopeId = mode.value === 'expense' ? draftExpenseEnvelopeId.value : draftIncomeEnvelopeId.value
  const envelope = ceilingsById.value.get(envelopeId)
  if (!envelope || draftAmount.value <= 0) return []

  const delta = mode.value === 'expense' ? -draftAmount.value : draftAmount.value
  return [{ label: `${envelope.emoji} ${envelope.name}`, before: envelope.remaining, after: envelope.remaining + delta, suffix: 'restant' }]
})

function handleSaved() {
  refreshNuxtData(['page-mouvements', 'envelope-ceilings', 'page-dashboard'])
  draftAmount.value = 0
  draftExpenseEnvelopeId.value = ''
  draftIncomeEnvelopeId.value = ''
  draftTransferFrom.value = null
  draftTransferTo.value = null
  emit('saved')
}
</script>

<template>
  <div class="flex flex-col gap-4 rounded-[22px] bg-white p-5">
    <p class="text-[15px] font-extrabold text-ink">Nouvelle saisie</p>

    <SegmentedToggle v-if="!closed" :options="modeOptions" :model-value="mode" @update:model-value="mode = $event as typeof mode" />

    <p v-if="closed && monthContext" class="rounded-[16px] bg-app-bg p-3 text-[12.5px] font-semibold text-warn-ink" data-testid="entry-closed">
      {{ monthContext.selected.label }} est clôturé — saisie impossible.
    </p>
    <p v-else-if="referenceError" class="rounded-[16px] bg-app-bg p-3 text-[11px] font-semibold text-warn-ink">
      Impossible de charger le formulaire de saisie.
    </p>
    <template v-else-if="referenceData">
      <ExpenseForm
        v-if="mode === 'expense'"
        :key="formKey"
        :default-date="entryDate"
        :categories="categories"
        :accounts="accounts"
        :envelopes="envelopes"
        @saved="handleSaved"
        @amount-change="draftAmount = $event"
        @envelope-change="draftExpenseEnvelopeId = $event"
      />
      <IncomeForm
        v-else-if="mode === 'income'"
        :key="formKey"
        :default-date="entryDate"
        :default-month="selectedMonth ?? undefined"
        :income-types="incomeTypes"
        :envelopes="envelopes"
        @saved="handleSaved"
        @amount-change="draftAmount = $event"
        @envelope-change="draftIncomeEnvelopeId = $event"
      />
      <TransferForm
        v-else-if="mode === 'transfer'"
        :key="formKey"
        :envelopes="envelopes"
        :accounts="accounts"
        :budget-libre="budgetLibre ?? null"
        :default-date="entryDate"
        @saved="handleSaved"
        @amount-change="draftAmount = $event"
        @from-change="draftTransferFrom = $event"
        @to-change="draftTransferTo = $event"
      />
      <SavingsForm
        v-else
        :key="formKey"
        :default-date="entryDate"
        :goals="savingsGoals"
        @saved="handleSaved"
        @amount-change="draftAmount = $event"
      />
    </template>
    <p v-else class="rounded-[16px] bg-app-bg p-3 text-[11px] font-semibold text-ink-muted" data-testid="entry-loading">
      Chargement du formulaire…
    </p>

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
