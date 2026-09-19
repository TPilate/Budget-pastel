<script setup lang="ts">
defineProps<{
  options: { value: string; label: string }[]
  modelValue: string | null
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="rounded-full px-[13px] py-[9px] text-[12px] font-semibold transition-colors"
      :class="modelValue === option.value ? 'bg-ink text-white' : 'bg-app-bg text-ink-muted'"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
