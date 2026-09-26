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
export default defineNuxtRouteMiddleware(async (to) => {
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

  if (to.path === '/login') {
    return isAuthenticated ? navigateTo('/') : undefined
  }

  return isAuthenticated ? undefined : navigateTo('/login')
})
