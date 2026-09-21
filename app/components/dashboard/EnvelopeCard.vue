<script setup lang="ts">
const props = defineProps<{
  emoji: string
  name: string
  remaining: number
  ceiling: number
  netSpent: number
}>()

const isOverspent = computed(() => props.remaining < 0)
const progressPercent = computed(() => props.ceiling > 0 ? Math.min(100, Math.round((props.netSpent / props.ceiling) * 100)) : 0)
</script>

<template>
  <div class="rounded-[16px] p-3" :class="isOverspent ? 'bg-warn-bg' : 'bg-app-bg'">
    <div class="flex items-center justify-between">
      <span class="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
        <span>{{ emoji }}</span>
        <span>{{ name }}</span>
      </span>
      <span class="text-[13px] font-extrabold" :class="isOverspent ? 'text-warn-ink' : 'text-ink'">
        {{ netSpent.toFixed(0) }} €
      </span>
    </div>
    <div class="mt-2 h-[6px] rounded-full bg-toggle-track">
      <div
        class="h-full rounded-full"
        :class="isOverspent ? 'bg-warn-bar' : 'bg-mint-bar'"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>
    <p class="mt-1 text-[10.5px] font-medium text-ink-muted">{{ netSpent.toFixed(0) }} € sur {{ ceiling.toFixed(0) }} €</p>
  </div>
</template>
