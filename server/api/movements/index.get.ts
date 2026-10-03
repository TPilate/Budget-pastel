import { requireUser } from '../../utils/auth'
import { fetchMovements } from '../../utils/movementsQuery'
import { savingsQuerySchema } from '../../../shared/schemas/savings'

export default defineEventHandler(async (event) => {
  // fetchMovements reads through the Data API as the signed-in user, so RLS is what
  // scopes the rows. requireUser stays for the 401: it turns "no session" into an
  // explicit error instead of an empty feed.
  await requireUser(event)
  const query = getQuery(event)

  // Reuses savingsQuerySchema (same year/month bounds) rather than defining a parallel
  // schema: a malformed value returns 400 instead of silently becoming NaN or crashing
  // with a 500, matching /api/savings.
  const parsed = savingsQuerySchema.safeParse(query)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.flatten() })
  }

  const now = new Date()
  const year = parsed.data.year ?? now.getFullYear()
  const month = parsed.data.month ?? now.getMonth() + 1
  return fetchMovements(event, year, month)
})
