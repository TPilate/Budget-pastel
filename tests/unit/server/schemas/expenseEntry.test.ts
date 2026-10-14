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

  it('accepts an expense with an envelope and no category', () => {
    const { categoryId, ...rest } = validInput
    expect(() => expenseEntryInputSchema.parse({ ...rest, envelopeId: '33333333-3333-3333-3333-333333333333' })).not.toThrow()
  })

  it('accepts a null category when an envelope is set', () => {
    expect(() => expenseEntryInputSchema.parse({ ...validInput, categoryId: null, envelopeId: '33333333-3333-3333-3333-333333333333' })).not.toThrow()
  })

  it('rejects an expense with neither a category nor an envelope, in French', () => {
    const result = expenseEntryInputSchema.safeParse({ ...validInput, categoryId: null, envelopeId: null })
    expect(result.success).toBe(false)
    expect(result.error!.issues[0].message).toBe('Choisissez une catégorie ou une enveloppe.')
  })

  it('rejects an invalid financedBy value', () => {
    expect(() => expenseEntryInputSchema.parse({ ...validInput, financedBy: 'not_a_real_value' })).toThrow()
  })
})
