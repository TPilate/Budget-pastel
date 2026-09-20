import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { accounts } from '../../../drizzle/schema'
import { accountInputSchema } from '../../../shared/schemas/account'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, accountInputSchema)
  return insertRow(accounts, input)
})
