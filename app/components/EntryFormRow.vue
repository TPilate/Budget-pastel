<script setup lang="ts">
defineProps<{
  label: string
  iconBgClass?: string
}>()
</script>

<template>
  <div class="flex items-center gap-3 border-b border-divider py-[13px] last:border-b-0">
    <span class="size-7 shrink-0 rounded-[10px]" :class="iconBgClass ?? 'bg-toggle-track'" />
    <span class="flex-1 text-[13.5px] font-semibold text-ink-muted">{{ label }}</span>
    <div class="text-[13.5px] font-bold text-ink">
      <slot />
    </div>
  </div>
</template>
