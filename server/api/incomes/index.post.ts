import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { incomeEntries } from '../../../drizzle/schema'
import { incomeEntryInputSchema } from '../../../shared/schemas/incomeEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = incomeEntryInputSchema.parse(body)

  const [row] = await db
    .insert(incomeEntries)
    .values({
      incomeTypeId: input.incomeTypeId,
      label: input.label,
      amount: String(input.amount),
      dateReceived: input.dateReceived,
      monthAssigned: input.monthAssigned,
      yearAssigned: input.yearAssigned,
      detailsText: input.detailsText ?? null,
      targetEnvelopeId: input.targetEnvelopeId ?? null,
    })
    .returning()

  return row
})
