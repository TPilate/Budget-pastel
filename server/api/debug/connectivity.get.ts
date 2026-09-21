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
      setTimeout(() => resolve({ ok: false, ms: Date.now() - start, error: `${label} timed out (client gave up waiting)` }), ms),
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
    withTimeout(supabase.auth.getUser(), 15000, 'auth.getUser'),
    withTimeout(db.select().from(incomeEntries).where(and(eq(incomeEntries.yearAssigned, year), eq(incomeEntries.monthAssigned, month))), 15000, 'incomeEntries'),
    withTimeout(db.select().from(incomeTypes), 15000, 'incomeTypes'),
    withTimeout(db.select().from(expenseEntries).where(and(eq(expenseEntries.yearAssigned, year), eq(expenseEntries.monthAssigned, month))), 15000, 'expenseEntries'),
    withTimeout(db.select().from(categories), 15000, 'categories'),
    withTimeout(db.select().from(savingsEntries).where(and(eq(savingsEntries.year, year), eq(savingsEntries.month, month))), 15000, 'savingsEntries'),
    withTimeout(db.select().from(savingsGoals), 15000, 'savingsGoals'),
    withTimeout(listBudgetEnvelopeLedgers(year, month), 15000, 'listBudgetEnvelopeLedgers'),
    withTimeout(getPrimaryReserveEnvelopeBalance(), 15000, 'getPrimaryReserveEnvelopeBalance'),
    withTimeout(fetchMovements(year, month), 15000, 'fetchMovements'),
  ])

  return {
    auth,
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
