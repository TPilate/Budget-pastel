<script setup lang="ts">
interface YearMonth { year: number, month: number }
interface ReopenPreview { months: string[], balanceWarning: boolean }

const props = defineProps<{ month: YearMonth }>()
const emit = defineEmits<{ done: [], cancel: [] }>()

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const label = computed(() => `${MONTH_NAMES[props.month.month - 1]} ${props.month.year}`)
const mois = computed(() => `${props.month.year}-${String(props.month.month).padStart(2, '0')}`)

const isHydrated = ref(false)
const isSubmitting = ref(false)
const preview = ref<ReopenPreview | null>(null)
const errorMessage = ref<string | null>(null)

onMounted(async () => {
  isHydrated.value = true
  try {
    preview.value = await $fetch<ReopenPreview>('/api/closure/reopen-preview', { query: { mois: mois.value } })
  }
  catch {
    errorMessage.value = "Impossible de charger l'aperçu. Réessayez."
  }
})

async function reopen() {
  if (isSubmitting.value || !preview.value) return
  isSubmitting.value = true
  errorMessage.value = null
  try {
    await $fetch('/api/closure/reopen', { method: 'POST', body: { year: props.month.year, month: props.month.month } })
    await refreshNuxtData()
    emit('done')
  }
  catch (error: any) {
    errorMessage.value = error?.data?.message ?? "La réouverture a échoué. Réessayez."
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="space-y-2 rounded-[14px] border border-divider bg-white p-4 text-[12.5px] font-semibold text-ink" data-testid="reopen-confirm">
    <p>Le compte rendu de {{ label }} sera supprimé et refait à la prochaine clôture. Les reliquats reportés, versés à une poche ou envoyés vers un compte seront annulés.</p>
    <p v-if="preview && preview.months.length > 1">{{ preview.months.join(' et ') }} seront aussi rouverts.</p>
    <p v-if="preview?.balanceWarning">Les soldes de comptes saisis à la main depuis la clôture seront à vérifier.</p>
    <p v-if="errorMessage" class="text-warn-ink" role="alert">{{ errorMessage }}</p>
    <div class="flex gap-2 pt-1">
      <button type="button" :disabled="!isHydrated || isSubmitting || !preview" class="rounded-[12px] bg-ink px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" @click="reopen">
        Rouvrir
      </button>
      <button type="button" :disabled="isSubmitting" class="rounded-[12px] bg-app-bg px-4 py-2 text-[12.5px] font-bold text-ink-muted" @click="emit('cancel')">
        Annuler
      </button>
    </div>
  </div>
</template>
