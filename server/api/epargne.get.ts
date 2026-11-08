import { requireUser } from '../utils/auth'
import { fetchEpargne } from '../utils/epargneQuery'
import { fetchMonthContext } from '../utils/monthContext'
import { parseMonthParam } from '../utils/domain/monthParam'

const HISTORY_MONTHS = 6

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  const selected = parseMonthParam(getQuery(event).mois, now)
  const [epargne, monthContext] = await Promise.all([
    fetchEpargne(event, selected.year, selected.month, HISTORY_MONTHS),
    fetchMonthContext(event, selected, now),
  ])
  return { ...epargne, monthContext }
})
