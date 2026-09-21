<script setup lang="ts">
const props = defineProps<{
  segments: { label: string; percent: number; colorClass: string }[]
  centerPercent: number
  centerLabel: string
}>()

const radius = 60
const circumference = 2 * Math.PI * radius

function dashArrayFor(percent: number) {
  const length = (percent / 100) * circumference
  return `${length} ${circumference - length}`
}

function offsetFor(index: number) {
  const before = props.segments.slice(0, index).reduce((sum, segment) => sum + segment.percent, 0)
  return -(before / 100) * circumference
}
</script>

<template>
  <div class="relative size-[140px] shrink-0">
    <svg viewBox="0 0 140 140" class="size-full -rotate-90">
      <circle cx="70" cy="70" r="60" fill="none" stroke-width="16" class="stroke-toggle-track" />
      <circle
        v-for="(segment, index) in segments"
        :key="segment.label"
        cx="70" cy="70" r="60" fill="none" stroke-width="16"
        stroke="currentColor"
        stroke-linecap="butt"
        :class="segment.colorClass"
        :stroke-dasharray="dashArrayFor(segment.percent)"
        :stroke-dashoffset="offsetFor(index)"
      />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <p class="text-[22px] font-extrabold text-ink">{{ centerPercent }} %</p>
      <p class="w-[70px] text-center text-[9.5px] font-semibold leading-tight text-ink-muted">{{ centerLabel }}</p>
    </div>
  </div>
</template>
