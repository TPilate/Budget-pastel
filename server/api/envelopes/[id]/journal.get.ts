import { requireUser } from '../../../utils/auth'
import { fetchEnvelopeJournal } from '../../../utils/movementsQuery'
import { parseMonthParam } from '../../../utils/domain/monthParam'

export default defineEventHandler(async (event) => {
  // The journal reads through the Data API as the signed-in user, so RLS is what
  // scopes the rows. requireUser stays for the 401: it turns "no session" into an
  // explicit error instead of an empty journal.
  await requireUser(event)

  const envelopeId = getRouterParam(event, 'id')
  if (!envelopeId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing envelope id' })
  }

  const { year, month } = parseMonthParam(getQuery(event).mois, new Date())
  return fetchEnvelopeJournal(event, envelopeId, year, month)
})
