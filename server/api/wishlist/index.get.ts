import { requireUser } from '../../utils/auth'
import { fetchWishlist } from '../../utils/wishlistQuery'

export default defineEventHandler(async (event) => {
  // The read runs as the signed-in user, so RLS scopes the rows. requireUser
  // turns "no session" into a 401 rather than an empty list.
  await requireUser(event)
  const now = new Date()
  return fetchWishlist(event, now.getFullYear(), now.getMonth() + 1)
})
