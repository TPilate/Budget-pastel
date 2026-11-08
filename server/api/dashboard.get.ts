import { requireUser } from '../utils/auth'
import { fetchDashboard } from '../utils/dashboardQuery'
import { parseMonthParam } from '../utils/domain/monthParam'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  const { year, month } = parseMonthParam(getQuery(event).mois, now)
  return fetchDashboard(event, year, month, now)
})
