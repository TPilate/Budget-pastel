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

const route = useRoute()
const initialMode = route.query.mode === 'transfer' ? 'transfer' : 'expense'
const mode = ref<'expense' | 'income' | 'transfer'>(initialMode)

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
  draftExpenseEnvelopeId.value = ''
  draftIncomeEnvelopeId.value = ''
  draftTransferFromId.value = ''
  draftTransferToId.value = ''
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
