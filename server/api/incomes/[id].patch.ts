import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { incomeRowValues } from '../../utils/movementValues'
import { salaryExpectationFor } from '../../utils/salaryExpectation'
import { assertMovable, loadRowOr404, requireId, updateRow } from '../../utils/movementWrite'
import { incomeEntries } from '../../../drizzle/schema'
import { incomeEntryInputSchema } from '../../../shared/schemas/incomeEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const input = await validateBody(event, incomeEntryInputSchema)
  const current = await loadRowOr404<typeof incomeEntries.$inferSelect>(incomeEntries, id)

  await assertMovable(
    event,
    { year: current.yearAssigned, month: current.monthAssigned },
    { year: input.yearAssigned, month: input.monthAssigned },
  )

  // The type may have changed, so the salary expectation is re-read rather than kept.
  const expectedAmount = await salaryExpectationFor(input.incomeTypeId)
  return updateRow(incomeEntries, id, incomeRowValues(input, expectedAmount))
})
