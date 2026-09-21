import { and, asc, eq, isNull } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { envelopes, monthlyEnvelopeAllocations, expenseEntries, incomeEntries, transfers } from '../../../drizzle/schema'
import { computeEnvelopeLedger } from '../../utils/domain/envelopeLedger'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const budgetEnvelopes = await db
    .select()
    .from(envelopes)
    .where(and(eq(envelopes.kind, 'budget'), isNull(envelopes.archivedAt)))
    .orderBy(asc(envelopes.sortOrder))

  const results = []

  for (const envelope of budgetEnvelopes) {
    const [allocation] = await db
      .select()
      .from(monthlyEnvelopeAllocations)
      .where(and(
        eq(monthlyEnvelopeAllocations.envelopeId, envelope.id),
        eq(monthlyEnvelopeAllocations.year, year),
        eq(monthlyEnvelopeAllocations.month, month),
      ))

    const expenses = await db
      .select()
      .from(expenseEntries)
      .where(and(
        eq(expenseEntries.envelopeId, envelope.id),
        eq(expenseEntries.yearAssigned, year),
        eq(expenseEntries.monthAssigned, month),
      ))

    const incomeCredits = await db
      .select()
      .from(incomeEntries)
      .where(and(
        eq(incomeEntries.targetEnvelopeId, envelope.id),
        eq(incomeEntries.yearAssigned, year),
        eq(incomeEntries.monthAssigned, month),
      ))

    const transfersIn = await db
      .select()
      .from(transfers)
      .where(and(
        eq(transfers.toEnvelopeId, envelope.id),
        eq(transfers.yearAssigned, year),
        eq(transfers.monthAssigned, month),
      ))

    const transfersOut = await db
      .select()
      .from(transfers)
      .where(and(
        eq(transfers.fromEnvelopeId, envelope.id),
        eq(transfers.yearAssigned, year),
        eq(transfers.monthAssigned, month),
      ))

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

    results.push({
      id: envelope.id,
      name: envelope.name,
      emoji: envelope.emoji,
      ...ledger,
    })
  }

  return results
})
