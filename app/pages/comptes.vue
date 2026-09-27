<script setup lang="ts">
interface AccountsOverview {
  bankBalance: number
  committed: number
  reallyFree: number
  accounts: { id: string, name: string, emoji: string, balance: number, kind: 'courant' | 'epargne' }[]
  fixedCharges: {
    lines: { id: string, name: string, amount: number, isSettled: boolean }[]
    total: number
    settledCount: number
    totalCount: number
  }
  variableSpend: { id: string, name: string, spent: number, ceiling: number }[]
}

const { data: overview, error } = await useFetch<AccountsOverview>('/api/accounts/overview', {
  key: 'accounts-overview',
})

const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const now = new Date()
const currentMonthLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`

// formatEuro / formatEuroShort come from app/utils/currency.ts (auto-imported by Nuxt).

const variableTotals = computed(() => {
  const rows = overview.value?.variableSpend ?? []
  return {
    spent: rows.reduce((sum, row) => sum + row.spent, 0),
    ceiling: rows.reduce((sum, row) => sum + row.ceiling, 0),
  }
})

function percent(spent: number, ceiling: number) {
  return ceiling > 0 ? Math.min(100, Math.max(0, Math.round((spent / ceiling) * 100))) : 0
}

// The fixed-charge checklist is rendered in two columns, as in the design.
const fixedColumns = computed(() => {
  const lines = overview.value?.fixedCharges.lines ?? []
  const half = Math.ceil(lines.length / 2)
  return [lines.slice(0, half), lines.slice(half)]
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Comptes">
      <template #context>
        <span class="text-[12.5px] font-semibold text-ink-muted">{{ currentMonthLabel }}</span>
      </template>
      <template #actions>
        <NuxtLink to="/parametres" class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink">
          Modifier les comptes
        </NuxtLink>
      </template>
    </PageHeader>

    <p v-if="error" class="rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink">
      Impossible de charger les comptes. Réessayez dans un instant.
    </p>

    <div v-else-if="overview" class="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="rounded-[18px] border border-divider bg-white p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Solde bancaire</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(overview.bankBalance) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">compte courant seul</p>
          </div>
          <div class="rounded-[18px] border border-divider bg-white p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Engagé par les enveloppes</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(overview.committed) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">plafonds restants et réserves</p>
          </div>
          <div class="rounded-[18px] border border-divider bg-app-bg p-5">
            <p class="text-[11.5px] font-semibold text-ink-faint">Vraiment libre</p>
            <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(overview.reallyFree) }}</p>
            <p class="pt-1 text-[11.5px] text-ink-faint">solde moins engagements</p>
          </div>
        </div>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Soldes par compte</h2>
          <p v-if="!overview.accounts.length" class="pt-3 text-[12.5px] text-ink-faint">
            Aucun compte. Ajoutez-en depuis les Paramètres.
          </p>
          <ul v-else class="flex flex-col pt-2">
            <li v-for="account in overview.accounts" :key="account.id" class="flex items-center justify-between border-b border-divider py-3 last:border-0">
              <span class="flex items-center gap-2 text-[13px] font-bold text-ink">
                <span>{{ account.emoji }}</span>
                {{ account.name }}
              </span>
              <span class="text-[13px] font-bold text-ink">{{ formatEuro(account.balance) }}</span>
            </li>
          </ul>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between">
            <h2 class="text-[13.5px] font-extrabold text-ink">Charges fixes du mois</h2>
            <span class="text-[11.5px] font-semibold text-ink-faint">
              {{ formatEuroShort(overview.fixedCharges.total) }} · {{ overview.fixedCharges.settledCount }} sur {{ overview.fixedCharges.totalCount }} pointées
            </span>
          </header>
          <p v-if="!overview.fixedCharges.totalCount" class="pt-3 text-[12.5px] text-ink-faint">
            Aucune charge fixe configurée.
          </p>
          <div v-else class="grid grid-cols-1 gap-x-8 pt-3 sm:grid-cols-2">
            <ul v-for="(column, index) in fixedColumns" :key="index" class="flex flex-col">
              <li v-for="line in column" :key="line.id" class="flex items-center justify-between py-1.5 text-[12.5px]">
                <span :class="line.isSettled ? 'font-semibold text-ink' : 'text-ink-faint'">
                  {{ line.isSettled ? '✓' : '○' }} {{ line.name }}
                </span>
                <span class="font-semibold text-ink">{{ formatEuro(line.amount) }}</span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <section class="rounded-[18px] border border-divider bg-white p-5">
        <header class="flex items-baseline justify-between">
          <h2 class="text-[13.5px] font-extrabold text-ink">Dépenses variables</h2>
        </header>
        <p class="pt-1 text-2xl font-extrabold text-ink">
          {{ formatEuroShort(variableTotals.spent) }}
          <span class="text-[11.5px] font-semibold text-ink-faint">sur {{ formatEuroShort(variableTotals.ceiling) }} prévus</span>
        </p>

        <p v-if="!overview.variableSpend.length" class="pt-3 text-[12.5px] text-ink-faint">
          Aucune enveloppe de budget ce mois-ci.
        </p>
        <ul v-else class="flex flex-col gap-3 pt-4">
          <li v-for="row in overview.variableSpend" :key="row.id" class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-[12.5px]">
              <span class="font-semibold text-ink">{{ row.name }}</span>
              <span class="font-semibold text-ink-faint">{{ formatEuroShort(row.spent) }} / {{ formatEuroShort(row.ceiling) }}</span>
            </div>
            <div class="h-1.5 w-full rounded-full bg-toggle-track">
              <div
                class="h-1.5 rounded-full"
                :class="row.spent > row.ceiling ? 'bg-warn-bar' : 'bg-mint-bar'"
                :style="{ width: `${percent(row.spent, row.ceiling)}%` }"
              />
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
