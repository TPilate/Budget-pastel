/** Today's date as YYYY-MM-DD in the user's local calendar (toISOString would give the UTC day). */
export function todayLocalIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
