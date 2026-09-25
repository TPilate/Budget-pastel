import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { envelopes, monthlyEnvelopeAllocations, expenseEntries, incomeEntries, transfers } from '../../drizzle/schema'
import { computeEnvelopeLedger } from './domain/envelopeLedger'
import { deriveEnvelopeSubtitle } from './domain/envelopeSubtitle'

export interface BudgetEnvelopeLedger {
  id: string
  name: string
  emoji: string
  showOnHome: boolean
  ceiling: number
  netSpent: number
  remaining: number
  subtitle: string | null
}

export async function listBudgetEnvelopeLedgers(year: number, month: number): Promise<BudgetEnvelopeLedger[]> {
  // One query per table for the whole month, not per envelope — see this plan's Global
  // Constraints for why. Everything below groups the results in memory instead.
  const [budgetEnvelopes, allocations, allExpenses, allIncomeCredits, allTransfers] = await Promise.all([
    db
      .select()
      .from(envelopes)
      .where(and(eq(envelopes.kind, 'budget'), isNull(envelopes.archivedAt)))
      .orderBy(asc(envelopes.sortOrder)),
    db
      .select()
      .from(monthlyEnvelopeAllocations)
      .where(and(eq(monthlyEnvelopeAllocations.year, year), eq(monthlyEnvelopeAllocations.month, month))),
    db
      .select()
      .from(expenseEntries)
      .where(and(eq(expenseEntries.yearAssigned, year), eq(expenseEntries.monthAssigned, month))),
    db
      .select()
      .from(incomeEntries)
      .where(and(eq(incomeEntries.yearAssigned, year), eq(incomeEntries.monthAssigned, month))),
    db
      .select()
      .from(transfers)
      .where(and(eq(transfers.yearAssigned, year), eq(transfers.monthAssigned, month))),
  ])

  const allocationByEnvelopeId = new Map(allocations.map((allocation) => [allocation.envelopeId, allocation]))

  return budgetEnvelopes.map((envelope) => {
    const allocation = allocationByEnvelopeId.get(envelope.id)
    const expenses = allExpenses.filter((row) => row.envelopeId === envelope.id)
    const incomeCredits = allIncomeCredits.filter((row) => row.targetEnvelopeId === envelope.id)
    const transfersIn = allTransfers.filter((row) => row.toEnvelopeId === envelope.id)
    const transfersOut = allTransfers.filter((row) => row.fromEnvelopeId === envelope.id)

    const carriedOverAmount = allocation ? Number(allocation.carriedOverAmount) : 0
    const transfersInTotal = transfersIn.reduce((sum, row) => sum + Number(row.amount), 0)
    const transfersOutTotal = transfersOut.reduce((sum, row) => sum + Number(row.amount), 0)
    const incomeCreditsTotal = incomeCredits.reduce((sum, row) => sum + Number(row.amount), 0)

    const ledger = computeEnvelopeLedger({
      defaultCeiling: Number(envelope.defaultCeiling ?? 0),
      allocation: allocation
        ? {
            baseCeiling: Number(allocation.baseCeiling),
            carriedOverAmount,
            overspendDeduction: Number(allocation.overspendDeduction),
          }
        : null,
      transfersIn: transfersInTotal,
      transfersOut: transfersOutTotal,
      expensesTotal: expenses.reduce((sum, row) => sum + Number(row.amount), 0),
      incomeCreditsTotal,
    })

    return {
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      showOnHome: envelope.showOnHome,
      ...ledger,
      subtitle: deriveEnvelopeSubtitle({
        carriedOverAmount,
        netTransfer: transfersInTotal - transfersOutTotal,
        incomeCreditsTotal,
      }),
    }
  })
}
