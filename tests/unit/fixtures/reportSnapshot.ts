import type { ReportSnapshotV1 } from '../../../server/utils/domain/reportSnapshot'

export const septemberSnapshot: ReportSnapshotV1 = {
  version: 1,
  month: { year: 2026, month: 9, label: 'Septembre 2026' },
  closedAt: '2026-10-13T08:00:00.000Z',
  summary: { income: 2316, spent: 1234.5, saved: 381, remaining: 700.5 },
  rule503020: { targets: { besoins: 50, envies: 30, epargne: 20 }, actuals: { besoins: 48, envies: 29, epargne: 16 } },
  incomes: [{ date: '2026-09-28', label: 'Salaire septembre', typeName: 'Salaire', typeEmoji: '💼', amount: 2316, targetEnvelopeName: null }],
  expenses: [
    { date: '2026-09-03', label: 'Loyer', categoryName: 'Loyer', categoryEmoji: '🏠', envelopeName: null, financedBy: 'budget', amount: 650 },
    { date: '2026-09-12', label: 'Resto Le Bouillon', categoryName: 'Restaurants', categoryEmoji: '🍽️', envelopeName: 'Sorties', financedBy: 'budget', amount: 64 },
    { date: '2026-09-14', label: 'Monoprix', categoryName: 'Courses', categoryEmoji: '🛒', envelopeName: null, financedBy: 'budget', amount: 520.5 },
  ],
  transfers: [{ date: '2026-09-18', fromName: 'Restaurants', toName: 'Sorties', reason: 'anniversaire', amount: 20 }],
  envelopes: [
    { name: 'Sorties', emoji: '🥂', ceiling: 110, netSpent: 84, leftover: 26, destinationLabel: 'Reporté' },
    { name: 'Voyage', emoji: '✈️', ceiling: 0, netSpent: 12, leftover: -12, destinationLabel: 'Déduit le mois suivant' },
  ],
  savings: [{ goalName: 'Long terme', manual: 345, fromClosure: 36 }],
  closure: { carriedOver: 26, toSavings: 36, toOtherEnvelopes: 0, overspendDeducted: 12 },
}
