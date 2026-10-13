import { requireUser } from '../../utils/auth'
import { db, withDbTimeout } from '../../utils/db'
import { validateBody } from '../../utils/validateBody'
import { assertMonthOpen } from '../../utils/monthLock'
import { transfers } from '../../../drizzle/schema'
import { transferInputSchema } from '../../../shared/schemas/transfer'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, transferInputSchema)

  // Derive date/month/year from the same UTC-based ISO string, not from
  // Date's local-timezone getters — mixing UTC parsing with local getters
  // causes an off-by-one near month boundaries on hosts running behind UTC.
  const isoDate = new Date().toISOString().slice(0, 10)
  const [transferYear, transferMonth] = isoDate.split('-').map(Number)
  // A closed month is frozen: its report and leftovers must stay true.
  await assertMonthOpen(event, transferYear, transferMonth)

  // withDbTimeout: the pool-wait queue has no timeout of its own, so an unwrapped call
  // waits forever instead of failing when the pool's slots are exhausted.
  const [row] = await withDbTimeout(db
    .insert(transfers)
    .values({
      date: isoDate,
      fromEnvelopeId: input.fromEnvelopeId,
      toEnvelopeId: input.toEnvelopeId,
      amount: String(input.amount),
      reason: input.reason,
      monthAssigned: transferMonth,
      yearAssigned: transferYear,
    })
    .returning())

  return row
})
