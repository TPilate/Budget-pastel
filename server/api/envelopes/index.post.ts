import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { envelopes } from '../../../drizzle/schema'
import { envelopeInputSchema } from '../../../shared/schemas/envelope'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = envelopeInputSchema.parse(body)
  return insertRow(envelopes, input)
})
