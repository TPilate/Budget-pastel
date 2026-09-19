import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { envelopes } from '../../../drizzle/schema'
import { envelopePatchSchema } from '../../../shared/schemas/envelope'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const body = await readBody(event)
  const input = envelopePatchSchema.parse(body)
  return patchRow(envelopes, id, input)
})
