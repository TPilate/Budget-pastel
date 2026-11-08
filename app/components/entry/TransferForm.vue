<script setup lang="ts">
import { endpointKey, sameEndpoint } from '~~/shared/schemas/transfer'
import type { TransferEndpoint, TransferInput } from '~~/shared/schemas/transfer'

interface ReferenceItem {
  id: string
  name: string
  emoji: string
}

const emit = defineEmits<{
  saved: []
  'amount-change': [number]
  'from-change': [TransferEndpoint | null]
  'to-change': [TransferEndpoint | null]
}>()

// Reference data is fetched once by EntryPanel and passed down, rather than each form
// fetching its own: every endpoint pays for its own auth round-trip to Supabase, so
// per-form fetching made a single page render cost several extra round-trips.
const props = defineProps<{
  envelopes: (ReferenceItem & { kind: 'budget' | 'reserve' })[]
  accounts: ReferenceItem[]
  budgetLibre: number | null
  defaultDate: string
  fromLabel?: string
  toLabel?: string
  editing?: { id: string, fields: TransferInput } | null
}>()
const initial = props.editing?.fields

// Reserves are not offered: they move only through their own flows.
const budgetEnvelopes = computed(() => props.envelopes.filter((envelope) => envelope.kind === 'budget'))

// An endpoint of the transfer being edited can be gone from the lists (archived account):
// it stays selectable under its own label so the select never renders blank.
const listedKeys = computed(() => new Set([
  'budget',
  ...budgetEnvelopes.value.map((envelope) => `envelope:${envelope.id}`),
  ...props.accounts.map((account) => `account:${account.id}`),
]))
function fallbackOption(endpoint: TransferEndpoint | undefined, label: string | undefined) {
  if (!endpoint || !label || listedKeys.value.has(endpointKey(endpoint))) return null
  return { value: endpointKey(endpoint), label: endpoint.kind === 'account' ? `${label} (archivé)` : label }
}
const fromFallback = computed(() => fallbackOption(initial?.from, props.fromLabel))
const toFallback = computed(() => fallbackOption(initial?.to, props.toLabel))

function parseKey(key: string): TransferEndpoint | null {
  if (key === 'budget') return { kind: 'budget' }
  if (key.startsWith('envelope:')) return { kind: 'envelope', envelopeId: key.slice('envelope:'.length) }
  if (key.startsWith('account:')) return { kind: 'account', accountId: key.slice('account:'.length) }
  return null
}

function defaultFromKey() {
  return 'budget'
}
function defaultToKey() {
  const account = props.accounts[0]
  if (account) return `account:${account.id}`
  const envelope = budgetEnvelopes.value[0]
  return envelope ? `envelope:${envelope.id}` : ''
}

const { displayValue, amount, pressDigit, pressComma, backspace, reset } = useAmountInput(initial ? amountToBuffer(initial.amount) : '0')

const fromKey = ref(initial ? endpointKey(initial.from) : defaultFromKey())
const toKey = ref(initial ? endpointKey(initial.to) : defaultToKey())
const reason = ref(initial?.reason ?? '')
const date = ref(initial?.date ?? props.defaultDate)

const fromEndpoint = computed(() => parseKey(fromKey.value))
const toEndpoint = computed(() => parseKey(toKey.value))

watch(amount, (value) => emit('amount-change', value), { immediate: true })
watch(fromEndpoint, (value) => emit('from-change', value), { immediate: true })
watch(toEndpoint, (value) => emit('to-change', value), { immediate: true })

const errorMessage = ref('')
const isSubmitting = ref(false)

// Editing a budget-sourced transfer: its own amount is already out of the budget libre,
// so it is available again for the edit.
const available = computed(() => {
  if (fromEndpoint.value?.kind !== 'budget' || props.budgetLibre === null) return null
  const own = initial?.from.kind === 'budget' ? initial.amount : 0
  return props.budgetLibre + own
})

const exceedsBudget = computed(() => available.value !== null && amount.value > available.value)

const canSubmit = computed(() =>
  amount.value > 0
  && reason.value.trim().length > 0
  && /^\d{4}-\d{2}-\d{2}$/.test(date.value)
  && fromEndpoint.value !== null
  && toEndpoint.value !== null
  && !sameEndpoint(fromEndpoint.value, toEndpoint.value)
  && !exceedsBudget.value,
)

