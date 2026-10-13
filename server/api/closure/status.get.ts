import { requireUser } from '../../utils/auth'
import { getClosureStatus } from '../../utils/closureService'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getClosureStatus(event, new Date())
})
