<script setup lang="ts">
import type { SavingsInput } from '~~/shared/schemas/savings'

interface GoalItem {
  id: string
  name: string
}

const emit = defineEmits<{ saved: []; 'amount-change': [number] }>()

const props = defineProps<{
  goals: GoalItem[]
  editing?: { id: string, fields: SavingsInput } | null
}>()

const initial = props.editing?.fields
const { displayValue, amount, pressDigit, pressComma, backspace } = useAmountInput(initial ? amountToBuffer(initial.amount) : '0')

const savingsGoalId = ref(initial?.savingsGoalId ?? props.goals[0]?.id ?? '')
const date = ref(initial?.date ?? new Date().toISOString().slice(0, 10))

watch(amount, (value) => emit('amount-change', value), { immediate: true })

const errorMessage = ref('')
const isSubmitting = ref(false)

const canSubmit = computed(() => amount.value > 0 && savingsGoalId.value.length > 0 && date.value.length > 0)

async function submit() {
  if (!canSubmit.value || isSubmitting.value) return

  errorMessage.value = ''
  isSubmitting.value = true

  try {
    await $fetch(props.editing ? `/api/savings/${props.editing.id}` : '/api/savings', {
      method: props.editing ? 'PATCH' : 'POST',
      body: { savingsGoalId: savingsGoalId.value, date: date.value, amount: amount.value },
    })
    emit('saved')
  } catch (error) {
    errorMessage.value = apiErrorMessage(error) ?? "Impossible d'enregistrer le versement. Vérifiez les champs et réessayez."
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="text-center">
      <p class="text-[40px] font-extrabold tracking-tight text-ink">{{ displayValue }} <span class="text-ink-muted">€</span></p>
      <p class="mt-1 text-[12px] font-medium text-ink-muted">Mis de côté sur le salaire</p>
    </div>

    <div class="rounded-[22px] bg-white px-4">
      <EntryFormRow label="Poche">
        <select v-model="savingsGoalId" class="bg-transparent text-right font-bold text-ink">
          <option v-for="goal in goals" :key="goal.id" :value="goal.id">{{ goal.name }}</option>
        </select>
      </EntryFormRow>
      <EntryFormRow label="Date">
        <input v-model="date" type="date" class="bg-transparent text-right font-bold text-ink">
      </EntryFormRow>
    </div>

    <NumericKeypad @digit="pressDigit" @comma="pressComma" @backspace="backspace" />

    <p v-if="errorMessage" class="text-center text-[12px] font-medium text-warn-ink">{{ errorMessage }}</p>

    <button type="button" :disabled="!canSubmit || isSubmitting" class="rounded-[18px] bg-ink py-[14px] text-center text-[14.5px] font-bold text-white disabled:opacity-50" @click="submit">
      {{ editing ? 'Enregistrer les modifications' : 'Enregistrer le versement' }}
    </button>
  </div>
</template>
