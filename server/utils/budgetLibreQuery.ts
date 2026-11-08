import type { H3Event } from 'h3'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { fetchMonthFigures } from './monthFigures'
import { budgetLibre } from './domain/transferFlows'
import type { YearMonth } from './domain/closure'

/**
 * The month's budget libre: "Reste à dépenser" minus what sits in budget envelopes. Same
 * reads and formula as the dashboard; Data API only, so pool-backed write routes can call it.
 */
export async function fetchBudgetLibre(
  event: H3Event,
  ym: YearMonth,
  options: { excludeTransferId?: string } = {},
): Promise<number> {
  const [ledgers, figures] = await Promise.all([
    listBudgetEnvelopeLedgers(event, ym.year, ym.month, options),
    // Days remaining only feeds the per-day figure, which the cap does not use.
    fetchMonthFigures(event, ym.year, ym.month, 1, options),
  ])
  return budgetLibre(figures.summary.unspent, ledgers.map((l) => l.remaining))
}
