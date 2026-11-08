import { describe, it, expect } from 'vitest'
import { joinFrench, alsoReopenedPhrase } from '../../../app/utils/reopenPhrase'

describe('joinFrench', () => {
  it('joins 1, 2 and 3 items in French list form', () => {
    expect(joinFrench(['A'])).toBe('A')
    expect(joinFrench(['A', 'B'])).toBe('A et B')
    expect(joinFrench(['A', 'B', 'C'])).toBe('A, B et C')
  })
})

describe('alsoReopenedPhrase', () => {
  it('says nothing when only the target month is reopened', () => {
    expect(alsoReopenedPhrase(['Septembre 2026'])).toBeNull()
  })
  it('names only the later months, singular for one', () => {
    expect(alsoReopenedPhrase(['Septembre 2026', 'Octobre 2026'])).toBe('Octobre 2026 sera aussi rouvert.')
  })
  it('uses the plural for two or more', () => {
    expect(alsoReopenedPhrase(['Septembre 2026', 'Octobre 2026', 'Novembre 2026'])).toBe('Octobre 2026 et Novembre 2026 seront aussi rouverts.')
  })
})
