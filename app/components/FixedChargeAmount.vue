<script setup lang="ts">
/**
 * The editable amount on one fixed-charge row.
 *
 * Saves on blur, and only when the value actually changed — so reading the page, tabbing
 * through it, or clicking in and back out again costs nothing. The parent refreshes the
 * whole overview afterwards so the section total and the KPI cards move with it rather
 * than drifting out of step.
 */
const props = defineProps<{
  categoryId: string
  amount: number
}>()

const emit = defineEmits<{ saved: [] }>()

const value = ref(String(props.amount))

// The parent re-renders this row from a fresh payload after every save, and the list can
// also change underneath us; without this the input would keep showing a stale figure.
watch(() => props.amount, (amount) => {
  value.value = String(amount)
  errorMessage.value = ''
})

// Anything typed before hydration is discarded when Vue patches the input to match this
// ref, so the field stays disabled until mounted. Same guard as the other forms here.
const isHydrated = ref(false)
onMounted(() => {
  isHydrated.value = true
})

const isSaving = ref(false)
const savedAt = ref(0)
const errorMessage = ref('')

async function saveIfChanged() {
  // Accept a French decimal comma, as every other amount field in this app does.
  const normalised = value.value.trim().replace(',', '.')
  const parsed = Number(normalised)

  if (!normalised || Number.isNaN(parsed) || parsed < 0) {
    errorMessage.value = 'Montant invalide'
    value.value = String(props.amount)
    return
  }

  // Blur fires whether or not anything changed; a no-op PATCH would still refetch the
  // whole overview and flash "Enregistré" for no reason.
  if (parsed === props.amount) {
    errorMessage.value = ''
    return
  }

  errorMessage.value = ''
  isSaving.value = true
  try {
    await $fetch(`/api/categories/${props.categoryId}`, {
      method: 'PATCH',
      body: { defaultTarget: normalised },
    })
    savedAt.value = Date.now()
    emit('saved')
  }
  catch {
    errorMessage.value = 'Échec'
    value.value = String(props.amount)
  }
  finally {
    isSaving.value = false
  }
}
</script>

<template>
  <span class="flex items-center gap-1.5">
    <span v-if="errorMessage" role="alert" class="text-[10.5px] font-semibold text-warn-ink">{{ errorMessage }}</span>
    <span v-else-if="savedAt" class="text-[10.5px] font-semibold text-mint-ink">Enregistré</span>

    <input
      v-model="value"
      inputmode="decimal"
      :disabled="!isHydrated || isSaving"
      :aria-label="`Montant de la charge fixe`"
      class="w-20 rounded-lg border border-divider px-2 py-0.5 text-right text-[12.5px] font-semibold text-ink disabled:bg-app-bg"
      @blur="saveIfChanged"
      @keyup.enter="($event.target as HTMLInputElement).blur()"
    >
    <span class="text-[12.5px] font-semibold text-ink">€</span>
  </span>
</template>
