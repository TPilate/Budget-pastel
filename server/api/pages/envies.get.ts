import { requireUser } from '../../utils/auth'
import { getEnviesPage } from '../../utils/pageData'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getEnviesPage(event, new Date())
})
