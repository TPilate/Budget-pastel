import { requireUser } from '../../utils/auth'
import { db, withDbTimeout } from '../../utils/db'
import { validateBody } from '../../utils/validateBody'
import { assertMonthOpen } from '../../utils/monthLock'
import { transfers } from '../../../drizzle/schema'
import { transferInputSchema } from '../../../shared/schemas/transfer'

// en-CA formats as YYYY-MM-DD.
const PARIS_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, transferInputSchema)

  // The form has no date or month field, so the transfer is dated today in Europe/Paris,
  // where the household lives. Vercel runs in UTC: between midnight and 01:00/02:00 Paris
  // on the 1st, a UTC date would drop it into the previous, possibly closed, month.
  // Date, month and year all come from the same YYYY-MM-DD string.
  const isoDate = PARIS_DATE.format(new Date())
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
