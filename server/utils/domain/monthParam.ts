import { compareYearMonth, parisYearMonth } from './closure'
import type { YearMonth } from './closure'

const MONTH_PARAM = /^(\d{4})-(\d{2})$/
const MIN_YEAR = 2000

/**
 * Reads `?mois=YYYY-MM`. Anything absent, malformed, before 2000 or after the current
 * Paris month falls back to the current Paris month: a bad link shows today, never a 400.
 */
export function parseMonthParam(raw: unknown, now: Date): YearMonth {
  const current = parisYearMonth(now)
  if (typeof raw !== 'string') return current
  const match = MONTH_PARAM.exec(raw)
  if (!match) return current
  const parsed = { year: Number(match[1]), month: Number(match[2]) }
  if (parsed.month < 1 || parsed.month > 12 || parsed.year < MIN_YEAR) return current
  return compareYearMonth(parsed, current) > 0 ? current : parsed
}

export function formatMonthParam({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`
}
