// Single place that decides where an unauthenticated (or already-authenticated) visitor
// ends up. The /login page previously did its own check with a top-level await, which
// forced a <Suspense> boundary and delayed that page's hydration; doing it here runs the
// check before the component renders instead.
//
// $fetch via useRequestFetch() rather than useFetch(): useFetch caches by an
// auto-generated key derived from the URL, and both this middleware and the login page
// requested '/api/health', so they shared one cache entry — the middleware could act on a
// stale result from before sign-in. useRequestFetch also forwards the incoming cookies
// during SSR, which a bare $fetch does not.
//
// The check runs once per visit: on the server render (first load), after a logout, when
// going to /login, and again after any /api 401 (see app/plugins/api-unauthorized.client.ts).
// Other client navigations trust the flag, since every endpoint still checks the session.
export default defineNuxtRouteMiddleware(async (to) => {
  const verified = useState<boolean>(SESSION_STATE_KEY, () => false)

  if (!needsSessionCheck({ isClient: import.meta.client, verified: verified.value, toPath: to.path })) {
    return
  }

  const request = useRequestFetch()

  let isAuthenticated = false
  try {
    await request('/api/health')
    isAuthenticated = true
  }
  catch {
    // Any failure here — 401, or the auth service being unreachable — is treated as "not
    // signed in". Sending someone to the login page is the recoverable outcome.
    isAuthenticated = false
  }

  verified.value = isAuthenticated

  if (to.path === '/login') {
    return isAuthenticated ? navigateTo('/') : undefined
  }

  return isAuthenticated ? undefined : navigateTo('/login')
})
