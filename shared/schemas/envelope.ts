import { z } from 'zod'

export const envelopeInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  kind: z.enum(['budget', 'reserve']),
  // Coerced, not z.number(): the Paramètres create form and the envelope edit form both
  // submit this from a text input, so it arrives as a string. Without coercion a perfectly
  // valid "90" is rejected with a 400.
  defaultCeiling: z.coerce.number().nonnegative().nullable().optional(),
  fiftyThirtyTwentyBucket: z.enum(['besoins', 'envies', 'epargne']).nullable().optional(),
  carryOverDefault: z.boolean().optional(),
  showOnHome: z.boolean().optional(),
})

export const envelopePatchSchema = envelopeInputSchema.partial().extend({
  archivedAt: z.coerce.date().nullable().optional(),
})

export type EnvelopeInput = z.infer<typeof envelopeInputSchema>
