import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rowsByTable: Record<string, any[]> = {}
  const errors: Record<string, { message: string } | null> = {}
  const calls: Record<string, unknown[][]> = {}
  const makeClient = () => ({
    from(table: string) {
      const record = (name: string) => (...args: unknown[]) => { (calls[table] ??= []).push([name, ...args]); return builder }
      const builder: any = {
        select: record('select'), eq: record('eq'), is: record('is'), not: record('not'), order: record('order'),
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve({ data: errors[table] ? null : (rowsByTable[table] ?? []), error: errors[table] ?? null }).then(ok, err),
      }
      return builder
    },
  })
  return { rowsByTable, errors, calls, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({ createSupabaseServerClient: () => mocks.makeClient() }))
// The point of this rewrite: ledgers must no longer hold pool slots.
vi.mock('../../../../server/utils/db', () => { throw new Error('envelope ledgers must not touch the connection pool') })

import { listBudgetEnvelopeLedgers } from '../../../../server/utils/envelopeCeilingsQuery'

const event = { context: {} } as any

function resetRows() {
  for (const key of Object.keys(mocks.rowsByTable)) delete mocks.rowsByTable[key]
  for (const key of Object.keys(mocks.errors)) delete mocks.errors[key]
  for (const key of Object.keys(mocks.calls)) delete mocks.calls[key]
}

