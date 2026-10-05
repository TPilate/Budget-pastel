import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { savingsGoals } from '../../../drizzle/schema'
import { savingsGoalPatchSchema } from '../../../shared/schemas/savingsGoal'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing savings goal id' })
  }

  const input = await validateBody(event, savingsGoalPatchSchema)

  // Only convert the fields that were actually sent: spreading undefined values would
  // overwrite a stored target with null on a patch that never mentioned it.
  const values: Record<string, unknown> = { ...input }
  if ('targetAmount' in input) {
    values.targetAmount = input.targetAmount === null || input.targetAmount === undefined
      ? null
      : String(input.targetAmount)
  }
  if ('monthlyAmount' in input && input.monthlyAmount !== undefined) {
    values.monthlyAmount = String(input.monthlyAmount)
  }

  return patchRow(savingsGoals, id, values)
})
