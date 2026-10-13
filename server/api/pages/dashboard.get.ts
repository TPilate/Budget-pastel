import { requireUser } from '../../utils/auth'
import { getDashboardPage } from '../../utils/pageData'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getDashboardPage(event, new Date())
})
