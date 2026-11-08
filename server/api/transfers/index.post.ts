import { requireUser } from '../../utils/auth'
import { db, withDbTimeout } from '../../utils/db'
import { validateBody } from '../../utils/validateBody'
import { assertMonthOpen } from '../../utils/monthLock'
import { assertTransferEndpoints, transferRowValues } from '../../utils/transferRules'
import { transfers } from '../../../drizzle/schema'
import { transferInputSchema } from '../../../shared/schemas/transfer'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, transferInputSchema)
  const values = transferRowValues(input)

  // A closed month is frozen: its report and leftovers must stay true.
  await assertMonthOpen(event, values.yearAssigned, values.monthAssigned)
  await assertTransferEndpoints(event, input)

  // withDbTimeout: the pool-wait queue has no timeout of its own, so an unwrapped call
  // waits forever instead of failing when the pool's slots are exhausted.
  const [row] = await withDbTimeout(db.insert(transfers).values(values).returning())

  return row
})
