import { requireUser } from '../../../utils/auth'
import { validateBody } from '../../../utils/validateBody'
import { loadRowOr404, requireId, updateRow } from '../../../utils/movementWrite'
import { expenseEntries } from '../../../../drizzle/schema'
import { expenseVerifiedSchema } from '../../../../shared/schemas/expenseVerified'

// Ticking an expense against its receipt is bookkeeping, not a change to the money, so it
// deliberately skips the month lock: it also works on a closed month.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const { verified } = await validateBody(event, expenseVerifiedSchema)
  await loadRowOr404(expenseEntries, id)
  await updateRow(expenseEntries, id, { verifiedAt: verified ? new Date() : null })
  return { id, verified }
})
