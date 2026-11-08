<script setup lang="ts">
import type { MonthContext } from '~~/server/utils/monthContext'

const props = defineProps<{ context: MonthContext }>()
const { go, mois } = useSelectedMonth()

// Step from the URL, not from the context: the context lags the URL until the response arrives.
// `target` holds a step the router has not committed yet, so a quick second click builds on it.
const target = ref<{ year: number, month: number } | null>(null)
watch(mois, () => { target.value = null })
const selected = computed(() => target.value ?? parseMoisParam(mois.value) ?? props.context.current)
const atCurrent = computed(() => compareMonths(selected.value, props.context.current) >= 0)
const atFirst = computed(() => {
  const first = props.context.firstDataMonth
  return !first || compareMonths(selected.value, first) <= 0
})
const isAway = computed(() => compareMonths(selected.value, props.context.current) !== 0)

function compareMonths(a: { year: number, month: number }, b: { year: number, month: number }) {
  return (a.year - b.year) * 12 + (a.month - b.month)
}

function step(delta: number) {
  const next = shiftMonth(selected.value, delta)
  target.value = next
  // Landing on the current month drops the param so the URL stays canonical.
  return go(compareMonths(next, props.context.current) === 0 ? null : next)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="flex items-center gap-1 rounded-[12px] bg-toggle-track p-1">
      <button type="button" aria-label="Mois précédent" :disabled="atFirst" class="rounded-[9px] px-2.5 py-1 text-[13px] font-bold text-ink disabled:opacity-40" @click="step(-1)">‹</button>
      <span class="min-w-[110px] text-center text-[12.5px] font-bold text-ink" data-testid="month-label">{{ context.selected.label }}</span>
      <button type="button" aria-label="Mois suivant" :disabled="atCurrent" class="rounded-[9px] px-2.5 py-1 text-[13px] font-bold text-ink disabled:opacity-40" @click="step(1)">›</button>
    </div>
    <button v-if="isAway" type="button" class="text-[12px] font-bold text-ink-muted underline" @click="go(null)">Revenir au mois en cours</button>
  </div>
</template>
