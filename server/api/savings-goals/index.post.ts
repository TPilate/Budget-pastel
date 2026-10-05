import { requireUser } from '../../utils/auth'
import { insertRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { savingsGoals } from '../../../drizzle/schema'
import { savingsGoalInputSchema } from '../../../shared/schemas/savingsGoal'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, savingsGoalInputSchema)

  // Drizzle's numeric columns take strings; the schema has already coerced and validated
  // the numbers, so this converts back at the boundary rather than trusting raw input.
  return insertRow(savingsGoals, {
    ...input,
    targetAmount: input.targetAmount === null || input.targetAmount === undefined
      ? null
      : String(input.targetAmount),
    monthlyAmount: String(input.monthlyAmount ?? 0),
  })
})
