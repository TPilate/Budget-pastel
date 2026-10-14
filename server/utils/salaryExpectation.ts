import { and, eq, gt, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { db, withDbTimeout } from './db'
import { fetchLatestClosedMonth } from './monthLock'
import { incomeEntries, incomeTypes } from '../../drizzle/schema'

// "Salaire reçu" counts incomes that carry an expected amount (summariseIncome). The
// amount is set once on the income type and copied onto each entry, so the dashboard,
// Épargne's variance row and the closure report all keep reading the same column.

export async function salaryExpectationFor(incomeTypeId: string): Promise<string | null> {
  const [type] = await withDbTimeout(db
    .select({ isSalary: incomeTypes.isSalary, expectedAmount: incomeTypes.expectedAmount })
    .from(incomeTypes)
    .where(eq(incomeTypes.id, incomeTypeId)))
  return type?.isSalary ? type.expectedAmount : null
}

/** Re-applies a type's expectation to its entries in open months; closed months stay frozen. */
export async function backfillSalaryExpectation(event: H3Event, incomeTypeId: string, expectedAmount: string | null): Promise<void> {
  const latestClosed = await fetchLatestClosedMonth(event)
  const sameType = eq(incomeEntries.incomeTypeId, incomeTypeId)
  const where = latestClosed
    ? and(sameType, or(
        gt(incomeEntries.yearAssigned, latestClosed.year),
        and(eq(incomeEntries.yearAssigned, latestClosed.year), gt(incomeEntries.monthAssigned, latestClosed.month)),
      ))
    : sameType

  await withDbTimeout(db.update(incomeEntries).set({ expectedAmount }).where(where).returning({ id: incomeEntries.id }))
}
