import { requireUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { ok: true, userId: user.id }
})
