import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { assertMonthOpen } from '../../utils/monthLock'
import { db, withDbTimeout } from '../../utils/db'
import { savingsRowValues } from '../../utils/movementValues'
import { savingsEntries } from '../../../drizzle/schema'
import { savingsInputSchema } from '../../../shared/schemas/savings'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, savingsInputSchema)
  const values = savingsRowValues(input)
  // A closed month is frozen: its report and leftovers must stay true.
  await assertMonthOpen(event, values.year, values.month)

  // Every submission is a new versement: two in the same month add up. Closure versements
  // are separate rows (source 'closure') and are never touched here.
  const [row] = await withDbTimeout(db.insert(savingsEntries).values(values).returning())
  return row
})
