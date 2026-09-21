import { sql } from 'drizzle-orm'
import { db } from '../../utils/db'
import { createSupabaseServerClient } from '../../utils/supabase'

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<{ ok: true; ms: number } | { ok: false; ms: number; error: string }> {
  const start = Date.now()
  return Promise.race([
    promise.then(() => ({ ok: true as const, ms: Date.now() - start })),
    new Promise<{ ok: false; ms: number; error: string }>((resolve) =>
      setTimeout(() => resolve({ ok: false, ms: Date.now() - start, error: `${label} timed out` }), ms),
    ),
  ]).catch((error) => ({ ok: false as const, ms: Date.now() - start, error: error instanceof Error ? error.message : String(error) }))
}

export default defineEventHandler(async (event) => {
  const supabase = createSupabaseServerClient(event)

  const authResult = await withTimeout(supabase.auth.getUser(), 8000, 'supabase auth getUser()')
  const dbResult = await withTimeout(db.execute(sql`select 1`), 8000, 'postgres select 1')

  return {
    auth: authResult,
    db: dbResult,
  }
})
