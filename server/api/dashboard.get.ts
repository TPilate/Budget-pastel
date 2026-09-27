import { requireUser } from '../utils/auth'
import { fetchDashboard } from '../utils/dashboardQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return fetchDashboard(event, now.getFullYear(), now.getMonth() + 1, now)
})
