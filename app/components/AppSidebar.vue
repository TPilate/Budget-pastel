<script setup lang="ts">
const route = useRoute()
const supabase = useSupabaseClient()

const navItems = [
  { path: '/', label: 'Tableau de bord' },
  { path: '/enveloppes', label: 'Enveloppes' },
  { path: '/mouvements', label: 'Mouvements' },
  { path: '/epargne', label: 'Épargne' },
  { path: '/envies', label: 'Envies' },
  { path: '/comptes', label: 'Comptes' },
  { path: '/compte-rendu', label: 'Compte rendu' },
  { path: '/parametres', label: 'Paramètres' },
]

async function handleLogout() {
  if (!confirm('Se déconnecter ?')) return
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <aside class="flex h-screen w-[280px] shrink-0 flex-col justify-between border-r border-divider bg-white p-4">
    <div>
      <div class="flex items-center gap-2 px-2 py-2">
        <span class="flex size-8 items-center justify-center rounded-[10px] bg-primary text-[13px] font-extrabold text-primary-ink">B</span>
        <span class="text-[15px] font-extrabold text-ink">Budget</span>
      </div>

      <nav class="mt-4 flex flex-col gap-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="rounded-[10px] px-3 py-2 text-[13.5px] font-semibold"
          :class="route.path === item.path ? 'bg-toggle-track text-ink' : 'text-ink-muted'"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </div>

    <div class="flex flex-col gap-3">
      <SidebarCeilingsWidget />

      <button type="button" class="flex items-center gap-2 rounded-[10px] px-2 py-2 text-left" @click="handleLogout">
        <span class="flex size-7 items-center justify-center rounded-full bg-violet-bar text-[11px] font-bold text-white">M</span>
        <span class="text-[12.5px] font-bold text-ink">Marion</span>
      </button>
    </div>
  </aside>
</template>
