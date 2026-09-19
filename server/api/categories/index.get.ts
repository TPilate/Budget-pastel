import { requireUser } from '../../utils/auth'
import { listActiveRows } from '../../utils/referenceCrud'
import { categories } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return listActiveRows(categories)
})
