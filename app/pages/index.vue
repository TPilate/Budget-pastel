<script setup lang="ts">
interface BudgetEnvelopeLedger {
  id: string
  name: string
  emoji: string
  showOnHome: boolean
  ceiling: number
  netSpent: number
  remaining: number
}

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

interface DashboardSummary {
  monthLabel: string
  joursRestants: number
  salaryReceived: number
  summary: {
    budgetDuMois: number
    totalSpent: number
    resteADepenser: number
    resteADepenserParJour: number
    salaryVsExpected: number
    usagePercent: number
    breakdown: {
      fixedCharges: { amount: number; percent: number }
      envelopes: { amount: number; percent: number }
      variable: { amount: number; percent: number }
      savings: { amount: number; percent: number }
      unspent: { amount: number; percent: number }
    }
  }
  homeEnvelopes: BudgetEnvelopeLedger[]
  envelopesTotalCeiling: number
  savingsGoals: { id: string; name: string; amount: number }[]
  savingsTotal: number
  reserveEnvelope: { id: string; name: string; emoji: string; balance: number; incomeCreditsTotal: number; expensesTotal: number } | null
  recentMovements: Movement[]
}

const { data } = await useFetch<DashboardSummary>('/api/dashboard/summary', { key: 'dashboard-summary' })

function euro(value: number) {
  return `${value.toFixed(2).replace('.', ',')} €`
}

function formatMovementAmount(movement: Movement) {
  const formatted = `${Math.abs(movement.amount).toFixed(2).replace('.', ',')} €`
  if (movement.sign === 'negative') return `-${formatted}`
  if (movement.sign === 'positive') return `+${formatted}`
  return formatted
}

