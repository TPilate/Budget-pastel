import { requireUser } from '../../utils/auth'
import { listBudgetEnvelopeLedgers } from '../../utils/envelopeCeilingsQuery'
import { parseMonthParam } from '../../utils/domain/monthParam'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { year, month } = parseMonthParam(getQuery(event).mois, new Date())
  return listBudgetEnvelopeLedgers(event, year, month)
})
