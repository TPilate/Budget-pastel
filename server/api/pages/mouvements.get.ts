import { requireUser } from '../../utils/auth'
import { getMouvementsPage } from '../../utils/pageData'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getMouvementsPage(event, new Date())
})
