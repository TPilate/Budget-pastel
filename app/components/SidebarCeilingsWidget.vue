<script setup lang="ts">
interface EnvelopeCeiling {
  id: string
  name: string
  emoji: string
  ceiling: number
  netSpent: number
  remaining: number
}

const { data } = await useFetch<EnvelopeCeiling[]>('/api/envelopes/ceilings')

const envelopesList = computed(() => data.value ?? [])
const topThree = computed(() => envelopesList.value.slice(0, 3))
const totalRemaining = computed(() => envelopesList.value.reduce((sum, envelope) => sum + envelope.remaining, 0))
</script>

<template>
  <div class="rounded-[16px] bg-app-bg p-3">
    <div class="flex items-center justify-between">
      <p class="text-[11px] font-bold text-ink">Plafonds</p>
      <p class="text-[11px] font-bold text-ink">{{ totalRemaining.toFixed(2) }} € dispo.</p>
    </div>
    <ul class="mt-2 space-y-2">
      <li v-for="envelope in topThree" :key="envelope.id" class="flex items-center justify-between text-[11px]">
        <span class="flex items-center gap-1.5 font-semibold text-ink-muted">
          <span>{{ envelope.emoji }}</span>
          <span>{{ envelope.name }}</span>
        </span>
        <span class="font-bold" :class="envelope.remaining < 0 ? 'text-warn-ink' : 'text-ink'">
          {{ envelope.remaining.toFixed(2) }} €
        </span>
      </li>
    </ul>
    <NuxtLink to="/enveloppes" class="mt-2 block text-[11px] font-bold text-ink-muted">
      Voir les {{ envelopesList.length }} enveloppes
    </NuxtLink>
  </div>
</template>
