import { z } from 'zod'

export const categoryInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  isFixed: z.boolean(),
  defaultTarget: z.number().nonnegative().nullable().optional(),
  fiftyThirtyTwentyBucket: z.enum(['besoins', 'envies', 'epargne']).nullable().optional(),
})

export const categoryPatchSchema = categoryInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
})

export type CategoryInput = z.infer<typeof categoryInputSchema>
