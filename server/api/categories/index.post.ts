import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { categories } from '../../../drizzle/schema'
import { categoryInputSchema } from '../../../shared/schemas/category'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = categoryInputSchema.parse(body)
  return insertRow(categories, input)
})
