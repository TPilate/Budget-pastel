import { formatEuro } from '../../app/utils/currency'
import type { ReportSnapshotV1 } from './domain/reportSnapshot'

export type LayoutBlock =
  | { kind: 'title', text: string, subtitle: string }
  | { kind: 'tiles', tiles: { label: string, value: string }[] }
  | { kind: 'heading', text: string }
  | { kind: 'note', text: string }
  | {
      kind: 'table'
      columns: { header: string, width: number, align: 'left' | 'right' }[]
      rows: { cells: string[], tone?: 'warn' | 'strong' }[]
    }

/** formatEuro with plain spaces: Intl's U+202F / U+00A0 may be missing from the embedded font. */
export function formatPdfEuro(value: number): string {
  return formatEuro(value).replace(/[\u202f\u00a0]/g, ' ')
}

export function formatPdfDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}

const CLOSED_AT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' })

export function formatClosedAt(iso: string): string {
  return CLOSED_AT.format(new Date(iso)).replace(/[\u202f\u00a0]/g, ' ')
}

const percent = (value: number) => `${value} %`

export function buildReportLayout(s: ReportSnapshotV1): LayoutBlock[][] {
  const page1: LayoutBlock[] = [
    { kind: 'title', text: `Compte rendu — ${s.month.label}`, subtitle: `Clôturé le ${formatClosedAt(s.closedAt)}` },
    { kind: 'tiles', tiles: [
      { label: 'Revenus', value: formatPdfEuro(s.summary.income) },
      { label: 'Dépensé', value: formatPdfEuro(s.summary.spent) },
      { label: 'Épargné', value: formatPdfEuro(s.summary.saved) },
      { label: 'Reste', value: formatPdfEuro(s.summary.remaining) },
    ] },
    { kind: 'heading', text: 'Règle 50/30/20' },
    {
      kind: 'table',
      columns: [
        { header: 'Poste', width: 0.5, align: 'left' },
        { header: 'Réel', width: 0.25, align: 'right' },
        { header: 'Cible', width: 0.25, align: 'right' },
      ],
      rows: [
        { cells: ['Besoins', percent(s.rule503020.actuals.besoins), percent(s.rule503020.targets.besoins)] },
        { cells: ['Envies', percent(s.rule503020.actuals.envies), percent(s.rule503020.targets.envies)] },
        { cells: ['Épargne', percent(s.rule503020.actuals.epargne), percent(s.rule503020.targets.epargne)] },
      ],
    },
    { kind: 'heading', text: 'Entrées' },
    s.incomes.length === 0
      ? { kind: 'note', text: 'Aucune entrée ce mois-ci.' }
      : {
          kind: 'table',
          columns: [
            { header: 'Date', width: 0.12, align: 'left' },
            { header: 'Libellé', width: 0.4, align: 'left' },
            { header: 'Type', width: 0.28, align: 'left' },
            { header: 'Montant', width: 0.2, align: 'right' },
          ],
          rows: s.incomes.map((income) => ({
            cells: [
              formatPdfDate(income.date),
              income.targetEnvelopeName ? `${income.label} → ${income.targetEnvelopeName}` : income.label,
              income.typeName,
              formatPdfEuro(income.amount),
            ],
          })),
        },
    { kind: 'heading', text: 'Enveloppes' },
    {
      kind: 'table',
      columns: [
        { header: 'Enveloppe', width: 0.26, align: 'left' },
        { header: 'Plafond', width: 0.16, align: 'right' },
        { header: 'Dépensé', width: 0.16, align: 'right' },
        { header: 'Reliquat', width: 0.16, align: 'right' },
        { header: 'Destination', width: 0.26, align: 'left' },
      ],
      rows: s.envelopes.map((envelope) => ({
        cells: [
          envelope.name,
          formatPdfEuro(envelope.ceiling),
          formatPdfEuro(envelope.netSpent),
          formatPdfEuro(envelope.leftover),
          envelope.destinationLabel ?? '—',
        ],
        ...(envelope.leftover < 0 ? { tone: 'warn' as const } : {}),
      })),
    },
  ]

  // Expenses grouped by category, in order of first appearance, each group followed by
  // its subtotal.
  const groups = new Map<string, { emoji: string, rows: ReportSnapshotV1['expenses'] }>()
  for (const expense of s.expenses) {
    const group = groups.get(expense.categoryName) ?? { emoji: expense.categoryEmoji, rows: [] }
    group.rows.push(expense)
    groups.set(expense.categoryName, group)
  }
  const expenseRows = [...groups].flatMap(([name, group]) => [
    ...group.rows.map((expense) => ({
      cells: [formatPdfDate(expense.date), expense.label, expense.envelopeName ?? '—', formatPdfEuro(expense.amount)],
    })),
    {
      cells: ['', name, '', formatPdfEuro(group.rows.reduce((total, e) => total + e.amount, 0))],
      tone: 'strong' as const,
    },
  ])

  const page2: LayoutBlock[] = [
    { kind: 'heading', text: 'Sorties' },
    s.expenses.length === 0
      ? { kind: 'note', text: 'Aucune sortie ce mois-ci.' }
      : {
          kind: 'table',
          columns: [
            { header: 'Date', width: 0.12, align: 'left' },
            { header: 'Libellé', width: 0.44, align: 'left' },
            { header: 'Enveloppe', width: 0.24, align: 'left' },
            { header: 'Montant', width: 0.2, align: 'right' },
          ],
          rows: expenseRows,
        },
    { kind: 'heading', text: 'Transferts' },
    s.transfers.length === 0
      ? { kind: 'note', text: 'Aucun transfert ce mois-ci.' }
      : {
          kind: 'table',
          columns: [
            { header: 'Date', width: 0.12, align: 'left' },
            { header: 'De → vers', width: 0.44, align: 'left' },
            { header: 'Motif', width: 0.24, align: 'left' },
            { header: 'Montant', width: 0.2, align: 'right' },
          ],
          rows: s.transfers.map((transfer) => ({
            cells: [formatPdfDate(transfer.date), `${transfer.fromName} → ${transfer.toName}`, transfer.reason ?? '—', formatPdfEuro(transfer.amount)],
          })),
        },
    { kind: 'heading', text: 'Épargne' },
    {
      kind: 'table',
      columns: [
        { header: 'Poche', width: 0.4, align: 'left' },
        { header: 'Versé', width: 0.2, align: 'right' },
        { header: 'Reliquats', width: 0.2, align: 'right' },
        { header: 'Total', width: 0.2, align: 'right' },
      ],
      rows: s.savings.map((goal) => ({
        cells: [goal.goalName, formatPdfEuro(goal.manual), formatPdfEuro(goal.fromClosure), formatPdfEuro(goal.manual + goal.fromClosure)],
      })),
    },
    { kind: 'heading', text: 'Synthèse de clôture' },
    {
      kind: 'table',
      columns: [
        { header: 'Poste', width: 0.7, align: 'left' },
        { header: 'Montant', width: 0.3, align: 'right' },
      ],
      rows: [
        { cells: ['Reporté sur le mois suivant', formatPdfEuro(s.closure.carriedOver)] },
        { cells: ["Versé à l'épargne", formatPdfEuro(s.closure.toSavings)] },
        { cells: ["Vers d'autres enveloppes", formatPdfEuro(s.closure.toOtherEnvelopes)] },
        { cells: ['Dépassements déduits', formatPdfEuro(s.closure.overspendDeducted)] },
      ],
    },
  ]

  return [page1, page2]
}