describe('listBudgetEnvelopeLedgers', () => {
  beforeEach(() => {
    resetRows()
  })

  it('case 1: single envelope, default ceiling, no allocation, one expense, no income/transfers', async () => {
    mocks.rowsByTable.envelopes = [
      { id: 'e1', name: 'Loisirs', emoji: '🎉', show_on_home: true, default_ceiling: '150.00' },
    ]
    mocks.rowsByTable.expense_entries = [
      { envelope_id: 'e1', amount: '42.50' },
    ]

    const result = await listBudgetEnvelopeLedgers(event, 2026, 9)

    expect(result).toHaveLength(1)
    // Hand-computed (computeEnvelopeLedger): no allocation row, so
    // baseCeiling = defaultCeiling = 150, carriedOverAmount = 0,
    // overspendDeduction = 0, transfersIn = transfersOut = 0.
    // ceiling = 150 + 0 - 0 + 0 - 0 = 150
    // netSpent = expensesTotal(42.5) - incomeCreditsTotal(0) = 42.5
    // remaining = 150 - 42.5 = 107.5
    // subtitle (deriveEnvelopeSubtitle): carriedOverAmount 0, netTransfer 0,
    // incomeCreditsTotal 0 -> falls through every branch -> null.
    expect(result[0]).toMatchObject({
      id: 'e1',
      ceiling: 150,
      netSpent: 42.5,
      remaining: 107.5,
      subtitle: null,
    })
  })

  it('case 2: envelope with an allocation row carrying a non-zero carriedOverAmount', async () => {
    mocks.rowsByTable.envelopes = [
      { id: 'e2', name: 'Courses', emoji: '🛒', show_on_home: true, default_ceiling: '100.00' },
    ]
    mocks.rowsByTable.monthly_envelope_allocations = [
      { envelope_id: 'e2', year: 2026, month: 9, base_ceiling: '200.00', carried_over_amount: '30.00', overspend_deduction: '0.00' },
    ]
    mocks.rowsByTable.expense_entries = [
      { envelope_id: 'e2', amount: '20.00' },
    ]

    const result = await listBudgetEnvelopeLedgers(event, 2026, 9)

    // Hand-computed: allocation present, so baseCeiling = 200 (defaultCeiling
    // 100 is ignored), carriedOverAmount = 30, overspendDeduction = 0,
    // transfersIn = transfersOut = 0.
    // ceiling = 200 + 30 - 0 + 0 - 0 = 230
    // netSpent = expensesTotal(20) - incomeCreditsTotal(0) = 20
    // remaining = 230 - 20 = 210
    // subtitle: carriedOverAmount(30) > 0 -> `dont 30 € reportés du mois dernier`
    expect(result[0]).toMatchObject({
      id: 'e2',
      ceiling: 230,
      netSpent: 20,
      remaining: 210,
      subtitle: 'dont 30 € reportés du mois dernier',
    })
  })

  it('case 3: envelope with a transfer both in and out this month, attributed via toEnvelopeId/fromEnvelopeId', async () => {
    mocks.rowsByTable.envelopes = [
      { id: 'e3', name: 'Cadeaux', emoji: '🎁', show_on_home: true, default_ceiling: '50.00' },
    ]
    mocks.rowsByTable.transfers = [
      // Transfer IN to e3 — matched by toEnvelopeId.
      { from_envelope_id: 'eX', to_envelope_id: 'e3', amount: '25.00' },
      // Transfer OUT of e3 — matched by fromEnvelopeId.
      { from_envelope_id: 'e3', to_envelope_id: 'eY', amount: '10.00' },
    ]

    const result = await listBudgetEnvelopeLedgers(event, 2026, 9)

    // Hand-computed: no allocation, so baseCeiling = defaultCeiling = 50.
    // transfersInTotal = 25 (row where toEnvelopeId === 'e3')
    // transfersOutTotal = 10 (row where fromEnvelopeId === 'e3')
    // ceiling = 50 + 0 - 0 + 25 - 10 = 65
    // netSpent = expensesTotal(0) - incomeCreditsTotal(0) = 0
    // remaining = 65 - 0 = 65
    // netTransfer = transfersInTotal(25) - transfersOutTotal(10) = 15 > 0
    //   -> `+15 € transférés`
    // (If in/out were swapped, ceiling would wrongly be 50 - 25 + 10 = 35
    // and the subtitle sign would flip — exactly the bug this guards against.)
    expect(result[0]).toMatchObject({
      id: 'e3',
      ceiling: 65,
      netSpent: 0,
      remaining: 65,
      subtitle: '+15 € transférés',
    })
  })

  it('case 4: two envelopes — expenses/income/transfers are isolated per envelope with no cross-contamination', async () => {
    mocks.rowsByTable.envelopes = [
      { id: 'e4', name: 'Alpha', emoji: '🅰️', show_on_home: true, default_ceiling: '100.00' },
      { id: 'e5', name: 'Beta', emoji: '🅱️', show_on_home: true, default_ceiling: '80.00' },
    ]
    mocks.rowsByTable.expense_entries = [
      { envelope_id: 'e4', amount: '10.00' },
      { envelope_id: 'e5', amount: '20.00' },
    ]
    mocks.rowsByTable.income_entries = [
      { target_envelope_id: 'e4', amount: '5.00' },
    ]
    mocks.rowsByTable.transfers = [
      { from_envelope_id: 'e5', to_envelope_id: 'e4', amount: '15.00' },
    ]

    const result = await listBudgetEnvelopeLedgers(event, 2026, 9)

    expect(result).toHaveLength(2)
    const e4 = result.find((envelope) => envelope.id === 'e4')
    const e5 = result.find((envelope) => envelope.id === 'e5')

    // e4 hand-computed: baseCeiling = defaultCeiling = 100 (no allocation).
    // transfersIn = 15 (toEnvelopeId = e4), transfersOut = 0 (no row has
    // fromEnvelopeId = e4).
    // ceiling = 100 + 0 - 0 + 15 - 0 = 115
    // netSpent = expensesTotal(10, only e4's expense row) - incomeCreditsTotal(5) = 5
    // remaining = 115 - 5 = 110
    // netTransfer = 15 - 0 = 15 > 0 -> `+15 € transférés`
    expect(e4).toMatchObject({
      ceiling: 115,
      netSpent: 5,
      remaining: 110,
      subtitle: '+15 € transférés',
    })

    // e5 hand-computed: baseCeiling = defaultCeiling = 80 (no allocation).
    // transfersIn = 0 (no row has toEnvelopeId = e5), transfersOut = 15
    // (fromEnvelopeId = e5).
    // ceiling = 80 + 0 - 0 + 0 - 15 = 65
    // netSpent = expensesTotal(20, only e5's expense row) - incomeCreditsTotal(0, e4's income is not e5's) = 20
    // remaining = 65 - 20 = 45
    // netTransfer = 0 - 15 = -15 < 0 -> `−15 € transférés`
    expect(e5).toMatchObject({
      ceiling: 65,
      netSpent: 20,
      remaining: 45,
      subtitle: '−15 € transférés',
    })
  })

  it('exposes the raw defaultCeiling so the edit form can show what is actually stored', async () => {
    // The ledger's `ceiling` is computed (base + carry-over - overspend + transfers), so it
    // cannot be edited directly. The edit form needs the underlying defaultCeiling, which is
    // the field the PATCH endpoint writes.
    mocks.rowsByTable.envelopes = [
      { id: 'e8', name: 'Sorties', emoji: '🥂', show_on_home: true, default_ceiling: '90.00' },
    ]

    const result = await listBudgetEnvelopeLedgers(event, 2026, 9)

    expect(result[0]).toMatchObject({ ceiling: 90, defaultCeiling: 90 })
  })

  it('reports income credited to the envelope so the dashboard can show "+X € reçus"', async () => {
    mocks.rowsByTable.envelopes = [
      { id: 'e9', name: 'Restaurants', emoji: '🍽️', show_on_home: true, default_ceiling: '130.00' },
    ]
    mocks.rowsByTable.expense_entries = [
      { envelope_id: 'e9', amount: '102.00' },
    ]
    mocks.rowsByTable.income_entries = [
      { target_envelope_id: 'e9', amount: '20.00' },
    ]

    const result = await listBudgetEnvelopeLedgers(event, 2026, 9)

    // netSpent is expenses minus credits: 102 - 20 = 82, leaving 130 - 82 = 48.
    // incomeCreditsTotal is the 20 itself, which netSpent alone cannot recover.
    expect(result[0]).toMatchObject({
      ceiling: 130,
      netSpent: 82,
      remaining: 48,
      incomeCreditsTotal: 20,
    })
  })

  it('scopes every month-bound read to the requested month and keeps only active budget envelopes', async () => {
    await listBudgetEnvelopeLedgers(event, 2026, 9)
    expect(mocks.calls.envelopes).toContainEqual(['eq', 'kind', 'budget'])
    expect(mocks.calls.envelopes).toContainEqual(['is', 'archived_at', null])
    for (const table of ['expense_entries', 'income_entries', 'transfers']) {
      expect(mocks.calls[table]).toContainEqual(['eq', 'year_assigned', 2026])
      expect(mocks.calls[table]).toContainEqual(['eq', 'month_assigned', 9])
    }
    expect(mocks.calls.monthly_envelope_allocations).toContainEqual(['eq', 'year', 2026])
    expect(mocks.calls.monthly_envelope_allocations).toContainEqual(['eq', 'month', 9])
  })

  it('throws a 500 naming the table rather than returning partial ledgers', async () => {
    mocks.errors.transfers = { message: 'boom' }
    await expect(listBudgetEnvelopeLedgers(event, 2026, 9)).rejects.toMatchObject({
      statusCode: 500, message: expect.stringContaining('transfers'),
    })
  })
})
