import { z } from 'zod'

export const accountInputSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().min(1),
})

export const accountPatchSchema = accountInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
})

export type AccountInput = z.infer<typeof accountInputSchema>
