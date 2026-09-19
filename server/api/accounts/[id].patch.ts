import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { accounts } from '../../../drizzle/schema'
import { accountPatchSchema } from '../../../shared/schemas/account'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const body = await readBody(event)
  const input = accountPatchSchema.parse(body)
  return patchRow(accounts, id, input)
})
