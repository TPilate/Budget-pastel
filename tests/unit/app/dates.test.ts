import { describe, it, expect, afterEach, vi } from 'vitest'
import { todayLocalIso } from '../../../app/utils/dates'

describe('todayLocalIso', () => {
  afterEach(() => vi.useRealTimers())

  it('uses the local calendar day, not the UTC one', () => {
    vi.useFakeTimers()
    // 00:30 local on the 1st: in a UTC+2 zone the UTC date would be the previous day.
    vi.setSystemTime(new Date(2026, 9, 1, 0, 30))
    expect(todayLocalIso()).toBe('2026-10-01')
  })

  it('zero-pads month and day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59))
    expect(todayLocalIso()).toBe('2026-01-05')
  })
})

import { defaultEntryDate, lastDayOfMonth, shiftMonth } from '../../../app/utils/dates'

describe('month helpers', () => {
  it('defaultEntryDate is today inside the selected month', () => {
    expect(defaultEntryDate({ year: 2026, month: 11 }, '2026-11-08')).toBe('2026-11-08')
  })
  it('defaultEntryDate is the last day of a past selected month', () => {
    expect(defaultEntryDate({ year: 2026, month: 9 }, '2026-11-08')).toBe('2026-09-30')
  })
  it('lastDayOfMonth handles leap years', () => {
    expect(lastDayOfMonth({ year: 2028, month: 2 })).toBe('2028-02-29')
    expect(lastDayOfMonth({ year: 2027, month: 2 })).toBe('2027-02-28')
  })
  it('shiftMonth crosses year boundaries', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
  })
})
