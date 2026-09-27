<script setup lang="ts">
type WishlistPriority = 'haute' | 'moyenne' | 'basse'
type WishlistSize = 'petite' | 'moyenne' | 'grosse'

interface WishlistItemView {
  id: string
  label: string
  price: number
  productUrl: string | null
  priority: WishlistPriority
  note: string | null
  size: WishlistSize
  envelopeName: string | null
  envelopeEmoji: string | null
  envelopeRemaining: number | null
}

const { data: items, error, refresh } = await useFetch<WishlistItemView[]>('/api/wishlist', {
  key: 'wishlist',
  default: () => [],
})

const sortMode = ref<'priority' | 'price'>('priority')

const PRIORITY_RANK: Record<WishlistPriority, number> = { haute: 0, moyenne: 1, basse: 2 }

// Mirrors sortWishlist in server/utils/domain/wishlist.ts: the label tiebreak keeps
// equal items from swapping places between renders.
function sorted(list: WishlistItemView[]) {
  return [...list].sort((a, b) => {
    if (sortMode.value === 'priority') {
      const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (rank !== 0) return rank
    }
    if (a.price !== b.price) return b.price - a.price
    return a.label.localeCompare(b.label, 'fr')
  })
}

const columns = computed(() => ([
  { size: 'petite' as const, title: 'Petites', hint: "jusqu'à 50 €" },
  { size: 'moyenne' as const, title: 'Moyennes', hint: '50 à 200 €' },
  { size: 'grosse' as const, title: 'Grosses', hint: 'plus de 200 €' },
]).map((column) => ({
  ...column,
  items: sorted((items.value ?? []).filter((item) => item.size === column.size)),
})))

const summary = computed(() => {
  const list = items.value ?? []
  const byPriority: Record<WishlistPriority, number> = { haute: 0, moyenne: 0, basse: 0 }
  for (const item of list) byPriority[item.priority] += 1
  return {
    count: list.length,
    total: list.reduce((sum, item) => sum + item.price, 0),
    byPriority,
  }
})

// formatEuro / formatEuroShort come from app/utils/currency.ts (auto-imported by Nuxt).

const PRIORITY_DOT: Record<WishlistPriority, string> = {
  haute: 'bg-warn-bar',
  moyenne: 'bg-accent-bar',
  basse: 'bg-mint-bar',
}

function subtitle(item: WishlistItemView) {
  if (!item.envelopeName) return null
  const label = `${item.envelopeEmoji ?? ''} ${item.envelopeName}`.trim()
  if (item.envelopeRemaining === null) return label
  if (item.envelopeRemaining < 0) {
    return `${label} · enveloppe déjà dépassée de ${formatEuroShort(Math.abs(item.envelopeRemaining))}`
  }
  return `${label} · ${formatEuroShort(item.envelopeRemaining)} restants ce mois`
}

const isCreating = ref(false)
const newLabel = ref('')
const newPrice = ref('')
const newPriority = ref<WishlistPriority>('moyenne')
const createError = ref('')

async function createItem() {
  createError.value = ''
  try {
    await $fetch('/api/wishlist', {
      method: 'POST',
      body: { label: newLabel.value, price: newPrice.value, priority: newPriority.value },
    })
    newLabel.value = ''
    newPrice.value = ''
    isCreating.value = false
    await refresh()
  } catch {
    createError.value = "Impossible d'ajouter cette envie."
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Envies">
      <template #context>
        <span class="rounded-full bg-app-bg px-3 py-1 text-[12.5px] font-semibold text-ink-muted">
          {{ summary.count }} envies · {{ formatEuro(summary.total) }} au total
        </span>
      </template>
      <template #actions>
        <button
          type="button"
          class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink"
          @click="sortMode = sortMode === 'priority' ? 'price' : 'priority'"
        >
          {{ sortMode === 'priority' ? 'Trier par prix' : 'Trier par priorité' }}
        </button>
        <button
          type="button"
          class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink"
          @click="isCreating = !isCreating"
        >
          + Nouvelle envie
        </button>
      </template>
    </PageHeader>

    <p v-if="error" class="rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink">
      Impossible de charger les envies. Réessayez dans un instant.
    </p>

    <template v-else>
      <!-- The design places this tally in the app sidebar, but AppSidebar renders
           SidebarCeilingsWidget unconditionally and knows nothing about the current
           route. Making it route-aware is a larger change than this page warrants, so
           the counts live on the page instead. -->
      <div class="flex items-center gap-4 rounded-[14px] border border-divider bg-white px-4 py-2.5">
        <span class="text-[11.5px] font-extrabold uppercase tracking-wide text-ink-faint">Priorités</span>
        <span class="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          <span class="h-2 w-2 rounded-full bg-warn-bar" /> Haute {{ summary.byPriority.haute }}
        </span>
        <span class="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          <span class="h-2 w-2 rounded-full bg-accent-bar" /> Moyenne {{ summary.byPriority.moyenne }}
        </span>
        <span class="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          <span class="h-2 w-2 rounded-full bg-mint-bar" /> Basse {{ summary.byPriority.basse }}
        </span>
      </div>

      <form
        v-if="isCreating"
        class="flex flex-wrap items-end gap-3 rounded-[14px] border border-divider bg-white p-4"
        @submit.prevent="createItem"
      >
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-muted">
          Envie
          <input v-model="newLabel" required class="rounded-lg border border-divider px-3 py-2 text-ink">
        </label>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-muted">
          Prix
          <input v-model="newPrice" required inputmode="decimal" class="w-28 rounded-lg border border-divider px-3 py-2 text-ink">
        </label>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-ink-muted">
          Priorité
          <select v-model="newPriority" class="rounded-lg border border-divider px-3 py-2 text-ink">
            <option value="haute">Haute</option>
            <option value="moyenne">Moyenne</option>
            <option value="basse">Basse</option>
          </select>
        </label>
        <button type="submit" class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink">
          Ajouter
        </button>
        <p v-if="createError" class="w-full text-[12.5px] font-semibold text-warn-ink">{{ createError }}</p>
      </form>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section v-for="column in columns" :key="column.size" class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between border-b border-divider pb-3">
            <h2 class="text-[13.5px] font-extrabold text-ink">{{ column.title }}</h2>
            <span class="text-[11.5px] font-semibold text-ink-faint">{{ column.hint }}</span>
          </header>

          <p v-if="!column.items.length" class="pt-4 text-[12.5px] text-ink-faint">Aucune envie ici.</p>

          <ul v-else class="flex flex-col">
            <li v-for="item in column.items" :key="item.id" class="border-b border-divider py-3 last:border-0">
              <div class="flex items-center justify-between gap-3">
                <span class="flex items-center gap-2 text-[13px] font-bold text-ink">
                  <span class="h-2 w-2 shrink-0 rounded-full" :class="PRIORITY_DOT[item.priority]" />
                  {{ item.label }}
                </span>
                <span class="shrink-0 text-[13px] font-bold text-ink">{{ formatEuroShort(item.price) }}</span>
              </div>
              <p v-if="subtitle(item)" class="pl-4 pt-1 text-[11.5px] font-semibold text-ink-faint">
                {{ subtitle(item) }}
              </p>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
