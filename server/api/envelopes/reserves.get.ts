import { requireUser } from '../../utils/auth'
import { listReserveEnvelopeBalances } from '../../utils/reserveEnvelopeQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return listReserveEnvelopeBalances()
})
