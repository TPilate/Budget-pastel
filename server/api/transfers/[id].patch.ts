import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { assertMovable, loadRowOr404, requireId, updateRow } from '../../utils/movementWrite'
import { transfers } from '../../../drizzle/schema'
import { transferInputSchema } from '../../../shared/schemas/transfer'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const input = await validateBody(event, transferInputSchema)
  const current = await loadRowOr404<typeof transfers.$inferSelect>(transfers, id)

  // A transfer has no date field in the form, so editing never moves it to another month.
  await assertMovable(event, { year: current.yearAssigned, month: current.monthAssigned })

  return updateRow(transfers, id, {
    fromEnvelopeId: input.fromEnvelopeId,
    toEnvelopeId: input.toEnvelopeId,
    amount: String(input.amount),
    reason: input.reason,
  })
})
