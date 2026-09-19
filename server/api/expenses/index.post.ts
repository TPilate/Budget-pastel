import { requireUser } from '../../utils/auth'
import { db } from '../../utils/db'
import { expenseEntries } from '../../../drizzle/schema'
import { expenseEntryInputSchema } from '../../../shared/schemas/expenseEntry'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  const input = expenseEntryInputSchema.parse(body)

  const entryDate = new Date(input.date)

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
      monthAssigned: entryDate.getMonth() + 1,
      yearAssigned: entryDate.getFullYear(),
    })
    .returning()

  return row
})
