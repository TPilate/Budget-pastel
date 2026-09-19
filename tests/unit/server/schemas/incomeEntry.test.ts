import { describe, it, expect } from 'vitest'
import { incomeEntryInputSchema } from '../../../../shared/schemas/incomeEntry'

describe('incomeEntryInputSchema', () => {
  const validInput = {
    incomeTypeId: '11111111-1111-1111-1111-111111111111',
    label: 'Coline — Airbnb',
    amount: 210,
    dateReceived: '2026-09-17',
    monthAssigned: 9,
    yearAssigned: 2026,
    detailsText: null,
    targetEnvelopeId: '22222222-2222-2222-2222-222222222222',
  }

  it('accepts a valid income', () => {
    expect(() => incomeEntryInputSchema.parse(validInput)).not.toThrow()
  })

  it('rejects a month outside 1-12', () => {
    expect(() => incomeEntryInputSchema.parse({ ...validInput, monthAssigned: 13 })).toThrow()
  })

  it('rejects a non-positive amount', () => {
    expect(() => incomeEntryInputSchema.parse({ ...validInput, amount: -5 })).toThrow()
  })
})
