import { requireUser } from '../../utils/auth'
import { fetchAccountsOverview } from '../../utils/accountsOverviewQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return fetchAccountsOverview(event, now.getFullYear(), now.getMonth() + 1)
})
