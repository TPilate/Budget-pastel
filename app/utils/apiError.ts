/**
 * The server's French explanation for a refusal the user can act on — a closed month
 * (409), an incomplete closure (400) or a movement that no longer exists (404). Anything else returns null so the caller keeps
 * its own generic copy. See server/utils/userError.ts for where the message travels.
 */
export function apiErrorMessage(error: unknown): string | null {
  const e = error as { statusCode?: number, data?: { message?: unknown, data?: { message?: unknown } } } | null
  if (!e || (e.statusCode !== 409 && e.statusCode !== 400 && e.statusCode !== 404)) return null
  const message = e.data?.data?.message
  return typeof message === 'string' ? message : null
}
