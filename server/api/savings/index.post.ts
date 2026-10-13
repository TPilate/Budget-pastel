import { and, eq } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { db, withDbTimeout } from '../../utils/db'
import { savingsEntries } from '../../../drizzle/schema'
import { savingsInputSchema } from '../../../shared/schemas/savings'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, savingsInputSchema)

  // savings_entries has no unique index, so uniqueness is enforced here: look for the
  // goal's existing figure for this month and update it, inserting only when absent.
  // Only `manual` rows are matched: a closure versement for the same goal and month is a
  // separate row this form must never overwrite.
  // This is a read-then-write, which is acceptable for a single-writer household app.
  // Every pool-backed call here is wrapped: postgres.js's pool-wait queue has no timeout,
  // so a call that cannot get one of the pool's 12 slots waits forever instead of failing,
  // which surfaces as a save that never resolves.
  const [existing] = await withDbTimeout(db
    .select()
    .from(savingsEntries)
    .where(and(
      eq(savingsEntries.savingsGoalId, input.savingsGoalId),
      eq(savingsEntries.year, input.year),
      eq(savingsEntries.month, input.month),
      eq(savingsEntries.source, 'manual'),
    )))

  if (existing) {
    const [row] = await withDbTimeout(db
      .update(savingsEntries)
      .set({ amount: String(input.amount) })
      .where(eq(savingsEntries.id, existing.id))
      .returning())
    return row
  }

  const [row] = await withDbTimeout(db
    .insert(savingsEntries)
    .values({
      savingsGoalId: input.savingsGoalId,
      year: input.year,
      month: input.month,
      amount: String(input.amount),
      source: 'manual',
    })
    .returning())
  return row
})
