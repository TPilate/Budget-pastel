import { requireUser } from '../../utils/auth'
import { listBudgetEnvelopeLedgers } from '../../utils/envelopeCeilingsQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return listBudgetEnvelopeLedgers(now.getFullYear(), now.getMonth() + 1)
})
