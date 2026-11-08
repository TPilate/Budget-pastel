import type { H3Event } from 'h3'
import { fetchClosureState } from './closureQuery'
import { compareYearMonth, isMonthOpen, monthLabel, parisYearMonth } from './domain/closure'
import type { YearMonth } from './domain/closure'

export interface MonthContext {
  selected: YearMonth & { label: string }
  current: YearMonth
  firstDataMonth: YearMonth | null
  latestClosed: YearMonth | null
  closed: boolean
  // Only a month with its own closure can be reopened; the months before the latest one are just frozen.
  reopenable: boolean
}

// Data API only (fetchClosureState), so it can join any page's Promise.all.
export async function fetchMonthContext(event: H3Event, selected: YearMonth, now: Date): Promise<MonthContext> {
  const { firstDataMonth, closedMonths } = await fetchClosureState(event)
  const latestClosed = [...closedMonths].sort(compareYearMonth).at(-1) ?? null
  return {
    selected: { ...selected, label: monthLabel(selected) },
    current: parisYearMonth(now),
    firstDataMonth,
    latestClosed,
    closed: !isMonthOpen(selected, latestClosed),
    reopenable: closedMonths.some((m) => compareYearMonth(m, selected) === 0),
  }
}
