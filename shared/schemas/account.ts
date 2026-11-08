import { z } from 'zod'

export const accountInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  kind: z.enum(['courant', 'epargne']).optional(),
})

export const accountPatchSchema = accountInputSchema.partial().extend({
  archivedAt: z.coerce.date().nullable().optional(),
  // z.coerce turns '' and null into 0, which would silently zero a balance.
  balance: z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number()).optional(),
})

export type AccountInput = z.infer<typeof accountInputSchema>
