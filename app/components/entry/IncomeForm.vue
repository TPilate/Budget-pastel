<script setup lang="ts">
interface ReferenceItem {
  id: string
  name: string
  emoji: string
  requiresDetailsText?: boolean
}

const emit = defineEmits<{ saved: []; 'amount-change': [number]; 'envelope-change': [string] }>()

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
const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
const detailsText = ref('')
const targetEnvelopeId = ref('')

const selectedIncomeType = computed(() => incomeTypes.value.find((incomeType: any) => incomeType.id === incomeTypeId.value))

watch(amount, (value) => emit('amount-change', value), { immediate: true })
watch(targetEnvelopeId, (value) => emit('envelope-change', value), { immediate: true })

const errorMessage = ref('')
const isSubmitting = ref(false)

const canSubmit = computed(() => amount.value > 0 && label.value.trim().length > 0 && incomeTypeId.value.length > 0)

async function submit() {
  if (!canSubmit.value || isSubmitting.value) return

  errorMessage.value = ''
  isSubmitting.value = true

  try {
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
  } catch {
    errorMessage.value = "Impossible d'enregistrer l'entrée. Vérifiez les champs et réessayez."
  } finally {
    isSubmitting.value = false
  }
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
      <EntryFormRow label="Année">
        <select v-model.number="yearAssigned" class="bg-transparent text-right font-bold text-ink">
          <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
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

    <p v-if="errorMessage" class="text-center text-[12px] font-medium text-warn-ink">{{ errorMessage }}</p>

    <button type="button" :disabled="!canSubmit || isSubmitting" class="rounded-[18px] bg-ink py-[14px] text-center text-[14.5px] font-bold text-white disabled:opacity-50" @click="submit">
      Enregistrer l'entrée
    </button>
  </div>
</template>
