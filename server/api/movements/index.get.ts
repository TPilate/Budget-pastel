import { requireUser } from '../../utils/auth'
import { fetchMovements } from '../../utils/movementsQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return fetchMovements(now.getFullYear(), now.getMonth() + 1)
})
