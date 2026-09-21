<script setup lang="ts">
interface Movement {
  id: string
  type: 'expense' | 'income' | 'transfer'
  date: string
  label: string
  envelopeLabel: string
  origin: string
  amount: number
  sign: 'negative' | 'positive' | 'neutral'
}

const { data } = await useFetch<Movement[]>('/api/movements', { key: 'movements-feed' })

const activeFilter = ref<'all' | 'expense' | 'income' | 'transfer'>('all')
const searchText = ref('')

const filterOptions = [
  { value: 'all', label: 'Tous' },
  { value: 'expense', label: 'Sorties' },
  { value: 'income', label: 'Entrées' },
  { value: 'transfer', label: 'Transferts' },
]

const filteredMovements = computed(() => {
  const movements = data.value ?? []
  const query = searchText.value.trim().toLowerCase()
  return movements
    .filter((movement) => activeFilter.value === 'all' || movement.type === activeFilter.value)
    .filter((movement) => !query || movement.label.toLowerCase().includes(query))
})

function formatAmount(movement: Movement) {
  const formatted = `${Math.abs(movement.amount).toFixed(2).replace('.', ',')} €`
  if (movement.sign === 'negative') return `-${formatted}`
  if (movement.sign === 'positive') return `+${formatted}`
  return formatted
}

function amountColorClass(movement: Movement) {
  if (movement.sign === 'negative') return 'text-warn-ink'
  if (movement.sign === 'positive') return 'text-mint-ink'
  return 'text-ink'
}

function formatDate(isoDate: string) {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}
</script>

<template>
  <div class="grid grid-cols-[1fr_360px] gap-5">
    <div class="flex flex-col gap-5">
      <PageHeader title="Mouvements">
        <template #context>
          <div class="flex gap-1 rounded-[12px] bg-toggle-track p-1">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              class="rounded-[9px] px-3 py-1.5 text-[12.5px] font-bold"
              :class="activeFilter === option.value ? 'bg-white text-ink' : 'text-ink-muted'"
              @click="activeFilter = option.value as typeof activeFilter"
            >
              {{ option.label }}
            </button>
          </div>
        </template>
        <template #actions>
          <input
            v-model="searchText"
            type="search"
            placeholder="Rechercher un mouvement…"
            class="rounded-[12px] border border-divider bg-white px-3 py-2 text-[12.5px]"
          >
        </template>
      </PageHeader>

      <div class="rounded-[22px] bg-white p-4">
        <table class="w-full text-left text-[12.5px]">
          <thead>
            <tr class="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
              <th class="pb-2">Date</th>
              <th class="pb-2">Libellé</th>
              <th class="pb-2">Enveloppe</th>
              <th class="pb-2">Origine</th>
              <th class="pb-2 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="movement in filteredMovements" :key="movement.id" class="border-t border-divider">
              <td class="py-2.5 text-ink-muted">{{ formatDate(movement.date) }}</td>
              <td class="py-2.5 font-semibold text-ink">{{ movement.label }}</td>
              <td class="py-2.5 text-ink-muted">{{ movement.envelopeLabel }}</td>
              <td class="py-2.5 text-ink-muted">{{ movement.origin }}</td>
              <td class="py-2.5 text-right font-bold" :class="amountColorClass(movement)">{{ formatAmount(movement) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="filteredMovements.length === 0" class="py-6 text-center text-[12.5px] font-medium text-ink-muted">
          Aucun mouvement ce mois-ci.
        </p>
      </div>
    </div>

    <EntryPanel />
  </div>
</template>
