import { asc } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { savingsGoals } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return db.select().from(savingsGoals).orderBy(asc(savingsGoals.sortOrder))
})
