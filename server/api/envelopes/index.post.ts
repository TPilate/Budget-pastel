import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { envelopes } from '../../../drizzle/schema'
import { envelopeInputSchema } from '../../../shared/schemas/envelope'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, envelopeInputSchema)
  return insertRow(envelopes, input)
})
