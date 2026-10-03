import { z } from 'zod'

export const savingsInputSchema = z.object({
  savingsGoalId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  amount: z.coerce.number().min(0),
})

export type SavingsInput = z.infer<typeof savingsInputSchema>

// Query params arrive as strings (or are absent). A present-but-empty or present-but-invalid
// value must be rejected (400) rather than silently coerced into something like 0 or NaN;
// an absent field is left undefined so the endpoint can default it to the current month.
export const savingsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
})

export type SavingsQuery = z.infer<typeof savingsQuerySchema>
