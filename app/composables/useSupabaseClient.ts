import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function useSupabaseClient(): SupabaseClient {
  if (!client) {
    const config = useRuntimeConfig()
    const url = config.public.supabaseUrl as string
    const key = config.public.supabaseAnonKey as string

    if (!url || !key) {
      // Return a mock client that behaves gracefully when credentials are missing
      return {
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
        },
      } as SupabaseClient
    }

    client = createBrowserClient(url, key)
  }

  return client
}
