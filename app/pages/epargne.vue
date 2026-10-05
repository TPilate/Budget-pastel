<script setup lang="ts">
interface PocheView {
  id: string
  name: string
  note: string | null
  balance: number
  monthlyAmount: number
  targetAmount: number | null
  progressPercent: number | null
  receivesSalaryVariance: boolean
}

interface EpargnePayload {
  month: { year: number, month: number, label: string }
  income: { received: number }
  poches: PocheView[]
  totals: { balance: number, monthly: number, monthsOfChargesCovered: number | null }
  history: { year: number, month: number, label: string, amount: number }[]
  ruleOfThumb: {
    targets: { besoins: number, envies: number, epargne: number }
    actuals: { besoins: number, envies: number, epargne: number }
    advice: { pointsShort: number, euroPerMonth: number } | null
  }
  contributions: { kind: string, label: string, detail: string, amount: number }[]
}

const { data: epargne, error, refresh } = await useFetch<EpargnePayload>('/api/epargne', {
  key: 'epargne',
})

const editingId = ref<string | null>(null)
function toggleEdit(id: string) {
  editingId.value = editingId.value === id ? null : id
}

async function onPocheSaved() {
  editingId.value = null
  await refresh()
}

// With no income the percentages mean nothing, and that is the current state rather than
// an edge case, so the panel says so instead of printing zeroes as if they were measured.
// Read from income.received, NOT from the actuals: those are zero both when there is no
// income and when there is income but nothing spent, which need different copy.
const hasIncome = computed(() => (epargne.value?.income.received ?? 0) > 0)

// Bars scale to the tallest month in the window; an all-zero window would otherwise
// divide by zero, which is exactly today's data.
const historyMax = computed(() => Math.max(1, ...(epargne.value?.history ?? []).map((m) => m.amount)))

function barHeight(amount: number) {
  return `${Math.round((amount / historyMax.value) * 100)}%`
}

// --- creating a poche ---------------------------------------------------------
const isCreating = ref(false)
const newName = ref('')
const newMonthly = ref('')
const newTarget = ref('')
const createError = ref('')
const isSubmittingNew = ref(false)

const isHydrated = ref(false)
onMounted(() => {
  isHydrated.value = true
})

