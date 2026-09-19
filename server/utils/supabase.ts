import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import type { H3Event } from 'h3'
import { getHeader, appendResponseHeader, createError } from 'h3'

export function createSupabaseServerClient(event: H3Event) {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl as string
  const key = config.public.supabaseAnonKey as string

  if (!url || !key) {
    throw createError({ statusCode: 500, statusMessage: 'Supabase is not configured' })
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(getHeader(event, 'cookie') ?? '')
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          appendResponseHeader(event, 'set-cookie', serializeCookieHeader(name, value, options))
        })
      },
    },
  })
}
