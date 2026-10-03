import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { savingsGoals } from '../../../drizzle/schema'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  // savings_goals has no archivedAt column, so every row is live.
  return db.select().from(savingsGoals).orderBy(asc(savingsGoals.sortOrder))
})
