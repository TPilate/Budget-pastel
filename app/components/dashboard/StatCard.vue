<script setup lang="ts">
defineProps<{
  label: string
  value: string
  hint?: string
  highlighted?: boolean
}>()
</script>

<template>
  <div class="rounded-[18px] p-4" :class="highlighted ? 'bg-toggle-track' : 'bg-white'">
    <p class="text-[12px] font-semibold text-ink-muted">{{ label }}</p>
    <p class="mt-1 text-[22px] font-extrabold text-ink">{{ value }}</p>
    <p v-if="hint" class="mt-1 text-[11px] font-medium text-ink-muted">{{ hint }}</p>
  </div>
</template>
