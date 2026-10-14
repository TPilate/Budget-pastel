import { z } from 'zod'

export const incomeTypeInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  requiresDetailsText: z.boolean().optional(),
  defaultTargetEnvelopeId: z.string().uuid().nullable().optional(),
  isSalary: z.boolean().optional(),
  // Coerced: Paramètres submits it from a text input.
  expectedAmount: z.coerce.number().nonnegative().nullable().optional(),
})

export const incomeTypePatchSchema = incomeTypeInputSchema.partial().extend({
  archivedAt: z.coerce.date().nullable().optional(),
})

export type IncomeTypeInput = z.infer<typeof incomeTypeInputSchema>
