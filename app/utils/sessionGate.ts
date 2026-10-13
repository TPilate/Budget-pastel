// The session used to be re-checked (a Supabase Auth round trip) before every client
// navigation, ahead of any page data. It is now checked on the first load, after a
// logout, and whenever an API call answers 401 — every endpoint still checks the session
// itself, so this only removes a redundant hop, not a safeguard.

export const SESSION_STATE_KEY = 'session-verified'

export function needsSessionCheck(input: { isClient: boolean, verified: boolean, toPath: string }): boolean {
  if (!input.isClient) return true
  if (input.toPath === '/login') return true
  return !input.verified
}

export function isUnauthorizedApiCall(url: string, status: number | undefined): boolean {
  if (status !== 401) return false
  const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0]
  return path.startsWith('/api/') && path !== '/api/health'
}
