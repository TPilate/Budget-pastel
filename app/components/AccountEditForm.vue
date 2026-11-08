<script setup lang="ts">
interface EditableAccount {
  id: string
  name: string
  emoji: string
  kind?: 'courant' | 'epargne' | null
}

const props = defineProps<{ account: EditableAccount, balance: number }>()
const emit = defineEmits<{ saved: [], cancel: [] }>()

const emoji = ref(props.account.emoji)
const name = ref(props.account.name)
const kind = ref<'courant' | 'epargne'>(props.account.kind === 'epargne' ? 'epargne' : 'courant')
const balanceText = ref(String(props.balance))
const initialBalanceText = ref(balanceText.value)

// Re-seed when a different account is opened; a refresh after saving keeps what was typed.
watch(() => props.account.id, () => {
  emoji.value = props.account.emoji
  name.value = props.account.name
  kind.value = props.account.kind === 'epargne' ? 'epargne' : 'courant'
  balanceText.value = String(props.balance)
  initialBalanceText.value = balanceText.value
  errorMessage.value = ''
  savedAt.value = 0
})

// A balance that moves while the form is open (refresh after saving, a transfer elsewhere)
// is followed as long as the field is pristine; a half-typed edit is never overwritten.
watch(() => props.balance, (balance) => {
  if (balanceText.value === initialBalanceText.value) {
    balanceText.value = String(balance)
    initialBalanceText.value = balanceText.value
  }
})

// Anything typed before hydration is discarded, so the form stays disabled until mounted.
const isHydrated = ref(false)
onMounted(() => {
  isHydrated.value = true
})

const isSubmitting = ref(false)
const errorMessage = ref('')
const savedAt = ref(0)

async function save() {
  errorMessage.value = ''
  const body: Record<string, unknown> = {
    name: name.value,
    emoji: emoji.value,
    kind: kind.value,
  }
  // The server coerces '' to 0, so a balance is only sent when edited and parseable.
  if (balanceText.value !== initialBalanceText.value) {
    const raw = balanceText.value.trim().replace(',', '.')
    const parsed = raw === '' ? Number.NaN : Number(raw)
    if (!Number.isFinite(parsed)) {
      errorMessage.value = 'Saisissez un montant valide.'
      return
    }
    body.balance = parsed
  }
  isSubmitting.value = true
  try {
    await $fetch(`/api/accounts/${props.account.id}`, { method: 'PATCH', body })
    initialBalanceText.value = balanceText.value
    savedAt.value = Date.now()
    emit('saved')
  }
  catch {
    errorMessage.value = 'Impossible d\'enregistrer ce compte.'
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form class="mt-3 flex flex-col gap-2 border-t border-divider pt-3" @submit.prevent="save">
    <div class="flex gap-2">
      <label class="flex w-14 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
        Emoji
        <input v-model="emoji" required aria-label="Emoji du compte" :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-center text-[12.5px] text-ink disabled:bg-app-bg">
      </label>
      <label class="flex flex-1 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
        Nom
        <input v-model="name" required aria-label="Nom du compte" :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink disabled:bg-app-bg">
      </label>
      <label class="flex w-28 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
        Type
        <select v-model="kind" aria-label="Type de compte" :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink disabled:bg-app-bg">
          <option value="courant">Courant</option>
          <option value="epargne">Épargne</option>
        </select>
      </label>
    </div>

    <label class="flex flex-col gap-1 text-[11px] font-semibold text-ink-muted">
      Solde actuel
      <input v-model="balanceText" inputmode="decimal" :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink disabled:bg-app-bg">
      <span class="font-normal text-ink-faint">Le solde saisi devient le point de départ ; les transferts saisis ensuite s'y ajoutent.</span>
    </label>

    <div class="flex items-center gap-3">
      <button type="submit" :disabled="isSubmitting || !isHydrated" class="rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-ink disabled:opacity-50">
        {{ isSubmitting ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
      <button type="button" class="text-[12px] font-semibold text-ink-muted" @click="emit('cancel')">Fermer</button>
      <span v-if="savedAt && !errorMessage" class="text-[11px] font-semibold text-mint-ink">Enregistré</span>
      <span v-if="errorMessage" role="alert" class="text-[11px] font-semibold text-warn-ink">{{ errorMessage }}</span>
    </div>
  </form>
</template>
