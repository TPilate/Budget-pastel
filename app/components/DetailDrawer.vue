<script setup lang="ts">
defineProps<{
  title: string
}>()

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <USlideover v-model:open="open" :title="title" side="right" :ui="{ content: 'w-[380px]' }">
    <template #body>
      <slot />
    </template>
  </USlideover>
</template>
