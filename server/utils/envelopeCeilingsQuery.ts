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
  // Fetches each table once for the whole month (not once per envelope) and groups in
  // memory: the previous version issued 5 queries PER envelope in a for-loop, which is
  // fine on a low-latency local connection but turns into ~200ms-per-round-trip * 5N
  // sequential wall-clock time against a remote pooler (e.g. a serverless function in a
  // different region than the database) — this version issues exactly 5 queries total,
  // regardless of envelope count.
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
  })
}
