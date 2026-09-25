import { requireUser } from '../../../utils/auth'
import { fetchEnvelopeJournal } from '../../../utils/envelopeJournalQuery'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const envelopeId = getRouterParam(event, 'id')
  if (!envelopeId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing envelope id' })
  }

  const now = new Date()
  return fetchEnvelopeJournal(envelopeId, now.getFullYear(), now.getMonth() + 1)
})
