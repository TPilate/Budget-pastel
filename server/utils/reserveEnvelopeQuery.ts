import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { envelopes, expenseEntries, incomeEntries } from '../../drizzle/schema'
import { computeReserveBalance } from './domain/envelopeLedger'

export interface ReserveEnvelopeBalance {
  id: string
  name: string
  emoji: string
  balance: number
  incomeCreditsTotal: number
  expensesTotal: number
}

export async function getPrimaryReserveEnvelopeBalance(): Promise<ReserveEnvelopeBalance | null> {
  const [reserveEnvelope] = await db
    .select()
    .from(envelopes)
    .where(and(eq(envelopes.kind, 'reserve'), isNull(envelopes.archivedAt)))
    .orderBy(asc(envelopes.sortOrder))
    .limit(1)

  if (!reserveEnvelope) return null

  const [expenses, incomeCredits] = await Promise.all([
    db.select().from(expenseEntries).where(eq(expenseEntries.envelopeId, reserveEnvelope.id)),
    db.select().from(incomeEntries).where(eq(incomeEntries.targetEnvelopeId, reserveEnvelope.id)),
  ])

  const expensesTotal = expenses.reduce((sum, row) => sum + Number(row.amount), 0)
  const incomeCreditsTotal = incomeCredits.reduce((sum, row) => sum + Number(row.amount), 0)

  return {
    id: reserveEnvelope.id,
    name: reserveEnvelope.name,
    emoji: reserveEnvelope.emoji,
    balance: computeReserveBalance(incomeCreditsTotal, expensesTotal),
    incomeCreditsTotal,
    expensesTotal,
  }
}
