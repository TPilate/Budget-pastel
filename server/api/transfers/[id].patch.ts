import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { assertMovable, loadRowOr404, requireId, updateRow } from '../../utils/movementWrite'
import { assertNotClosureRow, assertTransferEndpoints, assertWithinBudgetLibre, transferRowValues } from '../../utils/transferRules'
import { transfers } from '../../../drizzle/schema'
import { transferInputSchema } from '../../../shared/schemas/transfer'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = requireId(event)
  const input = await validateBody(event, transferInputSchema)
  const current = await loadRowOr404<typeof transfers.$inferSelect>(transfers, id)
  assertNotClosureRow(current, 'Transfert de clôture — non modifiable.')
  const values = transferRowValues(input)

  await assertMovable(event, { year: current.yearAssigned, month: current.monthAssigned }, { year: values.yearAssigned, month: values.monthAssigned })
  await assertTransferEndpoints(event, input, current)
  await assertWithinBudgetLibre(event, input, id)

  return updateRow(transfers, id, values)
})
