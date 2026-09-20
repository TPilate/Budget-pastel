import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { categories } from '../../../drizzle/schema'
import { categoryInputSchema } from '../../../shared/schemas/category'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, categoryInputSchema)
  return insertRow(categories, input)
})
