<script setup lang="ts">
type Destination = 'carry_over' | 'savings' | 'envelope'

interface ClosureEnvelope { id: string, name: string, emoji: string, ceiling: number, netSpent: number, leftover: number }
interface ClosurePagePayload {
  closable: { year: number, month: number, label: string, nextMonthName: string } | null
  nextOpening: { year: number, month: number, label: string } | null
  envelopes: ClosureEnvelope[]
  summary: { income: number, spent: number, saved: number, remaining: number } | null
  rule503020: {
    targets: { besoins: number, envies: number, epargne: number }
    actuals: { besoins: number, envies: number, epargne: number }
  } | null
  savingsGoals: { id: string, name: string, receivesSalaryVariance: boolean }[]
  defaultSavingsGoalId: string | null
  archives: { year: number, month: number, label: string, generatedAt: string }[]
}
interface Choice { destination: Destination | null, savingsGoalId: string | null, targetEnvelopeId: string | null }

const { data: closure, error, refresh } = await useFetch<ClosurePagePayload>('/api/closure', { key: 'closure' })

const isHydrated = ref(false)
onMounted(() => {
  isHydrated.value = true
})

const destinationOptions = [
  { value: 'carry_over', label: 'Reporter' },
  { value: 'savings', label: 'Épargne' },
  { value: 'envelope', label: 'Enveloppe' },
]

// Choices live only in the page: there is deliberately no persisted draft (spec §2).
const choices = ref<Record<string, Choice>>({})
watch(() => closure.value?.envelopes, (envelopes) => {
  choices.value = Object.fromEntries((envelopes ?? [])
    .filter((envelope) => envelope.leftover > 0)
    .map((envelope) => [envelope.id, { destination: null, savingsGoalId: null, targetEnvelopeId: null }]))
}, { immediate: true })

const positive = computed(() => (closure.value?.envelopes ?? []).filter((e) => e.leftover > 0))
const toDistribute = computed(() => positive.value.reduce((total, e) => total + e.leftover, 0))

function setDestination(envelopeId: string, value: string) {
  const choice = choices.value[envelopeId]
  choice.destination = value as Destination
  if (value === 'savings' && !choice.savingsGoalId) choice.savingsGoalId = closure.value?.defaultSavingsGoalId ?? null
}

function applyToAll(destination: 'carry_over' | 'savings') {
  for (const envelope of positive.value) {
    choices.value[envelope.id] = {
      destination,
      savingsGoalId: destination === 'savings' ? closure.value?.defaultSavingsGoalId ?? null : null,
      targetEnvelopeId: null,
    }
  }
}

// Shared by the tiles and the confirmation modal (spec §7.4).
const tiles = computed(() => closureTotals({
  envelopes: closure.value?.envelopes ?? [],
  choices: choices.value,
  savingsGoals: closure.value?.savingsGoals ?? [],
}))

const isSubmitting = ref(false)
const canClose = computed(() => isHydrated.value && !isSubmitting.value
  && positive.value.every((envelope) => isClosureChoiceComplete(choices.value[envelope.id])))

const envelopeName = (id: string | null) => closure.value?.envelopes.find((e) => e.id === id)?.name ?? ''
const goalName = (id: string | null) => closure.value?.savingsGoals.find((g) => g.id === id)?.name ?? ''

const recap = computed(() => positive.value.map((envelope) => {
  const choice = choices.value[envelope.id]
  const destination = choice.destination === 'carry_over'
    ? `reporté sur ${closure.value?.closable?.nextMonthName}`
    : choice.destination === 'savings' ? `vers ${goalName(choice.savingsGoalId)}` : `vers ${envelopeName(choice.targetEnvelopeId)}`
  return { id: envelope.id, label: `${envelope.emoji} ${envelope.name}`, amount: envelope.leftover, destination }
}))
const overspent = computed(() => (closure.value?.envelopes ?? []).filter((e) => e.leftover < 0))

const isConfirmOpen = ref(false)
const submitError = ref('')

