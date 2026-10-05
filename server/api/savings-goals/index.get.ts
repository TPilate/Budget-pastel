import { requireUser } from '../../utils/auth'
import { db, withDbTimeout } from '../../utils/db'
import { savingsGoals } from '../../../drizzle/schema'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  // savings_goals has no archivedAt column, so every row is live.
  // withDbTimeout: an unwrapped pool call waits forever rather than erroring when the
  // pool's slots are exhausted, which would hang this request indefinitely.
  return withDbTimeout(db.select().from(savingsGoals).orderBy(asc(savingsGoals.sortOrder)))
})
