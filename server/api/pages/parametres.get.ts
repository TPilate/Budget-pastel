import { requireUser } from '../../utils/auth'
import { getParametresPage } from '../../utils/pageData'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getParametresPage(event, new Date())
})
