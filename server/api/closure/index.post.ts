import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { closeMonth } from '../../utils/closureService'
import { closureInputSchema } from '../../../shared/schemas/closure'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, closureInputSchema)
  return closeMonth(event, input, new Date())
})
