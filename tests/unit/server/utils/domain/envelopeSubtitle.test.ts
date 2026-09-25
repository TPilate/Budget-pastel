import { describe, it, expect } from 'vitest'
import { deriveEnvelopeSubtitle } from '../../../../../server/utils/domain/envelopeSubtitle'

describe('deriveEnvelopeSubtitle', () => {
  it('prioritizes a carried-over amount over everything else', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 10, netTransfer: 20, incomeCreditsTotal: 5 }))
      .toBe('dont 10 € reportés du mois dernier')
  })

  it('shows a positive net transfer when there is no carry-over', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 0, netTransfer: 20, incomeCreditsTotal: 0 }))
      .toBe('+20 € transférés')
  })

  it('shows a negative net transfer with the minus sign', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 0, netTransfer: -20, incomeCreditsTotal: 0 }))
      .toBe('−20 € transférés')
  })

  it('shows income credits when there is no carry-over or transfer', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 0, netTransfer: 0, incomeCreditsTotal: 20 }))
      .toBe('+20 € reçus')
  })

  it('returns null when nothing adjusted the envelope this month', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 0, netTransfer: 0, incomeCreditsTotal: 0 })).toBeNull()
  })

  it('treats a zero net transfer as no transfer even if gross in/out both happened', () => {
    expect(deriveEnvelopeSubtitle({ carriedOverAmount: 0, netTransfer: 0, incomeCreditsTotal: 0 })).toBeNull()
  })
})
