import { describe, it, expect } from 'vitest'
import { transferInputSchema } from '../../../../shared/schemas/transfer'

describe('transferInputSchema', () => {
  const validInput = {
    fromEnvelopeId: '11111111-1111-1111-1111-111111111111',
    toEnvelopeId: '22222222-2222-2222-2222-222222222222',
    amount: 20,
    reason: "Dîner d'anniversaire",
  }

  it('accepts a valid transfer', () => {
    expect(() => transferInputSchema.parse(validInput)).not.toThrow()
  })

  it('rejects a transfer from an envelope to itself', () => {
    expect(() => transferInputSchema.parse({ ...validInput, toEnvelopeId: validInput.fromEnvelopeId })).toThrow()
  })

  it('rejects a non-positive amount', () => {
    expect(() => transferInputSchema.parse({ ...validInput, amount: 0 })).toThrow()
  })

  it('rejects an empty reason', () => {
    expect(() => transferInputSchema.parse({ ...validInput, reason: '' })).toThrow()
  })
})
