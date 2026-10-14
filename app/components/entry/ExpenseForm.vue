<script setup lang="ts">
import type { ExpenseEntryInput } from '~~/shared/schemas/expenseEntry'

interface ReferenceItem {
  id: string
  name: string
  emoji: string
}

const emit = defineEmits<{ saved: []; 'amount-change': [number]; 'envelope-change': [string] }>()

// Reference data is fetched once by EntryPanel and passed down, rather than each form
// fetching its own: every endpoint pays for its own auth round-trip to Supabase, so
// per-form fetching made a single page render cost several extra round-trips.
const props = defineProps<{
  categories: ReferenceItem[]
  accounts: ReferenceItem[]
  envelopes: ReferenceItem[]
  editing?: { id: string, fields: ExpenseEntryInput } | null
}>()
const initial = props.editing?.fields

const categories = computed(() => props.categories)
const accounts = computed(() => props.accounts)
const envelopes = computed(() => props.envelopes)

const { displayValue, amount, pressDigit, pressComma, backspace } = useAmountInput(initial ? amountToBuffer(initial.amount) : '0')

const categoryId = ref(initial?.categoryId ?? categories.value[0]?.id ?? '')
const label = ref(initial?.label ?? '')
const date = ref(initial?.date ?? new Date().toISOString().slice(0, 10))
const accountId = ref(initial?.accountId ?? accounts.value[0]?.id ?? '')
const financedBy = ref<'budget' | 'gift_given' | 'gift_received'>(initial?.financedBy ?? 'budget')
// A gift_received expense is stored against the reserve envelope; the form derives that
// itself, so the envelope picker starts empty for it.
const envelopeId = ref<string>(initial && initial.financedBy !== 'gift_received' ? (initial.envelopeId ?? '') : '')

const needsCategory = computed(() => expenseNeedsCategory(envelopeId.value, financedBy.value))

const financedByOptions = [
  { value: 'budget', label: 'Budget du mois' },
  { value: 'gift_given', label: "Cadeau que j'offre" },
  { value: 'gift_received', label: 'Argent de cadeau reçu' },
]

const reserveEnvelope = computed(() => envelopes.value.find((envelope: any) => envelope.kind === 'reserve'))

watch(amount, (value) => emit('amount-change', value), { immediate: true })
watch(envelopeId, (value) => emit('envelope-change', value), { immediate: true })

const errorMessage = ref('')
const isSubmitting = ref(false)

const canSubmit = computed(() => amount.value > 0 && label.value.trim().length > 0 && (!needsCategory.value || categoryId.value.length > 0))

async function submit() {
  if (!canSubmit.value || isSubmitting.value) return

  errorMessage.value = ''
  isSubmitting.value = true

  try {
    await $fetch(props.editing ? `/api/expenses/${props.editing.id}` : '/api/expenses', {
      method: props.editing ? 'PATCH' : 'POST',
      body: {
        date: date.value,
        // Out of an envelope, the envelope says where the expense belongs.
        categoryId: needsCategory.value ? categoryId.value : null,
        label: label.value,
        amount: amount.value,
        accountId: financedBy.value === 'gift_received' ? null : (accountId.value || null),
        envelopeId: financedBy.value === 'gift_received' ? (reserveEnvelope.value?.id ?? null) : (envelopeId.value || null),
        financedBy: financedBy.value,
      },
    })
    emit('saved')
  } catch (error) {
    errorMessage.value = apiErrorMessage(error) ?? "Impossible d'enregistrer la sortie. Vérifiez les champs et réessayez."
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="text-center">
      <p class="text-[40px] font-extrabold tracking-tight text-ink">{{ displayValue }} <span class="text-ink-muted">€</span></p>
    </div>

    <div class="rounded-[22px] bg-white px-4">
      <EntryFormRow v-if="needsCategory" label="Catégorie">
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

    <p v-if="errorMessage" class="text-center text-[12px] font-medium text-warn-ink">{{ errorMessage }}</p>

    <button type="button" :disabled="!canSubmit || isSubmitting" class="rounded-[18px] bg-ink py-[14px] text-center text-[14.5px] font-bold text-white disabled:opacity-50" @click="submit">
      {{ editing ? 'Enregistrer les modifications' : 'Enregistrer la sortie' }}
    </button>
  </div>
</template>
