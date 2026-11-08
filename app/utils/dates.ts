/** Today's date as YYYY-MM-DD in the user's local calendar (toISOString would give the UTC day). */
export function todayLocalIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export interface YearMonthValue { year: number, month: number }

/** Moves a month by `delta` months (negative goes back), crossing year boundaries. */
export function shiftMonth(ym: YearMonthValue, delta: number): YearMonthValue {
  const index = ym.year * 12 + (ym.month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 }
}

/** The last calendar day of a month as YYYY-MM-DD. */
export function lastDayOfMonth(ym: YearMonthValue): string {
  const day = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate()
  return `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Today when it falls in the selected month, else the month's last day (§5.3). */
export function defaultEntryDate(selected: YearMonthValue, todayIso: string): string {
  const prefix = `${selected.year}-${String(selected.month).padStart(2, '0')}-`
  return todayIso.startsWith(prefix) ? todayIso : lastDayOfMonth(selected)
}

/** "2026-09" for a month; the inverse of parseMoisParam. */
export function formatMois(ym: YearMonthValue): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`
}

/** Parses a `?mois=YYYY-MM` value; anything else is undefined (the current month). */
export function parseMoisParam(value: unknown): YearMonthValue | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value)
  return match ? { year: Number(match[1]), month: Number(match[2]) } : undefined
}
