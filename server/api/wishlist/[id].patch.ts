import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { wishlistItems } from '../../../drizzle/schema'
import { wishlistPatchSchema } from '../../../shared/schemas/wishlist'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing wishlist item id' })
  }

  const input = await validateBody(event, wishlistPatchSchema)
  return patchRow(wishlistItems, id, input)
})
