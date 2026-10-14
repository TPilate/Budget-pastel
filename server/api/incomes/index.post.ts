import { requireUser } from '../../utils/auth'
import { db, withDbTimeout } from '../../utils/db'
import { validateBody } from '../../utils/validateBody'
import { assertMonthOpen } from '../../utils/monthLock'
import { salaryExpectationFor } from '../../utils/salaryExpectation'
import { incomeRowValues } from '../../utils/movementValues'
import { incomeEntries } from '../../../drizzle/schema'
import { incomeEntryInputSchema } from '../../../shared/schemas/incomeEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, incomeEntryInputSchema)
  // A closed month is frozen: its report and leftovers must stay true.
  await assertMonthOpen(event, input.yearAssigned, input.monthAssigned)

  const expectedAmount = await salaryExpectationFor(input.incomeTypeId)

  // withDbTimeout: the pool-wait queue has no timeout of its own, so an unwrapped call
  // waits forever instead of failing when the pool's slots are exhausted.
  const [row] = await withDbTimeout(db
    .insert(incomeEntries)
    .values(incomeRowValues(input, expectedAmount))
    .returning())

  return row
})
