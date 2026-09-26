import { requireUser } from '../../utils/auth'
import { fetchMovements } from '../../utils/movementsQuery'

export default defineEventHandler(async (event) => {
  // fetchMovements reads through the Data API as the signed-in user, so RLS is what
  // scopes the rows. requireUser stays for the 401: it turns "no session" into an
  // explicit error instead of an empty feed.
  await requireUser(event)
  const now = new Date()
  return fetchMovements(event, now.getFullYear(), now.getMonth() + 1)
})
