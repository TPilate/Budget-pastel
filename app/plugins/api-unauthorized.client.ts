// A session can expire while the app is open. Since client navigations no longer re-check
// it (see app/utils/sessionGate.ts), the first /api call that answers 401 resets the flag
// and sends the visitor through the auth check again.
//
// This wraps window.fetch rather than overriding globalThis.$fetch: Nuxt captures $fetch
// once at module load, so reassigning the global reaches none of the app's calls, whereas
// ofetch reads globalThis.fetch lazily on every request, so the wrapper sees every
// $fetch / useFetch call.
//
// It navigates to /login rather than the current route: navigating to the current location
// is a duplicated navigation that vue-router drops before any guard runs. The middleware
// always checks the session when going to /login and bounces a still-valid one to '/'.
export default defineNuxtPlugin(() => {
  const verified = useState<boolean>(SESSION_STATE_KEY, () => false)
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin)
    if (sameOrigin && isUnauthorizedApiCall(url, response.status)) {
      verified.value = false
      navigateTo('/login', { replace: true })
    }
    return response
  }
})
