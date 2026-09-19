<script setup lang="ts">
const { open } = useEntrySheet()
const route = useRoute()

const navItems = [
  { path: '/', label: 'Accueil' },
  { path: '/enveloppes', label: 'Enveloppes' },
  { path: '/epargne', label: 'Épargne' },
  { path: '/plus/parametres', label: 'Plus' },
]
</script>

<template>
  <div class="min-h-screen bg-app-bg">
    <slot />

    <nav class="fixed inset-x-0 bottom-0 flex items-end border-t border-divider bg-white px-3 pb-6 pt-3">
      <NuxtLink
        v-for="item in navItems.slice(0, 2)"
        :key="item.path"
        :to="item.path"
        class="flex flex-1 flex-col items-center gap-1 text-[10px] font-semibold"
        :class="route.path === item.path ? 'text-ink' : 'text-ink-muted'"
      >
        {{ item.label }}
      </NuxtLink>

      <div class="flex w-[52px] items-start justify-center pb-2">
        <button
          type="button"
          class="flex size-[50px] items-center justify-center rounded-full bg-ink text-[28px] text-white"
          @click="open"
        >
          +
        </button>
      </div>

      <NuxtLink
        v-for="item in navItems.slice(2)"
        :key="item.path"
        :to="item.path"
        class="flex flex-1 flex-col items-center gap-1 text-[10px] font-semibold"
        :class="route.path === item.path ? 'text-ink' : 'text-ink-muted'"
      >
        {{ item.label }}
      </NuxtLink>
    </nav>

    <EntrySheet />
  </div>
</template>
