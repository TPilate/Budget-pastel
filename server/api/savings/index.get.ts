import { requireUser } from '../../utils/auth'
import { fetchSavings } from '../../utils/savingsQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const query = getQuery(event)
  const now = new Date()
  const year = Number(query.year ?? now.getFullYear())
  const month = Number(query.month ?? now.getMonth() + 1)
  return fetchSavings(event, year, month)
})
