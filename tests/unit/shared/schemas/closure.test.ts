import { describe, it, expect } from 'vitest'
import { closureInputSchema, reportParamsSchema } from '../../../../shared/schemas/closure'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('closure schemas', () => {
  it('accepts a decision list with optional targets', () => {
    const parsed = closureInputSchema.parse({
      year: '2026', month: '9',
      decisions: [{ envelopeId: uuid, destination: 'savings', savingsGoalId: uuid, targetEnvelopeId: null }],
    })
    expect(parsed.year).toBe(2026)
    expect(parsed.decisions[0].destination).toBe('savings')
  })

  it('rejects an unknown destination and an impossible month', () => {
    expect(closureInputSchema.safeParse({ year: 2026, month: 13, decisions: [] }).success).toBe(false)
    expect(closureInputSchema.safeParse({ year: 2026, month: 9, decisions: [{ envelopeId: uuid, destination: 'lost' }] }).success).toBe(false)
  })

  it('coerces route params', () => {
    expect(reportParamsSchema.parse({ year: '2026', month: '09' })).toEqual({ year: 2026, month: 9 })
    expect(reportParamsSchema.safeParse({ year: '2026', month: 'abc' }).success).toBe(false)
  })
})
