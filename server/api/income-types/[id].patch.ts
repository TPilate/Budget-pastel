import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { incomeTypes } from '../../../drizzle/schema'
import { incomeTypePatchSchema } from '../../../shared/schemas/incomeType'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const body = await readBody(event)
  const input = incomeTypePatchSchema.parse(body)
  return patchRow(incomeTypes, id, input)
})
