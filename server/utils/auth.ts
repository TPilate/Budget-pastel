import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'

export interface AuthenticatedUser {
  id: string
  email: string | null
}

export async function requireUser(event: H3Event): Promise<AuthenticatedUser> {
  const supabase = createSupabaseServerClient(event)
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  return { id: data.user.id, email: data.user.email ?? null }
}
