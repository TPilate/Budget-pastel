import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { accounts } from '../../../drizzle/schema'
import { accountPatchSchema } from '../../../shared/schemas/account'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const input = await validateBody(event, accountPatchSchema)
  return patchRow(accounts, id, input)
})
