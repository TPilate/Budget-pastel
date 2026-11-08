import { requireUser } from '../../utils/auth'
import { getDashboardPage } from '../../utils/pageData'
import { parseMonthParam } from '../../utils/domain/monthParam'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return getDashboardPage(event, parseMonthParam(getQuery(event).mois, now), now)
})
