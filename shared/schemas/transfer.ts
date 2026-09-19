import { z } from 'zod'

export const transferInputSchema = z
  .object({
    fromEnvelopeId: z.string().uuid(),
    toEnvelopeId: z.string().uuid(),
    amount: z.number().positive(),
    reason: z.string().min(1),
  })
  .refine((data) => data.fromEnvelopeId !== data.toEnvelopeId, {
    message: 'fromEnvelopeId and toEnvelopeId must differ',
    path: ['toEnvelopeId'],
  })

export type TransferInput = z.infer<typeof transferInputSchema>
