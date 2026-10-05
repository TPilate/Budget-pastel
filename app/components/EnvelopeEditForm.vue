<script setup lang="ts">
interface EditableEnvelope {
  id: string
  name: string
  emoji: string
  defaultCeiling: number
  showOnHome: boolean
}

const props = defineProps<{ envelope: EditableEnvelope }>()
const emit = defineEmits<{ saved: [] }>()

const name = ref(props.envelope.name)
const emoji = ref(props.envelope.emoji)
const ceiling = ref(String(props.envelope.defaultCeiling))
const showOnHome = ref(props.envelope.showOnHome)

// The drawer stays mounted while the selection changes, so without this the form would
// keep showing the previously opened envelope's values.
watch(() => props.envelope, (envelope, previous) => {
  name.value = envelope.name
  emoji.value = envelope.emoji
  ceiling.value = String(envelope.defaultCeiling)
  showOnHome.value = envelope.showOnHome

  // Only clear the save feedback when a DIFFERENT envelope is opened. A successful save
  // also replaces this prop — the parent refreshes the list and re-resolves the selection
  // to a new object — so resetting unconditionally wiped the "Enregistré" confirmation the
  // save had just set, and the user got no feedback at all for a write that worked.
  if (envelope.id !== previous?.id) {
    errorMessage.value = ''
    savedAt.value = 0
  }
})

// Anything typed before Vue hydrates is discarded when hydration patches the inputs to
// match these refs, so the form stays disabled until mounted. Same guard as
// app/pages/login.vue, which carries the incident record for this.
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
    await $fetch(`/api/envelopes/${props.envelope.id}`, {
      method: 'PATCH',
      body: {
        name: name.value,
        emoji: emoji.value,
        // Accept a French decimal comma, as the other forms in this app do.
        defaultCeiling: ceiling.value.trim().replace(',', '.'),
        showOnHome: showOnHome.value,
      },
    })
    savedAt.value = Date.now()
    emit('saved')
  }
  catch {
    errorMessage.value = "Impossible d'enregistrer cette enveloppe."
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-3 border-t border-divider pt-4" @submit.prevent="save">
    <p class="text-[12px] font-bold text-ink">Modifier</p>

    <div class="flex gap-2">
      <label class="flex w-16 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
        Emoji
        <input
          v-model="emoji"
          required
          :disabled="!isHydrated"
          class="rounded-lg border border-divider px-2 py-1.5 text-[13px] text-ink disabled:bg-app-bg"
        >
      </label>
      <label class="flex flex-1 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
        Nom
        <input
          v-model="name"
          required
          :disabled="!isHydrated"
          class="rounded-lg border border-divider px-2 py-1.5 text-[13px] text-ink disabled:bg-app-bg"
        >
      </label>
    </div>

    <div class="flex flex-col gap-1">
      <!-- The hint sits outside the <label> on purpose: inside, it becomes part of the
           field's accessible name, so screen readers announce the whole sentence and
           getByLabel('Plafond par défaut') no longer matches. -->
      <label class="flex flex-col gap-1 text-[11px] font-semibold text-ink-muted">
        Plafond par défaut
        <input
          v-model="ceiling"
          required
          inputmode="decimal"
          :disabled="!isHydrated"
          class="rounded-lg border border-divider px-2 py-1.5 text-[13px] text-ink disabled:bg-app-bg"
        >
      </label>
      <p class="text-[10.5px] font-medium text-ink-faint">
        Utilisé pour les mois sans plafond spécifique. Ne modifie pas un mois déjà clôturé.
      </p>
    </div>

    <label class="flex items-center gap-2 text-[11.5px] font-semibold text-ink-muted">
      <input v-model="showOnHome" type="checkbox" :disabled="!isHydrated">
      Afficher sur l'accueil
    </label>

    <div class="flex items-center gap-3">
      <button
        type="submit"
        :disabled="isSubmitting || !isHydrated"
        class="rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-ink disabled:opacity-50"
      >
        {{ isSubmitting ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
      <span v-if="savedAt && !errorMessage" class="text-[11px] font-semibold text-mint-ink">Enregistré</span>
    </div>

    <p v-if="errorMessage" role="alert" class="text-[11.5px] font-semibold text-warn-ink">{{ errorMessage }}</p>
  </form>
</template>
