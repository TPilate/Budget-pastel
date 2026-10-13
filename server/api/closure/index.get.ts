import { requireUser } from '../../utils/auth'
import { getClosurePage } from '../../utils/closureService'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getClosurePage(event, new Date())
})
