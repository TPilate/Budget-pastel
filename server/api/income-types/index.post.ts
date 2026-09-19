import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { incomeTypes } from '../../../drizzle/schema'
import { incomeTypeInputSchema } from '../../../shared/schemas/incomeType'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = incomeTypeInputSchema.parse(body)
  return insertRow(incomeTypes, input)
})
