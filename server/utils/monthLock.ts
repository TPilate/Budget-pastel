import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { compareYearMonth, monthLabel } from './domain/closure'
import { userError } from './userError'

// Data API only: it is called from pool-backed write routes, and must not take a second
// pool slot of its own while they hold one.
//
// Every month up to the latest closed one is frozen, closed or not: a movement backdated
// into an earlier, never-closed month would make that month closable, and closing it
// would rewrite the allocations of the closed month after it.
export async function assertMonthOpen(event: H3Event, year: number, month: number): Promise<void> {
  const supabase = createSupabaseServerClient(event)
  const { data, error } = await supabase
    .from('month_closures')
    .select('year, month')
    .eq('status', 'closed')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(10000))

  if (error) {
    console.error(`[monthLock] month_closures request failed: ${error.message}`)
    // Fail closed: writing into a month that might be closed would falsify its report.
    throw createError({ statusCode: 500, statusMessage: 'Failed to check month lock' })
  }

  const latestClosed = data?.[0]
  if (latestClosed && compareYearMonth({ year, month }, { year: latestClosed.year, month: latestClosed.month }) <= 0) {
    throw userError(409, 'Month closed', `${monthLabel({ year, month })} est clôturé. Affectez ce mouvement à un mois ouvert.`)
  }
}
