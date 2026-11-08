<script setup lang="ts">
import type { MonthContext } from '~~/server/utils/monthContext'

defineProps<{ context: MonthContext }>()
const confirming = ref(false)
</script>

<template>
  <div v-if="context.closed" class="space-y-3 rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink" data-testid="closed-month-banner">
    <div class="flex items-center justify-between gap-3">
      <span>{{ context.selected.label }} est clôturé</span>
      <button v-if="!confirming" type="button" class="rounded-[12px] bg-white px-3 py-1.5 text-[12px] font-bold text-ink" @click="confirming = true">
        Rouvrir le mois
      </button>
      <slot />
    </div>
    <ReopenMonthConfirm v-if="confirming" :month="context.selected" @cancel="confirming = false" @done="confirming = false" />
  </div>
</template>
