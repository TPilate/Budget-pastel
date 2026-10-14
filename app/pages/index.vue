<script setup lang="ts">
type SliceKey = 'fixed' | 'envelope' | 'variable' | 'savings' | 'unspent'

interface DashboardPayload {
  month: { year: number, month: number, label: string, daysRemaining: number }
  income: { received: number, salaryReceived: number, salaryExpected: number, salaryVariance: number }
  savings: { total: number, byGoal: { goalId: string, goalName: string, amount: number }[] }
  envelopes: {
    totalCeiling: number
    totalNetSpent: number
    totalRemaining: number
    overspentCount: number
    cards: { id: string, name: string, emoji: string, ceiling: number, netSpent: number, remaining: number, incomeCreditsTotal: number }[]
  }
  reserves: { id: string, name: string, emoji: string, balance: number, incomeCreditsTotal: number, expensesTotal: number }[]
  summary: { unspent: number, perDay: number, allocatedPercent: number, slices: { key: SliceKey, amount: number, percent: number }[] }
  ruleOfThumb: {
    targets: { besoins: number, envies: number, epargne: number }
    actuals: { besoins: number, envies: number, epargne: number }
    untagged: number
  }
  recentMovements: { id: string, type: string, date: string, label: string, envelopeLabel: string, origin: string, amount: number, sign: string }[]
}

interface DashboardPage {
  dashboard: DashboardPayload
  closureStatus: { closableMonth: { year: number, month: number, label: string, name: string } | null }
}

const { data: page, error } = useLazyFetch<DashboardPage>('/api/pages/dashboard', { key: 'page-dashboard' })
const dashboard = computed(() => page.value?.dashboard ?? null)
const closureStatus = computed(() => page.value?.closureStatus ?? null)

// With no income recorded, every percentage is meaningless and the donut would be a
// flat ring. The page shows a prompt instead — the same lesson as /comptes, where a
// permanently negative figure was worse than showing nothing.
const hasIncome = computed(() => (dashboard.value?.income.received ?? 0) > 0)

const SLICE_LABEL: Record<SliceKey, string> = {
  fixed: 'Charges fixes',
  envelope: 'Dépenses enveloppes',
  variable: 'Variables',
  savings: 'Épargne',
  unspent: 'Non dépensé',
}

const SLICE_COLOR: Record<SliceKey, string> = {
  fixed: 'var(--color-violet-bar)',
  envelope: 'var(--color-warn-bar)',
  variable: 'var(--color-azure-bar)',
  savings: 'var(--color-mint-bar)',
  unspent: 'var(--color-toggle-track)',
}

// Hand-rolled donut: one <circle> per slice, each drawn as a dash of its own length and
// pushed round the ring by the slices before it. Five slices do not justify a chart
// dependency.
const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const donutSegments = computed(() => {
  const slices = dashboard.value?.summary.slices ?? []
  let offset = 0
  return slices.map((slice) => {
    const length = (Math.max(0, slice.percent) / 100) * CIRCUMFERENCE
    const segment = {
      key: slice.key,
      color: SLICE_COLOR[slice.key],
      dash: `${length} ${CIRCUMFERENCE - length}`,
      offset: -offset,
    }
    offset += length
    return segment
  })
})

function percentOfCeiling(spent: number, ceiling: number) {
  return ceiling > 0 ? Math.min(100, Math.max(0, Math.round((spent / ceiling) * 100))) : 0
}

function signedAmount(movement: { amount: number, sign: string }) {
  const formatted = formatEuro(Math.abs(movement.amount))
  if (movement.sign === 'negative') return `-${formatted}`
  if (movement.sign === 'positive') return `+${formatted}`
  return formatted
}

