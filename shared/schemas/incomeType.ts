import { z } from 'zod'

export const incomeTypeInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  requiresDetailsText: z.boolean().optional(),
  defaultTargetEnvelopeId: z.string().uuid().nullable().optional(),
})

export const incomeTypePatchSchema = incomeTypeInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
})

export type IncomeTypeInput = z.infer<typeof incomeTypeInputSchema>
