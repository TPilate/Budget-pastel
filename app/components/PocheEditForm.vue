<script setup lang="ts">
interface EditablePoche {
  id: string
  name: string
  note: string | null
  monthlyAmount: number
  targetAmount: number | null
}

const props = defineProps<{ poche: EditablePoche }>()
const emit = defineEmits<{ saved: [] }>()

const name = ref(props.poche.name)
const note = ref(props.poche.note ?? '')
const monthlyAmount = ref(String(props.poche.monthlyAmount))
const targetAmount = ref(props.poche.targetAmount === null ? '' : String(props.poche.targetAmount))

// The list re-renders from a fresh payload after each save and the selection can change,
// so the fields are re-seeded rather than keeping a stale poche's values.
watch(() => props.poche, (poche) => {
  name.value = poche.name
  note.value = poche.note ?? ''
  monthlyAmount.value = String(poche.monthlyAmount)
  targetAmount.value = poche.targetAmount === null ? '' : String(poche.targetAmount)
  errorMessage.value = ''
  savedAt.value = 0
})

// Anything typed before hydration is discarded when Vue patches the inputs to match these
// refs, so the form stays disabled until mounted. Same guard as app/pages/login.vue.
const isHydrated = ref(false)
onMounted(() => {
  isHydrated.value = true
})

const isSubmitting = ref(false)
const errorMessage = ref('')
const savedAt = ref(0)

async function save() {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    await $fetch(`/api/savings-goals/${props.poche.id}`, {
      method: 'PATCH',
      body: {
        name: name.value,
        note: note.value || null,
        // French decimal comma, as every amount field in this app accepts.
        monthlyAmount: monthlyAmount.value.trim().replace(',', '.'),
        // An empty objectif means "sans échéance", which is null rather than zero.
        targetAmount: targetAmount.value.trim() === '' ? null : targetAmount.value.trim().replace(',', '.'),
      },
    })
    savedAt.value = Date.now()
    emit('saved')
  }
  catch {
    errorMessage.value = 'Impossible d\'enregistrer cette poche.'
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form class="mt-3 flex flex-col gap-2 border-t border-divider pt-3" @submit.prevent="save">
    <div class="flex gap-2">
      <label class="flex flex-1 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
        Nom
        <input v-model="name" required :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink disabled:bg-app-bg">
      </label>
      <label class="flex w-24 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
        Par mois
        <input v-model="monthlyAmount" inputmode="decimal" :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink disabled:bg-app-bg">
      </label>
      <label class="flex w-24 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
        Objectif
        <input v-model="targetAmount" inputmode="decimal" placeholder="aucun" :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink disabled:bg-app-bg">
      </label>
    </div>

    <label class="flex flex-col gap-1 text-[11px] font-semibold text-ink-muted">
      Note
      <input v-model="note" :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink disabled:bg-app-bg">
    </label>

    <div class="flex items-center gap-3">
      <button type="submit" :disabled="isSubmitting || !isHydrated" class="rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-ink disabled:opacity-50">
        {{ isSubmitting ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
      <span v-if="savedAt && !errorMessage" class="text-[11px] font-semibold text-mint-ink">Enregistré</span>
      <span v-if="errorMessage" role="alert" class="text-[11px] font-semibold text-warn-ink">{{ errorMessage }}</span>
    </div>
  </form>
</template>
