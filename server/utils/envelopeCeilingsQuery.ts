import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { envelopes, monthlyEnvelopeAllocations, expenseEntries, incomeEntries, transfers } from '../../drizzle/schema'
import { computeEnvelopeLedger } from './domain/envelopeLedger'

export interface BudgetEnvelopeLedger {
  id: string
  name: string
  emoji: string
  showOnHome: boolean
  ceiling: number
  netSpent: number
  remaining: number
}

export async function listBudgetEnvelopeLedgers(year: number, month: number): Promise<BudgetEnvelopeLedger[]> {
  const budgetEnvelopes = await db
    .select()
    .from(envelopes)
    .where(and(eq(envelopes.kind, 'budget'), isNull(envelopes.archivedAt)))
    .orderBy(asc(envelopes.sortOrder))

  const results = await Promise.all(budgetEnvelopes.map(async (envelope) => {
    const [[allocation], expenses, incomeCredits, transfersIn, transfersOut] = await Promise.all([
      db
        .select()
        .from(monthlyEnvelopeAllocations)
        .where(and(
          eq(monthlyEnvelopeAllocations.envelopeId, envelope.id),
          eq(monthlyEnvelopeAllocations.year, year),
          eq(monthlyEnvelopeAllocations.month, month),
        )),
      db
        .select()
        .from(expenseEntries)
        .where(and(
          eq(expenseEntries.envelopeId, envelope.id),
          eq(expenseEntries.yearAssigned, year),
          eq(expenseEntries.monthAssigned, month),
        )),
      db
        .select()
        .from(incomeEntries)
        .where(and(
          eq(incomeEntries.targetEnvelopeId, envelope.id),
          eq(incomeEntries.yearAssigned, year),
          eq(incomeEntries.monthAssigned, month),
        )),
      db
        .select()
        .from(transfers)
        .where(and(
          eq(transfers.toEnvelopeId, envelope.id),
          eq(transfers.yearAssigned, year),
          eq(transfers.monthAssigned, month),
        )),
      db
        .select()
        .from(transfers)
        .where(and(
          eq(transfers.fromEnvelopeId, envelope.id),
          eq(transfers.yearAssigned, year),
          eq(transfers.monthAssigned, month),
        )),
    ])

    const ledger = computeEnvelopeLedger({
      defaultCeiling: Number(envelope.defaultCeiling ?? 0),
      allocation: allocation
        ? {
            baseCeiling: Number(allocation.baseCeiling),
            carriedOverAmount: Number(allocation.carriedOverAmount),
            overspendDeduction: Number(allocation.overspendDeduction),
          }
        : null,
      transfersIn: transfersIn.reduce((sum, row) => sum + Number(row.amount), 0),
      transfersOut: transfersOut.reduce((sum, row) => sum + Number(row.amount), 0),
      expensesTotal: expenses.reduce((sum, row) => sum + Number(row.amount), 0),
      incomeCreditsTotal: incomeCredits.reduce((sum, row) => sum + Number(row.amount), 0),
    })

    return {
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      showOnHome: envelope.showOnHome,
      ...ledger,
    }
  }))

  return results
}
