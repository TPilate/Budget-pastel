<script setup lang="ts">
const supabase = useSupabaseClient()
const { data: health } = await useFetch('/api/health')

async function handleLogout() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold text-gray-900">Connecté 🎉</h1>
    <p v-if="health" class="mt-2 text-gray-700">Session vérifiée côté serveur pour {{ health.userId }}</p>
    <button class="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-white" @click="handleLogout">
      Se déconnecter
    </button>
  </div>
</template>
