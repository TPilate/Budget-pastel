import { requireUser } from '../../utils/auth'
import { getEnveloppesPage } from '../../utils/pageData'
import { parseMonthParam } from '../../utils/domain/monthParam'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return getEnveloppesPage(event, parseMonthParam(getQuery(event).mois, now), now)
})
