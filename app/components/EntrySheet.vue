<script setup lang="ts">
const { isOpen, close } = useEntrySheet()

const mode = ref<'expense' | 'income' | 'transfer'>('expense')

const modeOptions = [
  { value: 'expense', label: '− Sortie' },
  { value: 'income', label: '+ Entrée' },
  { value: 'transfer', label: '⇄ Transfert' },
]

function handleSaved() {
  close()
  mode.value = 'expense'
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-end justify-center bg-black/30">
    <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[40px] bg-app-bg p-5">
      <div class="flex items-center justify-between">
        <button type="button" class="text-[13px] font-bold text-ink-muted" @click="close">Annuler</button>
        <p class="text-[15px] font-extrabold text-ink">Nouvelle ligne</p>
        <span class="w-[52px]" />
      </div>

      <div class="mt-4">
        <SegmentedToggle :options="modeOptions" :model-value="mode" @update:model-value="mode = $event as typeof mode" />
      </div>

      <div class="mt-4">
        <ExpenseForm v-if="mode === 'expense'" @saved="handleSaved" />
        <IncomeForm v-else-if="mode === 'income'" @saved="handleSaved" />
        <TransferForm v-else @saved="handleSaved" />
      </div>
    </div>
  </div>
</template>
