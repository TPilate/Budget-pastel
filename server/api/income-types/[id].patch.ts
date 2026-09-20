import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { incomeTypes } from '../../../drizzle/schema'
import { incomeTypePatchSchema } from '../../../shared/schemas/incomeType'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const input = await validateBody(event, incomeTypePatchSchema)
  return patchRow(incomeTypes, id, input)
})
