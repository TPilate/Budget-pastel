import { describe, it, expect } from 'vitest'
import { formatMois, parseMoisParam } from '../../../app/utils/dates'

describe('mois query param helpers', () => {
  it('parses a valid value', () => {
    expect(parseMoisParam('2026-09')).toEqual({ year: 2026, month: 9 })
  })
  it('rejects malformed values', () => {
    for (const bad of ['2026-13', '2026-9', 'abc', '', undefined, ['2026-09']]) expect(parseMoisParam(bad)).toBeUndefined()
  })
  it('round-trips', () => {
    expect(formatMois({ year: 2026, month: 3 })).toBe('2026-03')
    expect(parseMoisParam(formatMois({ year: 2027, month: 12 }))).toEqual({ year: 2027, month: 12 })
  })
})
