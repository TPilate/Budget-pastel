import { createError } from 'h3'
import { requireUser } from '../../utils/auth'
import { reopenPreview } from '../../utils/closureService'

const MONTH_PARAM = /^(\d{4})-(0[1-9]|1[0-2])$/

// Not a page: an invalid `mois` is a 400, not a fallback to the current month.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const raw = getQuery(event).mois
  const match = typeof raw === 'string' ? MONTH_PARAM.exec(raw) : null
  if (!match) throw createError({ statusCode: 400, statusMessage: 'Invalid month' })
  return reopenPreview(event, { year: Number(match[1]), month: Number(match[2]) })
})
