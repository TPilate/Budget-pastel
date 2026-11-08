import { z } from 'zod'

export const accountInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
  kind: z.enum(['courant', 'epargne']).optional(),
})

export const accountPatchSchema = accountInputSchema.partial().extend({
  archivedAt: z.coerce.date().nullable().optional(),
  balance: z.coerce.number().optional(),
})

export type AccountInput = z.infer<typeof accountInputSchema>
