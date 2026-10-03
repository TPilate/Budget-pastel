import { requireUser } from '../../utils/auth'
import { fetchSavings } from '../../utils/savingsQuery'
import { savingsQuerySchema } from '../../../shared/schemas/savings'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const query = getQuery(event)

  const parsed = savingsQuerySchema.safeParse(query)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.flatten() })
  }

  const now = new Date()
  const year = parsed.data.year ?? now.getFullYear()
  const month = parsed.data.month ?? now.getMonth() + 1
  return fetchSavings(event, year, month)
})
