import { requireUser } from '../../utils/auth'
import { fetchAccountsOverview } from '../../utils/accountsOverviewQuery'
import { fetchMonthContext } from '../../utils/monthContext'
import { parseMonthParam } from '../../utils/domain/monthParam'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  const selected = parseMonthParam(getQuery(event).mois, now)
  const [overview, monthContext] = await Promise.all([
    fetchAccountsOverview(event, selected.year, selected.month),
    fetchMonthContext(event, selected, now),
  ])
  return { ...overview, monthContext }
})