async function createPoche() {
  createError.value = ''
  isSubmittingNew.value = true
  try {
    await $fetch('/api/savings-goals', {
      method: 'POST',
      body: {
        name: newName.value,
        monthlyAmount: newMonthly.value.trim().replace(',', '.') || '0',
        targetAmount: newTarget.value.trim() === '' ? null : newTarget.value.trim().replace(',', '.'),
      },
    })
    newName.value = ''
    newMonthly.value = ''
    newTarget.value = ''
    isCreating.value = false
    await refresh()
  }
  catch {
    createError.value = 'Impossible de créer cette poche.'
  }
  finally {
    isSubmittingNew.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Épargne">
      <template #context>
        <span v-if="epargne" class="rounded-full bg-app-bg px-3 py-1 text-[12.5px] font-semibold text-ink-muted">
          {{ formatEuroShort(epargne.totals.monthly) }} répartis chaque mois
        </span>
      </template>
      <template #actions>
        <button
          type="button"
          :disabled="!isHydrated"
          class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink disabled:opacity-50"
          @click="isCreating = !isCreating"
        >
          + Nouvelle poche
        </button>
      </template>
    </PageHeader>

    <p v-if="error" class="rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink">
      Impossible de charger l'épargne. Réessayez dans un instant.
    </p>

    <div v-else-if="epargne" class="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <div class="flex flex-col gap-4">
        <section class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex items-baseline justify-between">
            <h2 class="text-[13.5px] font-extrabold text-ink">Les trois poches</h2>
            <span class="text-[11.5px] font-semibold text-ink-faint">
              {{ formatEuroShort(epargne.totals.balance) }} au total
            </span>
          </header>

          <form v-if="isCreating" class="mt-3 flex flex-wrap items-end gap-2 rounded-[14px] border border-divider p-3" @submit.prevent="createPoche">
            <label class="flex flex-1 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
              Nom de la poche
              <input v-model="newName" required :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink disabled:bg-app-bg">
            </label>
            <label class="flex w-28 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
              Montant mensuel
              <input v-model="newMonthly" inputmode="decimal" :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink disabled:bg-app-bg">
            </label>
            <label class="flex w-28 flex-col gap-1 text-[11px] font-semibold text-ink-muted">
              Objectif
              <input v-model="newTarget" inputmode="decimal" placeholder="aucun" :disabled="!isHydrated" class="rounded-lg border border-divider px-2 py-1.5 text-[12.5px] text-ink disabled:bg-app-bg">
            </label>
            <button type="submit" :disabled="isSubmittingNew || !isHydrated" class="rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-ink disabled:opacity-50">
              {{ isSubmittingNew ? 'Création…' : 'Créer' }}
            </button>
            <p v-if="createError" class="w-full text-[11.5px] font-semibold text-warn-ink">{{ createError }}</p>
          </form>

          <p v-if="!epargne.poches.length" class="pt-3 text-[12.5px] text-ink-faint">
            Aucune poche pour l'instant.
          </p>

          <ul v-else class="flex flex-col gap-3 pt-3">
            <li v-for="poche in epargne.poches" :key="poche.id" class="rounded-[14px] border border-divider p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <button type="button" class="text-left text-[13px] font-bold text-ink" @click="toggleEdit(poche.id)">
                    {{ poche.name }}
                  </button>
                  <p class="text-[11px] font-medium text-ink-faint">
                    {{ formatEuroShort(poche.monthlyAmount) }} par mois<span v-if="poche.note"> · {{ poche.note }}</span>
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="text-[15px] font-extrabold text-ink">{{ formatEuroShort(poche.balance) }}</p>
                  <p v-if="poche.targetAmount !== null" class="text-[11px] text-ink-faint">
                    objectif {{ formatEuroShort(poche.targetAmount) }}
                  </p>
                  <p v-else class="text-[11px] text-ink-faint">sans objectif</p>
                </div>
              </div>

              <div v-if="poche.progressPercent !== null" class="mt-2 h-[6px] w-full rounded-full bg-toggle-track">
                <div class="h-full rounded-full bg-mint-bar" :style="{ width: `${poche.progressPercent}%` }" />
              </div>

              <PocheEditForm v-if="editingId === poche.id" :poche="poche" @saved="onPocheSaved" />
            </li>
          </ul>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Six derniers mois</h2>
          <div class="mt-4 flex items-end justify-between gap-2" style="height: 140px">
            <div v-for="point in epargne.history" :key="`${point.year}-${point.month}`" class="flex flex-1 flex-col items-center justify-end gap-2" style="height: 100%">
              <div class="w-full rounded-t-[8px] bg-violet-bar" :style="{ height: barHeight(point.amount) }" />
              <span class="text-[10.5px] font-semibold text-ink-faint">
                {{ point.label }} · {{ formatEuroShort(point.amount) }}
              </span>
            </div>
          </div>
        </section>
      </div>

      <div class="flex flex-col gap-4">
        <section class="rounded-[18px] border border-divider bg-app-bg p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Règle 50 / 30 / 20</h2>

          <p v-if="!hasIncome" class="pt-3 text-[12.5px] text-ink-faint">
            Aucun revenu enregistré ce mois-ci.
            <NuxtLink to="/mouvements" class="font-bold text-ink underline">Saisir un revenu</NuxtLink>
          </p>

          <template v-else>
            <ul class="flex flex-col pt-2">
              <li class="flex items-center justify-between py-1 text-[12.5px]">
                <span class="font-semibold text-ink-muted">Besoins · cible {{ epargne.ruleOfThumb.targets.besoins }} %</span>
                <span class="font-bold text-ink">{{ epargne.ruleOfThumb.actuals.besoins }} %</span>
              </li>
              <li class="flex items-center justify-between py-1 text-[12.5px]">
                <span class="font-semibold text-ink-muted">Envies · cible {{ epargne.ruleOfThumb.targets.envies }} %</span>
                <span class="font-bold text-ink">{{ epargne.ruleOfThumb.actuals.envies }} %</span>
              </li>
              <li class="flex items-center justify-between py-1 text-[12.5px]">
                <span class="font-semibold text-ink-muted">Épargne · cible {{ epargne.ruleOfThumb.targets.epargne }} %</span>
                <span class="font-bold text-ink">{{ epargne.ruleOfThumb.actuals.epargne }} %</span>
              </li>
            </ul>
            <p v-if="epargne.ruleOfThumb.advice" class="pt-2 text-[11.5px] font-medium text-ink-muted">
              Il manque {{ epargne.ruleOfThumb.advice.pointsShort }} points d'épargne pour atteindre la cible,
              soit environ {{ formatEuroShort(epargne.ruleOfThumb.advice.euroPerMonth) }} de plus par mois.
            </p>
          </template>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Versements du mois</h2>
          <p v-if="!epargne.contributions.length" class="pt-3 text-[12.5px] text-ink-faint">
            Aucun versement ce mois-ci.
          </p>
          <ul v-else class="flex flex-col pt-2">
            <li v-for="row in epargne.contributions" :key="row.label" class="flex items-center justify-between gap-2 border-b border-divider py-2.5 last:border-0">
              <span class="min-w-0">
                <span class="block text-[12.5px] font-bold text-ink">{{ row.label }}</span>
                <span class="block text-[11px] text-ink-faint">{{ row.detail }}</span>
              </span>
              <span class="shrink-0 text-[12.5px] font-bold text-ink">
                {{ row.amount >= 0 ? '+' : '' }}{{ formatEuro(row.amount) }}
              </span>
            </li>
          </ul>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <p class="text-[11.5px] font-semibold text-ink-faint">Épargne totale</p>
          <p class="pt-1 text-2xl font-extrabold text-ink">{{ formatEuroShort(epargne.totals.balance) }}</p>
          <p v-if="epargne.totals.monthsOfChargesCovered !== null" class="pt-1 text-[11.5px] text-ink-faint">
            {{ epargne.totals.monthsOfChargesCovered }} mois de charges couverts
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
