import { requireUser } from '../utils/auth'
import { fetchEpargne } from '../utils/epargneQuery'

const HISTORY_MONTHS = 6

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const now = new Date()
  return fetchEpargne(event, now.getFullYear(), now.getMonth() + 1, HISTORY_MONTHS)
})