async function submit() {
  if (!canSubmit.value || isSubmitting.value) return

  errorMessage.value = ''
  isSubmitting.value = true

  try {
    await $fetch(props.editing ? `/api/transfers/${props.editing.id}` : '/api/transfers', {
      method: props.editing ? 'PATCH' : 'POST',
      body: {
        from: fromEndpoint.value,
        to: toEndpoint.value,
        amount: amount.value,
        reason: reason.value,
        date: date.value,
      },
    })
    // Back to the initial state so the same transfer cannot be saved twice by accident.
    if (!props.editing) {
      reset()
      reason.value = ''
      fromKey.value = defaultFromKey()
      toKey.value = defaultToKey()
    }
    emit('saved')
  } catch (error) {
    errorMessage.value = apiErrorMessage(error) ?? 'Impossible de valider le transfert. Vérifiez les champs et réessayez.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="text-center">
      <p class="text-[40px] font-extrabold tracking-tight text-ink">{{ displayValue }} <span class="text-ink-muted">€</span></p>
      <p class="mt-1 text-[12px] font-medium text-ink-muted">Entre le budget, les enveloppes et les comptes</p>
    </div>

    <div class="rounded-[22px] bg-white px-4">
      <EntryFormRow label="Retirer à">
        <select v-model="fromKey" class="bg-transparent text-right font-bold text-ink">
          <option v-if="fromFallback" :value="fromFallback.value">{{ fromFallback.label }}</option>
          <option value="budget">Budget du mois</option>
          <optgroup v-if="budgetEnvelopes.length" label="Enveloppes">
            <option v-for="envelope in budgetEnvelopes" :key="envelope.id" :value="`envelope:${envelope.id}`">
              {{ envelope.emoji }} {{ envelope.name }}
            </option>
          </optgroup>
          <optgroup v-if="accounts.length" label="Comptes">
            <option v-for="account in accounts" :key="account.id" :value="`account:${account.id}`">
              {{ account.emoji }} {{ account.name }}
            </option>
          </optgroup>
        </select>
      </EntryFormRow>
      <EntryFormRow label="Verser à">
        <select v-model="toKey" class="bg-transparent text-right font-bold text-ink">
          <option v-if="toFallback" :value="toFallback.value">{{ toFallback.label }}</option>
          <option value="budget">Budget du mois</option>
          <optgroup v-if="budgetEnvelopes.length" label="Enveloppes">
            <option v-for="envelope in budgetEnvelopes" :key="envelope.id" :value="`envelope:${envelope.id}`">
              {{ envelope.emoji }} {{ envelope.name }}
            </option>
          </optgroup>
          <optgroup v-if="accounts.length" label="Comptes">
            <option v-for="account in accounts" :key="account.id" :value="`account:${account.id}`">
              {{ account.emoji }} {{ account.name }}
            </option>
          </optgroup>
        </select>
      </EntryFormRow>
      <EntryFormRow label="Date">
        <input v-model="date" type="date" class="bg-transparent text-right font-bold text-ink">
      </EntryFormRow>
      <EntryFormRow label="Motif">
        <input v-model="reason" class="bg-transparent text-right font-bold text-ink" placeholder="Dîner d'anniversaire">
      </EntryFormRow>
    </div>

    <p v-if="available !== null" class="text-center text-[11.5px] font-medium" :class="exceedsBudget ? 'text-warn-ink' : 'text-ink-muted'">
      Disponible : {{ formatEuro(available) }}
    </p>

    <NumericKeypad @digit="pressDigit" @comma="pressComma" @backspace="backspace" />

    <p v-if="errorMessage" class="text-center text-[12px] font-medium text-warn-ink">{{ errorMessage }}</p>

    <button type="button" :disabled="!canSubmit || isSubmitting" class="rounded-[18px] bg-ink py-[14px] text-center text-[14.5px] font-bold text-white disabled:opacity-50" @click="submit">
      {{ editing ? 'Enregistrer les modifications' : 'Valider le transfert' }}
    </button>
  </div>
</template>
