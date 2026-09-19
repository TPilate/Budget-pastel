<script setup lang="ts">
const emit = defineEmits<{
  digit: [value: string]
  comma: []
  backspace: []
}>()

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '←']

function handlePress(key: string) {
  if (key === ',') {
    emit('comma')
    return
  }
  if (key === '←') {
    emit('backspace')
    return
  }
  emit('digit', key)
}
</script>

<template>
  <div class="grid grid-cols-3 gap-1.5">
    <button
      v-for="key in keys"
      :key="key"
      type="button"
      class="rounded-[13px] bg-app-bg py-[11px] text-center text-[20px] font-semibold text-ink"
      @click="handlePress(key)"
    >
      {{ key }}
    </button>
  </div>
</template>
