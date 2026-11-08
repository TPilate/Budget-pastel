import { requireUser } from '../../utils/auth'
import { assertNotClosureRow } from '../../utils/transferRules'
import { assertMovable, deleteRow, loadRowOr404, requireId } from '../../utils/movementWrite'
import { savingsEntries } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const current = await loadRowOr404<typeof savingsEntries.$inferSelect>(savingsEntries, id)
  assertNotClosureRow(current, 'Versement de clôture — non modifiable.')
  await assertMovable(event, { year: current.year, month: current.month })
  return deleteRow(savingsEntries, id)
})
