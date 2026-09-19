import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { categories } from '../../../drizzle/schema'
import { categoryPatchSchema } from '../../../shared/schemas/category'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const body = await readBody(event)
  const input = categoryPatchSchema.parse(body)
  return patchRow(categories, id, input)
})
