import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { savingsRowValues } from '../../utils/movementValues'
import { assertMovable, assertNotClosureVersement, loadRowOr404, requireId, updateRow } from '../../utils/movementWrite'
import { savingsEntries } from '../../../drizzle/schema'
import { savingsInputSchema } from '../../../shared/schemas/savings'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const input = await validateBody(event, savingsInputSchema)
  const current = await loadRowOr404<typeof savingsEntries.$inferSelect>(savingsEntries, id)
  assertNotClosureVersement(current)
  const values = savingsRowValues(input)

  await assertMovable(event, { year: current.year, month: current.month }, { year: values.year, month: values.month })

  return updateRow(savingsEntries, id, values)
})
