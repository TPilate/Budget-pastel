<script setup lang="ts">
definePageMeta({ layout: false })

// No top-level await here on purpose. This page used to start with
// `await useFetch('/api/health')` to bounce already-signed-in visitors to '/', which made
// it an async component wrapped in <Suspense>: hydration could not finish until that auth
// round-trip resolved (~600ms locally, more on a slow connection). For that whole window
// the server-rendered form looked interactive but was not, and two things went wrong —
// a click performed a native form GET that submitted nothing, and anything typed was
// wiped when hydration finally patched the inputs to match these empty refs.
//
// The signed-in redirect now lives in app/middleware/auth.global.ts, which runs before
// this component renders. That keeps the behaviour, removes the Suspense boundary, and
// lets the page hydrate immediately.

const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

// Hydration is fast now, but it is never instant, and correctness should not depend on
// how quickly it lands. The form stays disabled until mounted so nothing can be typed
// into or submitted from markup Vue has not taken over yet. Disabling the only submit
// button also blocks the browser's implicit submission, so Enter cannot slip through.
const isHydrated = ref(false)
onMounted(() => {
  isHydrated.value = true
})

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
          :disabled="!isHydrated"
          class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50"
        >
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700" for="password">Mot de passe</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          :disabled="!isHydrated"
          class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50"
        >
      </div>

      <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

      <button
        type="submit"
        :disabled="isSubmitting || !isHydrated"
        class="w-full rounded-lg bg-orange-500 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {{ isSubmitting ? 'Connexion…' : 'Se connecter' }}
      </button>
    </form>
  </div>
</template>