async function confirmClosure() {
  const closable = closure.value?.closable
  if (!closable || isSubmitting.value) return
  submitError.value = ''
  isSubmitting.value = true
  try {
    await $fetch('/api/closure', {
      method: 'POST',
      body: {
        year: closable.year,
        month: closable.month,
        decisions: positive.value.map((envelope) => ({ envelopeId: envelope.id, ...choices.value[envelope.id] })),
      },
    })
    isConfirmOpen.value = false
    await refresh()
  }
  catch (e) {
    submitError.value = apiErrorMessage(e) ?? 'Impossible de clôturer ce mois. Réessayez dans un instant.'
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader :title="closure?.closable ? `Clôture de ${closure.closable.label.toLowerCase()}` : 'Compte rendu'">
      <template #context>
        <span v-if="closure?.closable" class="rounded-full bg-app-bg px-3 py-1 text-[12.5px] font-semibold text-ink-muted">
          {{ formatEuroShort(toDistribute) }} de reliquats à répartir
        </span>
      </template>
      <template v-if="closure?.closable" #actions>
        <button type="button" disabled class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink disabled:opacity-50">
          Télécharger le PDF
        </button>
        <button
          type="button"
          :disabled="!canClose"
          class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink disabled:opacity-50"
          @click="isConfirmOpen = true"
        >
          Clôturer et ouvrir {{ closure.closable.nextMonthName }}
        </button>
      </template>
    </PageHeader>

    <p v-if="error" class="rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink">
      Impossible de charger le compte rendu. Réessayez dans un instant.
    </p>

    <div v-else-if="closure" class="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <div class="flex flex-col gap-4">
        <section v-if="!closure.closable" class="rounded-[18px] border border-divider bg-white p-5">
          <p class="text-[13.5px] font-extrabold text-ink">Rien à clôturer.</p>
          <p v-if="closure.nextOpening" class="pt-1 text-[12.5px] font-semibold text-ink-faint">
            Prochaine clôture possible le {{ closure.nextOpening.label }}.
          </p>
        </section>

        <section v-else class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-[13.5px] font-extrabold text-ink">Répartition des reliquats</h2>
            <div class="flex gap-2">
              <button type="button" :disabled="!isHydrated || positive.length === 0" class="rounded-full bg-app-bg px-3 py-1.5 text-[12px] font-semibold text-ink-muted disabled:opacity-50" @click="applyToAll('carry_over')">
                Tout reporter
              </button>
              <button type="button" :disabled="!isHydrated || positive.length === 0 || !closure.defaultSavingsGoalId" class="rounded-full bg-app-bg px-3 py-1.5 text-[12px] font-semibold text-ink-muted disabled:opacity-50" @click="applyToAll('savings')">
                Tout épargner
              </button>
            </div>
          </header>
          <p class="pt-1 text-[12px] font-semibold text-ink-faint">
            Chaque reliquat positif part vers une destination. Un dépassement est déduit automatiquement du plafond de {{ closure.closable.nextMonthName }}.
          </p>

          <div class="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-4">
            <div class="rounded-[14px] bg-app-bg p-3" data-testid="tile-carried">
              <p class="text-[11px] font-semibold text-ink-faint">Reporté sur {{ closure.closable.nextMonthName }}</p>
              <p class="pt-1 text-[17px] font-extrabold text-ink">{{ formatEuroShort(tiles.carried) }}</p>
            </div>
            <div class="rounded-[14px] bg-app-bg p-3" data-testid="tile-savings">
              <p class="text-[11px] font-semibold text-ink-faint">Vers l'épargne</p>
              <p class="pt-1 text-[17px] font-extrabold text-ink">{{ formatEuroShort(tiles.savings) }}</p>
            </div>
            <div class="rounded-[14px] bg-app-bg p-3" data-testid="tile-other">
              <p class="text-[11px] font-semibold text-ink-faint">Autre enveloppe</p>
              <p class="pt-1 text-[17px] font-extrabold text-ink">{{ formatEuroShort(tiles.other) }}</p>
            </div>
            <div class="rounded-[14px] p-3" :class="tiles.unassigned > 0 ? 'bg-warn-bg' : 'bg-app-bg'">
              <p class="text-[11px] font-semibold text-ink-faint">Non réparti</p>
              <p class="pt-1 text-[17px] font-extrabold" :class="tiles.unassigned > 0 ? 'text-warn-ink' : 'text-ink'" data-testid="tile-unassigned">{{ formatEuro(tiles.unassigned) }}</p>
            </div>
          </div>

          <table class="mt-4 w-full text-left">
            <thead>
              <tr class="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
                <th class="py-2">Enveloppe</th>
                <th class="py-2 text-right">Reliquat</th>
                <th class="py-2 pl-4">Destination</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="envelope in closure.envelopes"
                :key="envelope.id"
                :data-testid="`row-${envelope.id}`"
                class="border-t border-divider align-top"
                :class="envelope.leftover < 0 ? 'bg-warn-bg' : ''"
              >
                <td class="py-3 text-[12.5px] font-bold text-ink">{{ envelope.emoji }} {{ envelope.name }}</td>
                <td class="py-3 text-right text-[12.5px] font-extrabold" :class="envelope.leftover < 0 ? 'text-warn-ink' : 'text-ink'">
                  {{ formatEuro(envelope.leftover) }}
                </td>
                <td class="py-3 pl-4">
                  <p v-if="envelope.leftover < 0" class="text-[12px] font-semibold text-warn-ink">
                    {{ formatEuro(envelope.leftover) }} déduits du plafond de {{ closure.closable.nextMonthName }}
                  </p>
                  <p v-else-if="envelope.leftover === 0" class="text-[12px] font-semibold text-ink-faint">Rien à répartir</p>
                  <div v-else class="flex flex-col gap-2">
                    <PillSelector
                      :options="destinationOptions"
                      :model-value="choices[envelope.id]?.destination ?? null"
                      @update:model-value="setDestination(envelope.id, $event)"
                    />
                    <select
                      v-if="choices[envelope.id]?.destination === 'savings'"
                      v-model="choices[envelope.id].savingsGoalId"
                      :data-testid="`goal-select-${envelope.id}`"
                      class="rounded-[10px] bg-app-bg px-3 py-1.5 text-[12px] font-semibold text-ink"
                    >
                      <option v-for="goal in closure.savingsGoals" :key="goal.id" :value="goal.id">{{ goal.name }}</option>
                    </select>
                    <select
                      v-if="choices[envelope.id]?.destination === 'envelope'"
                      v-model="choices[envelope.id].targetEnvelopeId"
                      :data-testid="`target-select-${envelope.id}`"
                      class="rounded-[10px] bg-app-bg px-3 py-1.5 text-[12px] font-semibold text-ink"
                    >
                      <option :value="null" disabled>Choisir une enveloppe</option>
                      <option v-for="target in closure.envelopes.filter((e) => e.id !== envelope.id)" :key="target.id" :value="target.id">
                        {{ target.emoji }} {{ target.name }}
                      </option>
                    </select>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div class="flex flex-col gap-4">
        <section v-if="closure.summary && closure.rule503020" class="rounded-[18px] border border-divider bg-white p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Résumé du mois</h2>
          <dl class="grid grid-cols-2 gap-y-2 pt-3 text-[12.5px]">
            <dt class="font-semibold text-ink-muted">Revenus</dt><dd class="text-right font-extrabold text-ink">{{ formatEuro(closure.summary.income) }}</dd>
            <dt class="font-semibold text-ink-muted">Dépensé</dt><dd class="text-right font-extrabold text-ink">{{ formatEuro(closure.summary.spent) }}</dd>
            <dt class="font-semibold text-ink-muted">Épargné</dt><dd class="text-right font-extrabold text-ink">{{ formatEuro(closure.summary.saved) }}</dd>
          </dl>
          <p class="pt-3 text-[11.5px] font-semibold text-ink-faint">
            50/30/20 : {{ closure.rule503020.actuals.besoins }} / {{ closure.rule503020.actuals.envies }} / {{ closure.rule503020.actuals.epargne }}
            (cible {{ closure.rule503020.targets.besoins }} / {{ closure.rule503020.targets.envies }} / {{ closure.rule503020.targets.epargne }})
          </p>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Archives</h2>
          <p v-if="closure.archives.length === 0" class="pt-2 text-[12px] font-semibold text-ink-faint">Aucun mois clôturé pour l'instant.</p>
          <ul v-else class="pt-2">
            <li v-for="archive in closure.archives" :key="`${archive.year}-${archive.month}`" class="flex items-center justify-between border-t border-divider py-2 first:border-t-0">
              <span class="text-[12.5px] font-bold text-ink">{{ archive.label }}</span>
              <a :href="`/api/reports/${archive.year}/${archive.month}`" download class="text-[12px] font-bold text-ink underline">PDF</a>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <UModal v-model:open="isConfirmOpen" title="Confirmer la clôture">
      <template #body>
        <ul class="flex flex-col gap-1 text-[12.5px]">
          <li v-for="line in recap" :key="line.id" class="flex justify-between gap-4">
            <span class="font-semibold text-ink">{{ line.label }} — {{ line.destination }}</span>
            <span class="font-extrabold text-ink">{{ formatEuro(line.amount) }}</span>
          </li>
          <li v-for="envelope in overspent" :key="envelope.id" class="flex justify-between gap-4 text-warn-ink">
            <span class="font-semibold">{{ envelope.emoji }} {{ envelope.name }} — déduit en {{ closure?.closable?.nextMonthName }}</span>
            <span class="font-extrabold">{{ formatEuro(envelope.leftover) }}</span>
          </li>
        </ul>
        <ul class="mt-3 flex flex-col gap-1 border-t border-divider pt-3 text-[12.5px]" data-testid="recap-totals">
          <li class="flex justify-between gap-4">
            <span class="font-semibold text-ink-muted">Reporté sur {{ closure?.closable?.nextMonthName }}</span>
            <span class="font-extrabold text-ink">{{ formatEuro(tiles.carried) }}</span>
          </li>
          <li class="flex justify-between gap-4">
            <span class="font-semibold text-ink-muted">Vers l'épargne</span>
            <span class="font-extrabold text-ink">{{ formatEuro(tiles.savings) }}</span>
          </li>
          <li v-for="goal in tiles.perGoal" :key="goal.id" class="flex justify-between gap-4 pl-3">
            <span class="font-semibold text-ink-faint">Vers {{ goal.name }} : {{ formatEuro(goal.amount) }}</span>
          </li>
          <li class="flex justify-between gap-4">
            <span class="font-semibold text-ink-muted">Vers d'autres enveloppes</span>
            <span class="font-extrabold text-ink">{{ formatEuro(tiles.other) }}</span>
          </li>
          <li class="flex justify-between gap-4">
            <span class="font-semibold text-ink-muted">Dépassements déduits</span>
            <span class="font-extrabold text-ink">{{ formatEuro(tiles.overspendDeducted) }}</span>
          </li>
        </ul>
        <p class="pt-4 text-[12.5px] font-semibold text-ink-muted">
          Cette clôture est définitive : {{ closure?.closable?.label.toLowerCase().split(' ')[0] }} ne pourra plus recevoir de mouvements.
        </p>
        <p v-if="submitError" class="mt-3 rounded-[12px] bg-warn-bg p-3 text-[12px] font-semibold text-warn-ink">{{ submitError }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button type="button" class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink" @click="isConfirmOpen = false">
            Annuler
          </button>
          <button type="button" :disabled="isSubmitting" class="rounded-[12px] bg-ink px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" @click="confirmClosure">
            Confirmer la clôture
          </button>
        </div>
      </template>
    </UModal>
  </div>
</template>
