<script setup lang="ts">
import type { MonthContext } from '~~/server/utils/monthContext'

defineProps<{ title: string, monthContext?: MonthContext | null }>()
</script>

<template>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-extrabold text-ink">{{ title }}</h1>
      <MonthSelector v-if="monthContext" :context="monthContext" />
      <slot name="context" />
    </div>
    <div class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
