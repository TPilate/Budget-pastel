import { requireUser } from '../../utils/auth'
import { db, withDbTimeout } from '../../utils/db'
import { validateBody } from '../../utils/validateBody'
import { assertMonthOpen } from '../../utils/monthLock'
import { expenseRowValues } from '../../utils/movementValues'
import { expenseEntries } from '../../../drizzle/schema'
import { expenseEntryInputSchema } from '../../../shared/schemas/expenseEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, expenseEntryInputSchema)
  const values = expenseRowValues(input)

  // A closed month is frozen: its report and leftovers must stay true.
  await assertMonthOpen(event, values.yearAssigned, values.monthAssigned)

  // withDbTimeout: the pool-wait queue has no timeout of its own, so an unwrapped call
  // waits forever instead of failing when the pool's slots are exhausted.
  const [row] = await withDbTimeout(db.insert(expenseEntries).values(values).returning())

  return row
})
