<script setup lang="ts">
import type { MonthContext } from '~~/server/utils/monthContext'

defineProps<{ context: MonthContext }>()
</script>

<template>
  <div v-if="context.closed" class="flex items-center justify-between gap-3 rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink" data-testid="closed-month-banner">
    <span>{{ context.selected.label }} est clôturé</span>
    <!-- Task 15: "Rouvrir le mois" button goes in this slot. -->
    <slot />
  </div>
</template>
