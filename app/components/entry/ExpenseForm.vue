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
