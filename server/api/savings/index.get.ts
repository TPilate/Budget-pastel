import { requireUser } from '../../utils/auth'
import { fetchSavings } from '../../utils/savingsQuery'
import { parseMonthParam } from '../../utils/domain/monthParam'
import { savingsQuerySchema } from '../../../shared/schemas/savings'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const query = getQuery(event)

  const parsed = savingsQuerySchema.safeParse(query)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.flatten() })
  }

  // Explicit year/month still win; otherwise ?mois=YYYY-MM, else the current Paris month.
  const fallback = parseMonthParam(query.mois, new Date())
  const year = parsed.data.year ?? fallback.year
  const month = parsed.data.month ?? fallback.month
  return fetchSavings(event, year, month)
})
