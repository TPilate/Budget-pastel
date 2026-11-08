import { describe, it, expect } from 'vitest'
import { transferInputSchema, endpointKey } from '../../../../shared/schemas/transfer'

const E1 = '11111111-1111-1111-1111-111111111111'
const E2 = '22222222-2222-2222-2222-222222222222'
const A1 = '33333333-3333-3333-3333-333333333333'
const A2 = '44444444-4444-4444-4444-444444444444'

const env = (id: string) => ({ kind: 'envelope' as const, envelopeId: id })
const acc = (id: string) => ({ kind: 'account' as const, accountId: id })
const budget = { kind: 'budget' as const }
const base = { amount: 20, reason: "Dîner d'anniversaire", date: '2026-10-12' }

const allowed: Array<[string, any, any]> = [
  ['envelope to envelope', env(E1), env(E2)],
  ['envelope to budget', env(E1), budget],
  ['envelope to account', env(E1), acc(A1)],
  ['budget to envelope', budget, env(E1)],
  ['budget to account', budget, acc(A1)],
  ['account to envelope', acc(A1), env(E1)],
  ['account to budget', acc(A1), budget],
  ['account to account', acc(A1), acc(A2)],
]

describe('transferInputSchema', () => {
  it.each(allowed)('accepts %s', (_name, from, to) => {
    expect(transferInputSchema.safeParse({ ...base, from, to }).success).toBe(true)
  })

  it.each([
    ['budget to budget', budget, budget],
    ['the same envelope', env(E1), env(E1)],
    ['the same account', acc(A1), acc(A1)],
  ])('refuses %s on both sides', (_name, from, to) => {
    const result = transferInputSchema.safeParse({ ...base, from, to })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe('Choisissez deux côtés différents.')
  })

  it('refuses a missing or invalid date', () => {
    const sides = { from: budget, to: acc(A1) }
    expect(transferInputSchema.safeParse({ ...base, ...sides, date: undefined }).success).toBe(false)
    expect(transferInputSchema.safeParse({ ...base, ...sides, date: '12/10/2026' }).success).toBe(false)
  })

  it('coerces a text amount', () => {
    const parsed = transferInputSchema.parse({ ...base, from: budget, to: acc(A1), amount: '12.5' })
    expect(parsed.amount).toBe(12.5)
  })

  it('rejects a non-positive amount and an empty reason', () => {
    expect(transferInputSchema.safeParse({ ...base, from: budget, to: acc(A1), amount: 0 }).success).toBe(false)
    expect(transferInputSchema.safeParse({ ...base, from: budget, to: acc(A1), reason: '' }).success).toBe(false)
  })

  it('keys endpoints', () => {
    expect([endpointKey(budget), endpointKey(env(E1)), endpointKey(acc(A1))]).toEqual(['budget', `envelope:${E1}`, `account:${A1}`])
  })
})
