import { sql } from 'drizzle-orm'
import { db } from '../../utils/db'
import { createSupabaseServerClient } from '../../utils/supabase'

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<{ ok: true; ms: number } | { ok: false; ms: number; error: string }> {
  const start = Date.now()
  return Promise.race([
    promise.then(() => ({ ok: true as const, ms: Date.now() - start })),
    new Promise<{ ok: false; ms: number; error: string }>((resolve) =>
      setTimeout(() => resolve({ ok: false, ms: Date.now() - start, error: `${label} timed out (client gave up waiting)` }), ms),
    ),
  ]).catch((error) => ({ ok: false as const, ms: Date.now() - start, error: error instanceof Error ? error.message : String(error) }))
}

export default defineEventHandler(async (event) => {
  const supabase = createSupabaseServerClient(event)

  // 15s: longer than our configured connect_timeout (10s) and statement_timeout (10s),
  // so if either of those fires we see the REAL error from postgres.js/Postgres itself
  // instead of just "client gave up waiting" from our own race.
  const [auth, dbPing] = await Promise.all([
    withTimeout(supabase.auth.getUser(), 15000, 'auth.getUser'),
    withTimeout(db.execute(sql`select 1`), 15000, 'db ping'),
  ])

  return { auth, dbPing }
})
