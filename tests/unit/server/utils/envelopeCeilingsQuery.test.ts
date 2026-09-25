import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: any, val: any) => ({ type: 'eq', col, val })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  asc: vi.fn((col: any) => ({ type: 'asc', col })),
  isNull: vi.fn((col: any) => ({ type: 'isNull', col })),
}))

// `vi.mock` factories are hoisted above regular top-level statements, so
// these shared objects are built with `vi.hoisted` to make sure they exist
// by the time the factories below run (same reasoning as referenceCrud.test.ts).
//
// Unlike referenceCrud.test.ts, `listBudgetEnvelopeLedgers` queries FIVE
// different tables in one `Promise.all`, each needing different canned rows.
// `.from(table)` remembers which of the five table markers it was called
// with, and `.where()` (or `.where().orderBy()`, the shape used only for
// `envelopes`) resolves to that specific table's fixture rows.
const mocks = vi.hoisted(() => {
  const tables = {
    envelopes: { __table: 'envelopes' },
    monthlyEnvelopeAllocations: { __table: 'monthlyEnvelopeAllocations' },
    expenseEntries: { __table: 'expenseEntries' },
    incomeEntries: { __table: 'incomeEntries' },
    transfers: { __table: 'transfers' },
  }

  const rowsByTable: Record<string, any[]> = {
    envelopes: [],
    monthlyEnvelopeAllocations: [],
    expenseEntries: [],
    incomeEntries: [],
    transfers: [],
  }

  let currentTable = ''

  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.from = vi.fn((table: any) => {
    currentTable = table.__table
    return chain
  })
  chain.where = vi.fn(() => {
    const rows = rowsByTable[currentTable] ?? []
    const result: any = Promise.resolve(rows)
    result.orderBy = vi.fn(() => Promise.resolve(rows))
    return result
  })

  return { tables, rowsByTable, chain }
})

vi.mock('../../../../drizzle/schema', () => mocks.tables)
vi.mock('../../../../server/utils/db', () => ({ db: mocks.chain }))

import { listBudgetEnvelopeLedgers } from '../../../../server/utils/envelopeCeilingsQuery'

function resetRows() {
  mocks.rowsByTable.envelopes = []
  mocks.rowsByTable.monthlyEnvelopeAllocations = []
  mocks.rowsByTable.expenseEntries = []
  mocks.rowsByTable.incomeEntries = []
  mocks.rowsByTable.transfers = []
}

describe('listBudgetEnvelopeLedgers', () => {
  beforeEach(() => {
    resetRows()
  })

  it('case 1: single envelope, default ceiling, no allocation, one expense, no income/transfers', async () => {
    mocks.rowsByTable.envelopes = [
      { id: 'e1', name: 'Loisirs', emoji: '🎉', showOnHome: true, defaultCeiling: '150.00' },
    ]
    mocks.rowsByTable.expenseEntries = [
      { envelopeId: 'e1', amount: '42.50' },
    ]

    const result = await listBudgetEnvelopeLedgers(2026, 9)

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
      { id: 'e2', name: 'Courses', emoji: '🛒', showOnHome: true, defaultCeiling: '100.00' },
    ]
    mocks.rowsByTable.monthlyEnvelopeAllocations = [
      { envelopeId: 'e2', year: 2026, month: 9, baseCeiling: '200.00', carriedOverAmount: '30.00', overspendDeduction: '0.00' },
    ]
    mocks.rowsByTable.expenseEntries = [
      { envelopeId: 'e2', amount: '20.00' },
    ]

    const result = await listBudgetEnvelopeLedgers(2026, 9)

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
      { id: 'e3', name: 'Cadeaux', emoji: '🎁', showOnHome: true, defaultCeiling: '50.00' },
    ]
    mocks.rowsByTable.transfers = [
      // Transfer IN to e3 — matched by toEnvelopeId.
      { fromEnvelopeId: 'eX', toEnvelopeId: 'e3', amount: '25.00' },
      // Transfer OUT of e3 — matched by fromEnvelopeId.
      { fromEnvelopeId: 'e3', toEnvelopeId: 'eY', amount: '10.00' },
    ]

    const result = await listBudgetEnvelopeLedgers(2026, 9)

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
      { id: 'e4', name: 'Alpha', emoji: '🅰️', showOnHome: true, defaultCeiling: '100.00' },
      { id: 'e5', name: 'Beta', emoji: '🅱️', showOnHome: true, defaultCeiling: '80.00' },
    ]
    mocks.rowsByTable.expenseEntries = [
      { envelopeId: 'e4', amount: '10.00' },
      { envelopeId: 'e5', amount: '20.00' },
    ]
    mocks.rowsByTable.incomeEntries = [
      { targetEnvelopeId: 'e4', amount: '5.00' },
    ]
    mocks.rowsByTable.transfers = [
      { fromEnvelopeId: 'e5', toEnvelopeId: 'e4', amount: '15.00' },
    ]

    const result = await listBudgetEnvelopeLedgers(2026, 9)

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
})
