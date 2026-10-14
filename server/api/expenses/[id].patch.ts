import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { expenseRowValues } from '../../utils/movementValues'
import { assertMovable, loadRowOr404, requireId, updateRow } from '../../utils/movementWrite'
import { expenseEntries } from '../../../drizzle/schema'
import { expenseEntryInputSchema } from '../../../shared/schemas/expenseEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const input = await validateBody(event, expenseEntryInputSchema)
  const current = await loadRowOr404<typeof expenseEntries.$inferSelect>(expenseEntries, id)
  const values = expenseRowValues(input)

  await assertMovable(
    event,
    { year: current.yearAssigned, month: current.monthAssigned },
    { year: values.yearAssigned, month: values.monthAssigned },
  )

  return updateRow(expenseEntries, id, values)
})
