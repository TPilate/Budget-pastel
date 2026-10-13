<script setup lang="ts">
// Shown while a page's single data call is in flight, so a click renders the new page
// at once instead of freezing on the old one. Shapes echo the app's cards.
</script>

<template>
  <div role="status" aria-live="polite" class="flex flex-col gap-4">
    <span class="sr-only">Chargement…</span>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <div v-for="index in 4" :key="index" class="h-[96px] animate-pulse rounded-[18px] bg-toggle-track" />
    </div>
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <div class="flex flex-col gap-3 rounded-[18px] border border-divider bg-white p-5">
        <div v-for="index in 6" :key="index" class="h-[18px] animate-pulse rounded-[9px] bg-app-bg" />
      </div>
      <div class="h-[220px] animate-pulse rounded-[18px] bg-toggle-track" />
    </div>
  </div>
</template>
