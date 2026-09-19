import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { transfers } from '../../../drizzle/schema'
import { transferInputSchema } from '../../../shared/schemas/transfer'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = transferInputSchema.parse(body)

  // Derive date/month/year from the same UTC-based ISO string, not from
  // Date's local-timezone getters — mixing UTC parsing with local getters
  // causes an off-by-one near month boundaries on hosts running behind UTC.
  const isoDate = new Date().toISOString().slice(0, 10)
  const [transferYear, transferMonth] = isoDate.split('-').map(Number)

  const [row] = await db
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
    .returning()

  return row
})
