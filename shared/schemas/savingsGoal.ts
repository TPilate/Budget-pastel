import { z } from 'zod'

export const savingsGoalInputSchema = z.object({
  name: z.string().min(1),
  // Coerced: both the create and edit forms submit these from text inputs, so they arrive
  // as strings. The non-coerced form has already caused a 400 on envelopes and categories.
  targetAmount: z.coerce.number().nonnegative().nullable().optional(),
  monthlyAmount: z.coerce.number().nonnegative().optional(),
  note: z.string().nullable().optional(),
  receivesSalaryVariance: z.boolean().optional(),
})

export const savingsGoalPatchSchema = savingsGoalInputSchema.partial()

export type SavingsGoalInput = z.infer<typeof savingsGoalInputSchema>
