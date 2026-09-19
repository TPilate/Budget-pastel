import { z } from 'zod'

export const envelopeInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  kind: z.enum(['budget', 'reserve']),
  defaultCeiling: z.number().nonnegative().nullable().optional(),
  fiftyThirtyTwentyBucket: z.enum(['besoins', 'envies', 'epargne']).nullable().optional(),
  carryOverDefault: z.boolean().optional(),
  showOnHome: z.boolean().optional(),
})

export const envelopePatchSchema = envelopeInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
})

export type EnvelopeInput = z.infer<typeof envelopeInputSchema>
