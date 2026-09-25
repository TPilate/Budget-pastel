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

export async function listReserveEnvelopeBalances(): Promise<ReserveEnvelopeBalance[]> {
  const reserveEnvelopes = await db
    .select()
    .from(envelopes)
    .where(and(eq(envelopes.kind, 'reserve'), isNull(envelopes.archivedAt)))
    .orderBy(asc(envelopes.sortOrder))

  if (reserveEnvelopes.length === 0) return []

  const [allExpenses, allIncomeCredits] = await Promise.all([
    db.select().from(expenseEntries),
    db.select().from(incomeEntries),
  ])

  return reserveEnvelopes.map((envelope) => {
    const expenses = allExpenses.filter((row) => row.envelopeId === envelope.id)
    const incomeCredits = allIncomeCredits.filter((row) => row.targetEnvelopeId === envelope.id)

    const expensesTotal = expenses.reduce((sum, row) => sum + Number(row.amount), 0)
    const incomeCreditsTotal = incomeCredits.reduce((sum, row) => sum + Number(row.amount), 0)

    return {
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      balance: computeReserveBalance(incomeCreditsTotal, expensesTotal),
      incomeCreditsTotal,
      expensesTotal,
    }
  })
}
