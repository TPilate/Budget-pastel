<script setup lang="ts">
interface BudgetEnvelopeLedger {
  id: string
  name: string
  emoji: string
  showOnHome: boolean
  ceiling: number
  netSpent: number
  remaining: number
  subtitle: string | null
}

interface ReserveEnvelopeBalance {
  id: string
  name: string
  emoji: string
  balance: number
  incomeCreditsTotal: number
  expensesTotal: number
}

const { data: envelopes, error: envelopesError } = await useFetch<BudgetEnvelopeLedger[]>('/api/envelopes/ceilings', { key: 'envelope-ceilings' })
const { data: reserves, error: reservesError } = await useFetch<ReserveEnvelopeBalance[]>('/api/envelopes/reserves', { key: 'reserve-envelopes' })

const totalCeiling = computed(() => (envelopes.value ?? []).reduce((sum, envelope) => sum + envelope.ceiling, 0))
const totalNetSpent = computed(() => (envelopes.value ?? []).reduce((sum, envelope) => sum + envelope.netSpent, 0))
const totalRemaining = computed(() => (envelopes.value ?? []).reduce((sum, envelope) => sum + envelope.remaining, 0))

function euro(value: number) {
  return `${value.toFixed(2).replace('.', ',')} €`
}

function progressPercent(envelope: BudgetEnvelopeLedger) {
  return envelope.ceiling > 0 ? Math.min(100, Math.max(0, Math.round((envelope.netSpent / envelope.ceiling) * 100))) : 0
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Enveloppes">
      <template #context>
        <span class="text-[12.5px] font-semibold text-ink-muted">Septembre 2026</span>
      </template>
      <template #actions>
        <NuxtLink to="/parametres" class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink">
          Modifier les plafonds
        </NuxtLink>
        <NuxtLink to="/mouvements?mode=transfer" class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink">
          ⇄ Transférer
        </NuxtLink>
      </template>
    </PageHeader>

    <div class="rounded-[22px] bg-white p-4">
      <p v-if="envelopesError" class="py-6 text-center text-[12.5px] font-semibold text-warn-ink">
        Impossible de charger les enveloppes.
      </p>
      <table v-else class="w-full text-left text-[12.5px]">
        <thead>
          <tr class="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
            <th class="pb-2">Enveloppe</th>
            <th class="pb-2 text-right">Plafond</th>
            <th class="pb-2 text-right">Dépensé</th>
            <th class="pb-2 text-right">Restant</th>
            <th class="pb-2">Progression</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="envelope in envelopes" :key="envelope.id" class="cursor-pointer border-t border-divider hover:bg-app-bg">
            <td class="py-2.5">
              <div class="flex items-center gap-2">
                <span>{{ envelope.emoji }}</span>
                <div class="flex flex-col">
                  <span class="font-semibold text-ink">{{ envelope.name }}</span>
                  <span v-if="envelope.subtitle" class="text-[10.5px] text-ink-faint">{{ envelope.subtitle }}</span>
                </div>
              </div>
            </td>
            <td class="py-2.5 text-right font-bold text-ink">{{ euro(envelope.ceiling) }}</td>
            <td class="py-2.5 text-right font-bold text-ink">{{ euro(envelope.netSpent) }}</td>
            <td class="py-2.5 text-right font-bold" :class="envelope.remaining < 0 ? 'text-warn-ink' : 'text-ink'">
              {{ euro(envelope.remaining) }}
            </td>
            <td class="py-2.5">
              <div class="h-[6px] w-full rounded-full bg-toggle-track">
                <div
                  class="h-full rounded-full"
                  :class="envelope.remaining < 0 ? 'bg-warn-bar' : 'bg-mint-bar'"
                  :style="{ width: `${progressPercent(envelope)}%` }"
                />
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t border-divider font-extrabold text-ink">
            <td class="py-2.5">Total</td>
            <td class="py-2.5 text-right">{{ euro(totalCeiling) }}</td>
            <td class="py-2.5 text-right">{{ euro(totalNetSpent) }}</td>
            <td class="py-2.5 text-right" :class="totalRemaining < 0 ? 'text-warn-ink' : 'text-ink'">{{ euro(totalRemaining) }}</td>
            <td class="py-2.5" />
          </tr>
        </tfoot>
      </table>
    </div>

    <p v-if="reservesError" class="rounded-[22px] bg-white p-4 text-[12.5px] font-semibold text-warn-ink">
      Impossible de charger les enveloppes de réserve.
    </p>
    <div v-else class="grid grid-cols-2 gap-4">
      <div v-for="reserve in reserves" :key="reserve.id" class="rounded-[22px] bg-toggle-track p-4">
        <p class="text-[12.5px] font-bold text-ink">{{ reserve.emoji }} {{ reserve.name }}</p>
        <p class="mt-1 text-[20px] font-extrabold text-ink">{{ euro(reserve.balance) }} <span class="text-[11px] font-semibold text-ink-muted">disponibles</span></p>
        <p class="mt-1 text-[11px] font-medium text-ink-muted">
          {{ euro(reserve.incomeCreditsTotal) }} reçus, {{ euro(reserve.expensesTotal) }} dépensés. Hors budget du mois et hors règle 50/30/20.
        </p>
      </div>
    </div>
  </div>
</template>
