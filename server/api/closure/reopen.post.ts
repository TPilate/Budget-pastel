import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { reopenMonth } from '../../utils/closureService'
import { reportParamsSchema } from '../../../shared/schemas/closure'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { year, month } = await validateBody(event, reportParamsSchema)
  return reopenMonth(event, { year, month })
})