function shortDate(isoDate: string) {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader :title="dashboard?.month.label ?? 'Tableau de bord'">
      <template #context>
        <span v-if="dashboard" class="text-[12.5px] font-semibold text-ink-muted">
          {{ dashboard.month.daysRemaining }} jours restants
        </span>
      </template>
      <template #actions>
        <NuxtLink
          v-if="closureStatus?.closableMonth"
          to="/compte-rendu"
          class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink"
        >
          Clôturer {{ closureStatus.closableMonth.name }}
        </NuxtLink>
        <NuxtLink to="/mouvements" class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink">
          + Nouvelle saisie
        </NuxtLink>
      </template>
    </PageHeader>

    <p v-if="error" class="rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink">
      Impossible de charger le tableau de bord. Réessayez dans un instant.
    </p>

    <div v-else-if="dashboard" class="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div class="rounded-[18px] border border-divider bg-white p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Salaire reçu</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(dashboard.income.salaryReceived) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">
              <span v-if="dashboard.income.salaryExpected > 0">
                {{ dashboard.income.salaryVariance >= 0 ? '+' : '' }}{{ formatEuroShort(dashboard.income.salaryVariance) }} vs prévu
              </span>
              <span v-else>aucun salaire prévu</span>
            </p>
          </div>
          <div class="rounded-[18px] border border-divider bg-white p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Épargne versée</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(dashboard.savings.total) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">ce mois</p>
          </div>
          <div class="rounded-[18px] border border-divider bg-white p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Enveloppes</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(dashboard.envelopes.totalNetSpent) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">sur {{ formatEuroShort(dashboard.envelopes.totalCeiling) }} de plafonds</p>
          </div>
          <div class="rounded-[18px] border border-divider bg-app-bg p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Reste à dépenser</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(dashboard.summary.unspent) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">soit {{ formatEuroShort(dashboard.summary.perDay) }} / jour</p>
          </div>
        </div>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between">
            <h2 class="text-[13.5px] font-extrabold text-ink">Utilisation du revenu</h2>
            <span v-if="hasIncome" class="text-[11.5px] font-semibold text-ink-faint">
              {{ formatEuroShort(dashboard.income.received) }} reçus
            </span>
          </header>

          <p v-if="!hasIncome" class="pt-4 text-[12.5px] text-ink-faint">
            Aucun revenu enregistré ce mois-ci. Ajoutez une entrée pour voir la répartition.
            <NuxtLink to="/mouvements" class="font-bold text-ink underline">Saisir un revenu</NuxtLink>
          </p>

          <div v-else class="flex flex-col items-center gap-6 pt-4 sm:flex-row sm:items-center">
            <div class="relative shrink-0">
              <svg width="140" height="140" viewBox="0 0 140 140" class="-rotate-90">
                <circle cx="70" cy="70" :r="RADIUS" fill="none" stroke="var(--color-toggle-track)" stroke-width="18" />
                <circle
                  v-for="segment in donutSegments"
                  :key="segment.key"
                  cx="70" cy="70" :r="RADIUS" fill="none"
                  :stroke="segment.color"
                  stroke-width="18"
                  :stroke-dasharray="segment.dash"
                  :stroke-dashoffset="segment.offset"
                />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-xl font-extrabold text-ink">{{ dashboard.summary.allocatedPercent }} %</span>
                <span class="text-[10px] font-semibold text-ink-faint">du revenu affecté</span>
              </div>
            </div>

            <div class="grid w-full grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <div v-for="slice in dashboard.summary.slices" :key="slice.key" class="flex items-center justify-between text-[12.5px]">
                <span class="flex items-center gap-2 font-semibold text-ink">
                  <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: SLICE_COLOR[slice.key] }" />
                  {{ SLICE_LABEL[slice.key] }}
                </span>
                <span class="font-semibold text-ink-faint">
                  {{ formatEuroShort(slice.amount) }} · {{ slice.percent }} %
                </span>
              </div>
              <div class="col-span-full flex items-center justify-between border-t border-divider pt-2 text-[12.5px]">
                <span class="font-semibold text-ink-faint">50 / 30 / 20</span>
                <span class="font-bold text-ink">
                  {{ dashboard.ruleOfThumb.actuals.besoins }} / {{ dashboard.ruleOfThumb.actuals.envies }} / {{ dashboard.ruleOfThumb.actuals.epargne }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between">
            <h2 class="text-[13.5px] font-extrabold text-ink">Enveloppes du mois</h2>
            <span class="text-[11.5px] font-semibold text-ink-faint">
              {{ formatEuroShort(dashboard.envelopes.totalRemaining) }} encore disponibles · {{ dashboard.envelopes.overspentCount }} dépassements
            </span>
          </header>

          <p v-if="!dashboard.envelopes.cards.length" class="pt-3 text-[12.5px] text-ink-faint">
            Aucune enveloppe de budget ce mois-ci.
          </p>

          <div v-else class="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <article
              v-for="card in dashboard.envelopes.cards"
              :key="card.id"
              class="rounded-[14px] border p-4"
              :class="card.remaining < 0 ? 'border-warn-bg bg-warn-bg' : 'border-divider bg-white'"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-[12.5px] font-bold text-ink">{{ card.emoji }} {{ card.name }}</span>
                <span class="text-[12.5px] font-bold" :class="card.remaining < 0 ? 'text-warn-ink' : 'text-ink'">
                  {{ formatEuroShort(card.remaining) }}
                </span>
              </div>
              <div class="mt-2 h-[6px] w-full rounded-full bg-toggle-track">
                <div
                  class="h-full rounded-full"
                  :class="card.remaining < 0 ? 'bg-warn-bar' : 'bg-mint-bar'"
                  :style="{ width: `${percentOfCeiling(card.netSpent, card.ceiling)}%` }"
                />
              </div>
              <p class="mt-1.5 text-[11px] font-semibold text-ink-faint">
                {{ formatEuroShort(card.netSpent) }} sur {{ formatEuroShort(card.ceiling) }}
                <span v-if="card.incomeCreditsTotal > 0">· +{{ formatEuroShort(card.incomeCreditsTotal) }} reçus</span>
              </p>
            </article>
          </div>
        </section>
      </div>

      <div class="flex flex-col gap-4">
        <section class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between">
            <h2 class="text-[13.5px] font-extrabold text-ink">Derniers mouvements</h2>
            <NuxtLink to="/mouvements" class="text-[11.5px] font-bold text-ink-muted">Tout voir</NuxtLink>
          </header>
          <p v-if="!dashboard.recentMovements.length" class="pt-3 text-[12.5px] text-ink-faint">
            Aucun mouvement ce mois-ci.
          </p>
          <ul v-else class="flex flex-col pt-2">
            <li v-for="movement in dashboard.recentMovements" :key="movement.id" class="flex items-center justify-between gap-2 border-b border-divider py-2.5 last:border-0">
              <span class="min-w-0">
                <span class="block truncate text-[12.5px] font-bold text-ink">{{ movement.label }}</span>
                <span class="block truncate text-[11px] text-ink-faint">{{ shortDate(movement.date) }} · {{ movement.envelopeLabel }}</span>
              </span>
              <span class="shrink-0 text-[12.5px] font-bold text-ink">{{ signedAmount(movement) }}</span>
            </li>
          </ul>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Épargne</h2>
          <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(dashboard.savings.total) }}
            <span class="text-[11.5px] font-semibold text-ink-faint">versés ce mois</span>
          </p>

          <ul v-if="dashboard.savings.byGoal.length" class="flex flex-col pt-3">
            <li v-for="goal in dashboard.savings.byGoal" :key="goal.goalId" class="flex items-center justify-between py-1.5 text-[12.5px]">
              <span class="font-semibold text-ink">{{ goal.goalName }}</span>
              <span class="font-bold text-ink">{{ formatEuro(goal.amount) }}</span>
            </li>
          </ul>

          <NuxtLink to="/mouvements" class="mt-3 block text-[11.5px] font-bold text-ink-muted">Ajouter un versement →</NuxtLink>
        </section>

        <section v-for="reserve in dashboard.reserves" :key="reserve.id" class="rounded-[18px] border border-divider bg-app-bg p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">{{ reserve.emoji }} {{ reserve.name }}</h2>
          <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(reserve.balance) }}
            <span class="text-[11.5px] font-semibold text-ink-faint">disponibles</span>
          </p>
          <p class="pt-1 text-[11.5px] text-ink-faint">
            {{ formatEuroShort(reserve.incomeCreditsTotal) }} reçus, {{ formatEuroShort(reserve.expensesTotal) }} dépensés.
            Hors budget du mois et hors règle 50/30/20 : le solde est reporté.
          </p>
        </section>
      </div>
    </div>
    <PageSkeleton v-else />
  </div>
</template>
