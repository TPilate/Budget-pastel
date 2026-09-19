import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function useSupabaseClient(): SupabaseClient {
  if (!client) {
    const config = useRuntimeConfig()
    client = createBrowserClient(config.public.supabaseUrl as string, config.public.supabaseAnonKey as string)
  }

  return client
}
