import { and, eq } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { db } from '../../utils/db'
import { savingsEntries } from '../../../drizzle/schema'
import { savingsInputSchema } from '../../../shared/schemas/savings'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, savingsInputSchema)

  // savings_entries has no unique index, so uniqueness is enforced here: look for the
  // goal's existing figure for this month and update it, inserting only when absent.
  // This is a read-then-write, which is acceptable for a single-writer household app.
  const [existing] = await db
    .select()
    .from(savingsEntries)
    .where(and(
      eq(savingsEntries.savingsGoalId, input.savingsGoalId),
      eq(savingsEntries.year, input.year),
      eq(savingsEntries.month, input.month),
    ))

  if (existing) {
    const [row] = await db
      .update(savingsEntries)
      .set({ amount: String(input.amount) })
      .where(eq(savingsEntries.id, existing.id))
      .returning()
    return row
  }

  const [row] = await db
    .insert(savingsEntries)
    .values({
      savingsGoalId: input.savingsGoalId,
      year: input.year,
      month: input.month,
      amount: String(input.amount),
    })
    .returning()
  return row
})
