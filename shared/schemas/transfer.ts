import { z } from 'zod'

export const transferEndpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('envelope'), envelopeId: z.string().uuid() }),
  z.object({ kind: z.literal('budget') }),
  z.object({ kind: z.literal('account'), accountId: z.string().uuid() }),
])
export type TransferEndpoint = z.infer<typeof transferEndpointSchema>

export function endpointKey(e: TransferEndpoint): string {
  if (e.kind === 'envelope') return `envelope:${e.envelopeId}`
  if (e.kind === 'account') return `account:${e.accountId}`
  return 'budget'
}

export function sameEndpoint(a: TransferEndpoint, b: TransferEndpoint): boolean {
  return endpointKey(a) === endpointKey(b)
}

export const transferInputSchema = z
  .object({
    from: transferEndpointSchema,
    to: transferEndpointSchema,
    amount: z.coerce.number().positive(),
    reason: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((d) => !sameEndpoint(d.from, d.to), { message: 'Choisissez deux côtés différents.', path: ['to'] })

export type TransferInput = z.infer<typeof transferInputSchema>
