<script setup lang="ts">
defineProps<{
  options: { value: string; label: string }[]
  modelValue: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="flex gap-1 rounded-[14px] bg-toggle-track p-1">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="flex-1 rounded-[11px] py-[9px] text-center text-[13px] font-bold transition-colors"
      :class="modelValue === option.value ? 'bg-ink text-white' : 'text-ink-muted'"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
