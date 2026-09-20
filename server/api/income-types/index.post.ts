import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { incomeTypes } from '../../../drizzle/schema'
import { incomeTypeInputSchema } from '../../../shared/schemas/incomeType'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, incomeTypeInputSchema)
  return insertRow(incomeTypes, input)
})
