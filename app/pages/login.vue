<script setup lang="ts">
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

const supabase = useSupabaseClient()

async function handleSubmit() {
  errorMessage.value = ''
  isSubmitting.value = true

  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })

  isSubmitting.value = false

  if (error) {
    errorMessage.value = 'Email ou mot de passe incorrect.'
    return
  }

  await navigateTo('/')
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-orange-50 px-4">
    <form class="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm" @submit.prevent="handleSubmit">
      <h1 class="text-xl font-semibold text-gray-900">Budget Planner</h1>

      <div>
        <label class="block text-sm font-medium text-gray-700" for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700" for="password">Mot de passe</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
      </div>

      <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

      <button
        type="submit"
        :disabled="isSubmitting"
        class="w-full rounded-lg bg-orange-500 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        Se connecter
      </button>
    </form>
  </div>
</template>
