import { describe, it, expect } from 'vitest'
import { buildReportLayout, formatPdfEuro, formatPdfDate, formatClosedAt } from '../../../../server/utils/reportLayout'
import { septemberSnapshot } from '../../fixtures/reportSnapshot'

describe('report formatting', () => {
  it('uses plain spaces so the embedded font never needs U+202F or U+00A0', () => {
    expect(formatPdfEuro(1234.5)).toBe('1 234,50 €')
    expect(formatPdfEuro(-12)).toBe('-12,00 €')
    expect(formatPdfEuro(1234.5)).not.toMatch(/[  ]/)
  })

  it('formats dates the French way, in Paris time', () => {
    expect(formatPdfDate('2026-09-28')).toBe('28/09')
    expect(formatClosedAt('2026-10-31T23:30:00.000Z')).toBe('1 novembre 2026')
  })
})

describe('buildReportLayout', () => {
  const [page1, page2] = buildReportLayout(septemberSnapshot)

  it('has exactly two logical pages', () => {
    expect(buildReportLayout(septemberSnapshot)).toHaveLength(2)
  })

  it('opens page 1 with the title, the closure date and the four tiles', () => {
    expect(page1[0]).toEqual({ kind: 'title', text: 'Compte rendu — Septembre 2026', subtitle: 'Clôturé le 13 octobre 2026' })
    expect(page1[1]).toEqual({ kind: 'tiles', tiles: [
      { label: 'Revenus', value: '2 316,00 €' },
      { label: 'Dépensé', value: '1 234,50 €' },
      { label: 'Épargné', value: '381,00 €' },
      { label: 'Reste', value: '700,50 €' },
    ] })
  })

  it('shows envelopes with their destination, and overspends in the warning tone', () => {
    const table = page1.find((b) => b.kind === 'table' && b.columns[0].header === 'Enveloppe') as any
    expect(table.rows).toEqual([
      { cells: ['🥂 Sorties', '110,00 €', '84,00 €', '26,00 €', 'Reporté'] },
      { cells: ['✈️ Voyage', '0,00 €', '12,00 €', '-12,00 €', 'Déduit le mois suivant'], tone: 'warn' },
    ])
  })

  it('groups expenses by category on page 2, with a subtotal per category', () => {
    const table = page2.find((b) => b.kind === 'table' && b.columns[0].header === 'Date') as any
    expect(table.rows).toEqual([
      { cells: ['03/09', 'Loyer', '—', '650,00 €'] },
      { cells: ['', '🏠 Loyer', '', '650,00 €'], tone: 'strong' },
      { cells: ['12/09', 'Resto Le Bouillon', 'Sorties', '64,00 €'] },
      { cells: ['', '🍽️ Restaurants', '', '64,00 €'], tone: 'strong' },
      { cells: ['14/09', 'Monoprix', '—', '520,50 €'] },
      { cells: ['', '🛒 Courses', '', '520,50 €'], tone: 'strong' },
    ])
  })

  it('ends page 2 with the closure summary', () => {
    const last = page2[page2.length - 1] as any
    expect(last.kind).toBe('table')
    expect(last.rows.map((r: any) => r.cells)).toEqual([
      ['Reporté sur le mois suivant', '26,00 €'],
      ["Versé à l'épargne", '36,00 €'],
      ["Vers d'autres enveloppes", '0,00 €'],
      ['Dépassements déduits', '12,00 €'],
    ])
  })

  it('writes a note instead of an empty table', () => {
    const [p1, p2] = buildReportLayout({ ...septemberSnapshot, incomes: [], transfers: [] })
    expect(p1).toContainEqual({ kind: 'note', text: 'Aucune entrée ce mois-ci.' })
    expect(p2).toContainEqual({ kind: 'note', text: 'Aucun transfert ce mois-ci.' })
  })
})
