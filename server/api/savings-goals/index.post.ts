import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { db, withDbTimeout } from '../../utils/db'
import { savingsGoals } from '../../../drizzle/schema'
import { savingsGoalInputSchema } from '../../../shared/schemas/savingsGoal'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, savingsGoalInputSchema)

  // sort_order defaults to 0 at the column level, so an un-set new row would tie with the
  // first seeded poche and make list order unstable between renders. There are only ever a
  // handful of poches, so reading them all to find the current maximum is simpler than a
  // database-side aggregate for a table this small.
  // withDbTimeout because this is a pool-backed read: the pool's wait queue is untimed, so
  // an unwrapped call hangs the request forever instead of erroring when slots run out.
  const existing = await withDbTimeout(db.select({ sortOrder: savingsGoals.sortOrder }).from(savingsGoals))
  const nextSortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1

  // Drizzle's numeric columns take strings; the schema has already coerced and validated
  // the numbers, so this converts back at the boundary rather than trusting raw input.
  return insertRow(savingsGoals, {
    ...input,
    sortOrder: nextSortOrder,
    targetAmount: input.targetAmount === null || input.targetAmount === undefined
      ? null
      : String(input.targetAmount),
    monthlyAmount: String(input.monthlyAmount ?? 0),
  })
})
