import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { accounts } from '../../../drizzle/schema'
import { accountInputSchema } from '../../../shared/schemas/account'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = accountInputSchema.parse(body)
  return insertRow(accounts, input)
})
