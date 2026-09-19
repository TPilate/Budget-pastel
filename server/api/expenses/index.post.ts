import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { expenseEntries } from '../../../drizzle/schema'
import { expenseEntryInputSchema } from '../../../shared/schemas/expenseEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = expenseEntryInputSchema.parse(body)

  const [entryYear, entryMonth] = input.date.split('-').map(Number)

  const [row] = await db
    .insert(expenseEntries)
    .values({
      date: input.date,
      categoryId: input.categoryId,
      label: input.label,
      amount: String(input.amount),
      accountId: input.accountId ?? null,
      envelopeId: input.envelopeId ?? null,
      financedBy: input.financedBy,
      monthAssigned: entryMonth,
      yearAssigned: entryYear,
    })
    .returning()

  return row
})
