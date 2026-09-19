import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import type { H3Event } from 'h3'
import { getHeader, appendResponseHeader } from 'h3'

export function createSupabaseServerClient(event: H3Event) {
  const config = useRuntimeConfig()

  return createServerClient(config.public.supabaseUrl as string, config.public.supabaseAnonKey as string, {
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
