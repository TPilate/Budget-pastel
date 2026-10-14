import { requireUser } from '../../utils/auth'
import { assertMovable, deleteRow, loadRowOr404, requireId } from '../../utils/movementWrite'
import { expenseEntries } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const current = await loadRowOr404<typeof expenseEntries.$inferSelect>(expenseEntries, id)
  await assertMovable(event, { year: current.yearAssigned, month: current.monthAssigned })
  return deleteRow(expenseEntries, id)
})
