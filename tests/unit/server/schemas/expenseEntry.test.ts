import { describe, it, expect } from 'vitest'
import { expenseEntryInputSchema } from '../../../../shared/schemas/expenseEntry'

describe('expenseEntryInputSchema', () => {
  const validInput = {
    date: '2026-09-18',
    categoryId: '11111111-1111-1111-1111-111111111111',
    label: 'Monoprix',
    amount: 62.4,
    accountId: '22222222-2222-2222-2222-222222222222',
    envelopeId: null,
    financedBy: 'budget' as const,
  }

  it('accepts a valid expense', () => {
    expect(() => expenseEntryInputSchema.parse(validInput)).not.toThrow()
  })

  it('defaults financedBy to budget when omitted', () => {
    const { financedBy, ...rest } = validInput
    const result = expenseEntryInputSchema.parse(rest)
    expect(result.financedBy).toBe('budget')
  })

  it('rejects a non-positive amount', () => {
    expect(() => expenseEntryInputSchema.parse({ ...validInput, amount: 0 })).toThrow()
  })

  it('rejects a missing categoryId', () => {
    const { categoryId, ...rest } = validInput
    expect(() => expenseEntryInputSchema.parse(rest)).toThrow()
  })

  it('rejects an invalid financedBy value', () => {
    expect(() => expenseEntryInputSchema.parse({ ...validInput, financedBy: 'not_a_real_value' })).toThrow()
  })
})
