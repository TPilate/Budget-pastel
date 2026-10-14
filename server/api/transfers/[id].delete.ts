import { requireUser } from '../../utils/auth'
import { assertMovable, deleteRow, loadRowOr404, requireId } from '../../utils/movementWrite'
import { transfers } from '../../../drizzle/schema'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const current = await loadRowOr404<typeof transfers.$inferSelect>(transfers, id)
  await assertMovable(event, { year: current.yearAssigned, month: current.monthAssigned })
  return deleteRow(transfers, id)
})
