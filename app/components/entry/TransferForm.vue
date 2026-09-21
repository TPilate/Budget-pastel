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

const errorMessage = ref('')
const isSubmitting = ref(false)

const canSubmit = computed(() =>
  amount.value > 0
  && reason.value.trim().length > 0
  && fromEnvelopeId.value.length > 0
  && toEnvelopeId.value.length > 0
  && fromEnvelopeId.value !== toEnvelopeId.value,
)

async function submit() {
  if (!canSubmit.value || isSubmitting.value) return

  errorMessage.value = ''
  isSubmitting.value = true

  try {
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
  } catch {
    errorMessage.value = 'Impossible de valider le transfert. Vérifiez les champs et réessayez.'
  } finally {
    isSubmitting.value = false
  }
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

    <p v-if="errorMessage" class="text-center text-[12px] font-medium text-warn-ink">{{ errorMessage }}</p>

    <button type="button" :disabled="!canSubmit || isSubmitting" class="rounded-[18px] bg-ink py-[14px] text-center text-[14.5px] font-bold text-white disabled:opacity-50" @click="submit">
      Valider le transfert
    </button>
  </div>
</template>
