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

// '2026-02-31' matches the shape but is no day: Date rolls it over, so compare it back.
function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Year and month of a transfer date, which the schema has already checked. */
export function transferYearMonth(date: string): { year: number, month: number } {
  const [year, month] = date.split('-').map(Number) as [number, number]
  return { year, month }
}

export const transferInputSchema = z
  .object({
    from: transferEndpointSchema,
    to: transferEndpointSchema,
    amount: z.coerce.number().positive(),
    reason: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, { message: 'Date invalide.' }),
  })
  .refine((d) => !sameEndpoint(d.from, d.to), { message: 'Choisissez deux côtés différents.', path: ['to'] })

export type TransferInput = z.infer<typeof transferInputSchema>
