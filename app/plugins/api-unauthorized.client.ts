// A session can expire while the app is open. Since client navigations no longer re-check
// it (see app/utils/sessionGate.ts), the first API call that answers 401 resets the flag and
// sends the visitor through the auth check again.
export default defineNuxtPlugin(() => {
  const verified = useState<boolean>(SESSION_STATE_KEY, () => false)

  globalThis.$fetch = $fetch.create({
    onResponseError({ request, response }) {
      if (!isUnauthorizedApiCall(String(request), response?.status)) return
      verified.value = false
      return navigateTo(useRoute().fullPath, { replace: true })
    },
  }) as typeof globalThis.$fetch
})
