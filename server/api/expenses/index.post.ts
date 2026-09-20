import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { validateBody } from '../../utils/validateBody'
import { expenseEntries } from '../../../drizzle/schema'
import { expenseEntryInputSchema } from '../../../shared/schemas/expenseEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, expenseEntryInputSchema)

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
