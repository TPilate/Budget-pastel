import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../utils/db'
import { createSupabaseServerClient } from '../../utils/supabase'
import { incomeEntries, incomeTypes, expenseEntries, categories, savingsEntries, savingsGoals } from '../../../drizzle/schema'
import { listBudgetEnvelopeLedgers } from '../../utils/envelopeCeilingsQuery'
import { getPrimaryReserveEnvelopeBalance } from '../../utils/reserveEnvelopeQuery'
import { fetchMovements } from '../../utils/movementsQuery'

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
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [
    auth,
    dbPing,
    income,
    incomeTypesResult,
    expenses,
    categoriesResult,
    savingsEntriesResult,
    savingsGoalsResult,
    envelopeLedgers,
    reserveEnvelope,
    movements,
  ] = await Promise.all([
    withTimeout(supabase.auth.getUser(), 8000, 'auth.getUser'),
    withTimeout(db.execute(sql`select 1`), 8000, 'db ping'),
    withTimeout(db.select().from(incomeEntries).where(and(eq(incomeEntries.yearAssigned, year), eq(incomeEntries.monthAssigned, month))), 8000, 'incomeEntries'),
    withTimeout(db.select().from(incomeTypes), 8000, 'incomeTypes'),
    withTimeout(db.select().from(expenseEntries).where(and(eq(expenseEntries.yearAssigned, year), eq(expenseEntries.monthAssigned, month))), 8000, 'expenseEntries'),
    withTimeout(db.select().from(categories), 8000, 'categories'),
    withTimeout(db.select().from(savingsEntries).where(and(eq(savingsEntries.year, year), eq(savingsEntries.month, month))), 8000, 'savingsEntries'),
    withTimeout(db.select().from(savingsGoals), 8000, 'savingsGoals'),
    withTimeout(listBudgetEnvelopeLedgers(year, month), 8000, 'listBudgetEnvelopeLedgers'),
    withTimeout(getPrimaryReserveEnvelopeBalance(), 8000, 'getPrimaryReserveEnvelopeBalance'),
    withTimeout(fetchMovements(year, month), 8000, 'fetchMovements'),
  ])

  return {
    auth,
    dbPing,
    income,
    incomeTypes: incomeTypesResult,
    expenses,
    categories: categoriesResult,
    savingsEntries: savingsEntriesResult,
    savingsGoals: savingsGoalsResult,
    envelopeLedgers,
    reserveEnvelope,
    movements,
  }
})
