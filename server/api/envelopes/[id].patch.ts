import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { envelopes } from '../../../drizzle/schema'
import { envelopePatchSchema } from '../../../shared/schemas/envelope'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const input = await validateBody(event, envelopePatchSchema)
  return patchRow(envelopes, id, input)
})
