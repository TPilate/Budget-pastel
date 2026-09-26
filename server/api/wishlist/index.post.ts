import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { wishlistItems } from '../../../drizzle/schema'
import { wishlistInputSchema } from '../../../shared/schemas/wishlist'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, wishlistInputSchema)
  return insertRow(wishlistItems, input)
})
