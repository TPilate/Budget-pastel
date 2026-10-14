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
