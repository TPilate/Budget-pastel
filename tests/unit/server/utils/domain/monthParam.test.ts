import { describe, it, expect } from 'vitest'
import { parseMonthParam, formatMonthParam } from '../../../../../server/utils/domain/monthParam'

const NOW = new Date('2026-11-08T12:00:00Z')
const CURRENT = { year: 2026, month: 11 }

describe('parseMonthParam', () => {
  it('accepts a past month', () => {
    expect(parseMonthParam('2026-09', NOW)).toEqual({ year: 2026, month: 9 })
  })
  it('accepts the current month', () => {
    expect(parseMonthParam('2026-11', NOW)).toEqual(CURRENT)
  })
  it.each([undefined, 'abc', '2026-13', '2026-00', '2026-12', '1999-01', '2026-9', '', 42])(
    'falls back to the current month for %s',
    (raw) => {
      expect(parseMonthParam(raw, NOW)).toEqual(CURRENT)
    },
  )
  it('falls back for an array query', () => {
    expect(parseMonthParam(['2026-09', '2026-10'], NOW)).toEqual(CURRENT)
  })
  it('uses the Paris month: 23:30Z on Oct 31 is already November', () => {
    expect(parseMonthParam('2026-11', new Date('2026-10-31T23:30:00Z'))).toEqual(CURRENT)
  })
  it('formats a month back to YYYY-MM', () => {
    expect(formatMonthParam({ year: 2026, month: 9 })).toBe('2026-09')
  })
})
