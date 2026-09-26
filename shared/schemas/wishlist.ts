import { z } from 'zod'

export const wishlistInputSchema = z.object({
  label: z.string().min(1),
  price: z.coerce.number().positive(),
  priority: z.enum(['haute', 'moyenne', 'basse']),
  productUrl: z.string().url().nullable().optional(),
  note: z.string().nullable().optional(),
  envelopeId: z.string().uuid().nullable().optional(),
})

export const wishlistPatchSchema = wishlistInputSchema.partial().extend({
  purchasedAt: z.coerce.date().nullable().optional(),
})

export type WishlistInput = z.infer<typeof wishlistInputSchema>
