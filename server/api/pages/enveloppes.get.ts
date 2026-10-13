import { requireUser } from '../../utils/auth'
import { getEnveloppesPage } from '../../utils/pageData'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getEnveloppesPage(event, new Date())
})
