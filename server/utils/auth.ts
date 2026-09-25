import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'

export interface AuthenticatedUser {
  id: string
  email: string | null
}

// The Supabase auth client has no built-in call timeout. Every authenticated route calls
// this on every request, and a hang here (a Supabase Auth API network blip, or something in
// the client's own per-request session-initialization logic) has been observed in production
// to hang the whole request for the full platform ceiling (minutes) instead of erroring —
// exactly the failure mode connect_timeout/statement_timeout already guard against on the
// Postgres side (see server/utils/db.ts). 8s converts that into a fast, visible 503 instead.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('auth check timed out')), ms)),
  ])
}

export async function requireUser(event: H3Event): Promise<AuthenticatedUser> {
  const supabase = createSupabaseServerClient(event)

  let data: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']
  let error: Awaited<ReturnType<typeof supabase.auth.getUser>>['error']
  try {
    ;({ data, error } = await withTimeout(supabase.auth.getUser(), 8000))
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Auth check timed out, please retry' })
  }

  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  return { id: data.user.id, email: data.user.email ?? null }
}
