import { z } from 'zod'

export const closureDecisionSchema = z.object({
  envelopeId: z.string().uuid(),
  destination: z.enum(['carry_over', 'savings', 'envelope']),
  savingsGoalId: z.string().uuid().nullable().optional(),
  targetEnvelopeId: z.string().uuid().nullable().optional(),
})

export const closureInputSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  decisions: z.array(closureDecisionSchema).max(200),
})

export type ClosureInput = z.infer<typeof closureInputSchema>

export const reportParamsSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})
