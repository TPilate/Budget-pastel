import { z } from 'zod'

export const savingsInputSchema = z.object({
  savingsGoalId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  amount: z.coerce.number().min(0),
})

export type SavingsInput = z.infer<typeof savingsInputSchema>
