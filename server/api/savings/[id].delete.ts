import { requireUser } from '../../utils/auth'
import { assertMovable, assertNotClosureVersement, deleteRow, loadRowOr404, requireId } from '../../utils/movementWrite'
import { savingsEntries } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const current = await loadRowOr404<typeof savingsEntries.$inferSelect>(savingsEntries, id)
  assertNotClosureVersement(current)
  await assertMovable(event, { year: current.year, month: current.month })
  return deleteRow(savingsEntries, id)
})