const donutSegments = computed(() => {
  const breakdown = data.value?.summary.breakdown
  if (!breakdown) return []
  return [
    { label: 'Charges fixes', percent: breakdown.fixedCharges.percent, colorClass: 'text-violet-bar' },
    { label: 'Enveloppes', percent: breakdown.envelopes.percent, colorClass: 'text-warn-bar' },
    { label: 'Variables', percent: breakdown.variable.percent, colorClass: 'text-mint-bar' },
    { label: 'Épargne', percent: breakdown.savings.percent, colorClass: 'text-azure-bar' },
  ]
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader :title="data?.monthLabel ?? ''">
      <template #context>
        <span v-if="data" class="text-[12.5px] font-semibold text-ink-muted">{{ data.joursRestants }} jours restants</span>
      </template>
      <template #actions>
        <NuxtLink to="/compte-rendu" class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink">
          Clôturer le mois
        </NuxtLink>
        <NuxtLink to="/mouvements" class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink">
          + Nouvelle saisie
        </NuxtLink>
      </template>
    </PageHeader>

    <template v-if="data">
      <div class="grid grid-cols-4 gap-4">
        <DashboardStatCard label="Salaire reçu" :value="euro(data.salaryReceived)" :hint="`${data.summary.salaryVsExpected >= 0 ? '+' : ''}${data.summary.salaryVsExpected.toFixed(0)} € vs prévu`" />
        <DashboardStatCard label="Épargne versée" :value="euro(data.savingsTotal)" />
        <DashboardStatCard label="Enveloppes" :value="euro(data.summary.breakdown.envelopes.amount)" :hint="`sur ${data.envelopesTotalCeiling.toFixed(0)} € de plafonds`" />
        <DashboardStatCard label="Reste à dépenser" :value="euro(data.summary.resteADepenser)" :hint="`soit ${data.summary.resteADepenserParJour.toFixed(0)} € / jour`" highlighted />
      </div>

      <div class="grid grid-cols-[auto_1fr] items-center gap-6 rounded-[22px] bg-white p-5">
        <DashboardDonutChart :segments="donutSegments" :center-percent="data.summary.usagePercent" center-label="du salaire affecté" />
        <div class="grid grid-cols-2 gap-x-8 gap-y-3 text-[12.5px]">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 font-semibold text-ink-muted"><span class="size-2 rounded-full bg-violet-bar" />Charges fixes</span>
            <span class="font-bold text-ink">{{ euro(data.summary.breakdown.fixedCharges.amount) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 font-semibold text-ink-muted"><span class="size-2 rounded-full bg-mint-bar" />Variables</span>
            <span class="font-bold text-ink">{{ euro(data.summary.breakdown.variable.amount) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 font-semibold text-ink-muted"><span class="size-2 rounded-full bg-warn-bar" />Enveloppes</span>
            <span class="font-bold text-ink">{{ euro(data.summary.breakdown.envelopes.amount) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 font-semibold text-ink-muted"><span class="size-2 rounded-full bg-azure-bar" />Épargne</span>
            <span class="font-bold text-ink">{{ euro(data.summary.breakdown.savings.amount) }}</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-[1fr_320px] gap-5">
        <div class="rounded-[22px] bg-white p-5">
          <p class="text-[13.5px] font-extrabold text-ink">Enveloppes du mois</p>
          <div class="mt-3 grid grid-cols-3 gap-3">
            <DashboardEnvelopeCard
              v-for="envelope in data.homeEnvelopes"
              :key="envelope.id"
              :emoji="envelope.emoji"
              :name="envelope.name"
              :remaining="envelope.remaining"
              :ceiling="envelope.ceiling"
              :net-spent="envelope.netSpent"
            />
          </div>
          <p v-if="data.homeEnvelopes.length === 0" class="mt-3 text-[12.5px] font-medium text-ink-muted">
            Aucune enveloppe affichée sur le tableau de bord pour le moment.
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <div class="rounded-[22px] bg-white p-4">
            <div class="flex items-center justify-between">
              <p class="text-[13px] font-extrabold text-ink">Derniers mouvements</p>
              <NuxtLink to="/mouvements" class="text-[11.5px] font-bold text-primary">Tout voir</NuxtLink>
            </div>
            <ul class="mt-2 flex flex-col gap-2">
              <li v-for="movement in data.recentMovements" :key="movement.id" class="flex items-center justify-between text-[12px]">
                <span class="font-semibold text-ink">{{ movement.label }}</span>
                <span class="font-bold" :class="movement.sign === 'negative' ? 'text-warn-ink' : movement.sign === 'positive' ? 'text-mint-ink' : 'text-ink'">
                  {{ formatMovementAmount(movement) }}
                </span>
              </li>
            </ul>
            <p v-if="data.recentMovements.length === 0" class="mt-2 text-[12px] font-medium text-ink-muted">Aucun mouvement ce mois-ci.</p>
          </div>

          <div class="rounded-[22px] bg-white p-4">
            <p class="text-[13px] font-extrabold text-ink">Épargne</p>
            <p class="mt-1 text-[20px] font-extrabold text-ink">{{ euro(data.savingsTotal) }}</p>
            <ul class="mt-2 flex flex-col gap-1.5">
              <li v-for="goal in data.savingsGoals" :key="goal.id" class="flex items-center justify-between text-[12px]">
                <span class="font-semibold text-ink-muted">{{ goal.name }}</span>
                <span class="font-bold text-ink">{{ euro(goal.amount) }}</span>
              </li>
            </ul>
          </div>

          <div v-if="data.reserveEnvelope" class="rounded-[22px] bg-toggle-track p-4">
            <p class="text-[12.5px] font-bold text-ink">{{ data.reserveEnvelope.emoji }} {{ data.reserveEnvelope.name }}</p>
            <p class="mt-1 text-[20px] font-extrabold text-ink">{{ euro(data.reserveEnvelope.balance) }} <span class="text-[11px] font-semibold text-ink-muted">disponibles</span></p>
            <p class="mt-1 text-[11px] font-medium text-ink-muted">
              {{ euro(data.reserveEnvelope.incomeCreditsTotal) }} reçus, {{ euro(data.reserveEnvelope.expensesTotal) }} dépensés. Hors budget du mois et hors règle 50/30/20.
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
