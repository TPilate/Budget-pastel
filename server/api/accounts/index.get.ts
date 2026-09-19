import { requireUser } from '../../utils/auth'
import { listActiveRows } from '../../utils/referenceCrud'
import { accounts } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return listActiveRows(accounts)
})
