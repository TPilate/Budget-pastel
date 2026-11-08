import { requireUser } from '../../utils/auth'
import { getMouvementsPage } from '../../utils/pageData'
import { parseMonthParam } from '../../utils/domain/monthParam'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return getMouvementsPage(event, parseMonthParam(getQuery(event).mois, now), now)
})
