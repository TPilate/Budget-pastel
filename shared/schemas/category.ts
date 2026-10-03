import { z } from 'zod'

export const categoryInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  isFixed: z.boolean(),
  // Coerced, not z.number(): both the Paramètres create form and the inline editor on
  // /comptes submit this from a text input, so it arrives as a string. Without coercion a
  // perfectly valid "650" is rejected with a 400.
  defaultTarget: z.coerce.number().nonnegative().nullable().optional(),
  fiftyThirtyTwentyBucket: z.enum(['besoins', 'envies', 'epargne']).nullable().optional(),
})

export const categoryPatchSchema = categoryInputSchema.partial().extend({
  archivedAt: z.coerce.date().nullable().optional(),
})

export type CategoryInput = z.infer<typeof categoryInputSchema>
