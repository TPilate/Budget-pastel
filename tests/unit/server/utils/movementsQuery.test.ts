import { describe, it, expect, beforeEach, vi } from 'vitest'

// fetchMovements now reads through Supabase's Data API (PostgREST) instead of a
// Postgres connection pool. The three requests differ only by table, so one stub
// serves all of them: `.from(table)` records which table was asked for, and the
// end of the chain resolves to that table's canned PostgREST response.
//
// PostgREST returns embedded rows as nested objects (or null when the FK is
// null) and numerics as JSON numbers, so the fixtures below use that shape
// rather than Drizzle's flat, stringly-typed rows.
const mocks = vi.hoisted(() => {
  const responseByTable: Record<string, { data: any[] | null, error: any }> = {
    expense_entries: { data: [], error: null },
    income_entries: { data: [], error: null },
    transfers: { data: [], error: null },
  }

  const selectCalls: Record<string, string> = {}
  const abortSignals: AbortSignal[] = []

  function makeClient() {
    return {
      from(table: string) {
        const settle = () => Promise.resolve(responseByTable[table])
        const builder: any = {
          select(columns: string) {
            selectCalls[table] = columns
            return builder
          },
          // Every query filters on year_assigned then month_assigned, then bounds
          // itself with an abort signal; the builder stays chainable and awaitable
          // at each step, as PostgREST's does.
          eq: () => builder,
          abortSignal: (signal: AbortSignal) => {
            abortSignals.push(signal)
            return builder
          },
          then: (onFulfilled: any, onRejected: any) => settle().then(onFulfilled, onRejected),
        }
        return builder
      },
    }
  }

  return { responseByTable, selectCalls, abortSignals, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => mocks.makeClient(),
}))

import { fetchMovements } from '../../../../server/utils/movementsQuery'

function fakeEvent() {
  return { context: {} } as any
}

function reset() {
  mocks.responseByTable.expense_entries = { data: [], error: null }
  mocks.responseByTable.income_entries = { data: [], error: null }
  mocks.responseByTable.transfers = { data: [], error: null }
  mocks.abortSignals.length = 0
}

describe('fetchMovements (Supabase Data API)', () => {
  beforeEach(reset)

  it('maps an expense with an envelope, joining category and account from embedded rows', async () => {
    mocks.responseByTable.expense_entries = {
      data: [{
        id: 'x1',
        date: '2026-09-19',
        label: 'Courses',
        amount: 62.4,
        financed_by: 'budget',
        categories: { name: 'Alimentation', emoji: '🍎', is_fixed: false },
        envelopes: { name: 'Courses', emoji: '🛒' },
        accounts: { name: 'Compte courant' },
      }],
      error: null,
    }

    const [movement] = await fetchMovements(fakeEvent(), 2026, 9)

    // buildMovementsFeed prefers the envelope label when an envelope is set.
    expect(movement).toMatchObject({
      id: 'x1',
      type: 'expense',
      date: '2026-09-19',
      label: 'Courses',
      envelopeLabel: '🛒 Courses',
      // buildMovementsFeed negates expenses so the feed can sum directly.
      amount: -62.4,
      sign: 'negative',
    })
  })

  it('falls back to the category label when an expense has no envelope (embed is null)', async () => {
    mocks.responseByTable.expense_entries = {
      data: [{
        id: 'x2',
        date: '2026-09-19',
        label: 'Loyer',
        amount: 900,
        financed_by: 'budget',
        categories: { name: 'Loyer', emoji: '🏠', is_fixed: true },
        envelopes: null,
        accounts: null,
      }],
      error: null,
    }

    const [movement] = await fetchMovements(fakeEvent(), 2026, 9)

    // is_fixed true with no envelope -> 'Charges fixes'. A null embed must not throw.
    expect(movement).toMatchObject({ id: 'x2', envelopeLabel: 'Charges fixes' })
  })

  it('maps income from date_received and the aliased target-envelope embed', async () => {
    mocks.responseByTable.income_entries = {
      data: [{
        id: 'i1',
        date_received: '2026-09-05',
        label: 'Salaire',
        amount: 2000,
        envelopes: { name: 'Réserve', emoji: '🏦' },
      }],
      error: null,
    }

    const [movement] = await fetchMovements(fakeEvent(), 2026, 9)

    expect(movement).toMatchObject({
      id: 'i1',
      type: 'income',
      date: '2026-09-05',
      amount: 2000,
      sign: 'positive',
    })
  })

  it('keeps transfer direction straight across the two disambiguated envelope embeds', async () => {
    mocks.responseByTable.transfers = {
      data: [{
        id: 't1',
        date: '2026-09-10',
        reason: 'Rééquilibrage',
        amount: 50,
        from_envelope: { name: 'Loisirs' },
        to_envelope: { name: 'Courses' },
      }],
      error: null,
    }

    const [movement] = await fetchMovements(fakeEvent(), 2026, 9)

    // transfers has TWO foreign keys to envelopes, so from/to are disambiguated by
    // FK name in the select. Swapping them is the failure this test exists to catch,
    // and the direction is visible in the label buildMovementsFeed composes.
    expect(movement).toMatchObject({
      id: 't1',
      type: 'transfer',
      amount: 50,
      label: 'Transfert Loisirs → Courses',
      origin: 'Rééquilibrage',
    })
  })

  it('asks PostgREST to resolve the joins rather than fetching reference tables separately', async () => {
    await fetchMovements(fakeEvent(), 2026, 9)

    // The whole point of the migration: 3 requests with embeds, not 6 flat selects
    // joined in JS. If someone reverts to separate reference fetches, this fails.
    expect(mocks.selectCalls.expense_entries).toContain('categories(')
    expect(mocks.selectCalls.expense_entries).toContain('envelopes(')
    expect(mocks.selectCalls.expense_entries).toContain('accounts(')
    expect(mocks.selectCalls.transfers).toContain('envelopes!from_envelope_id')
    expect(mocks.selectCalls.transfers).toContain('envelopes!to_envelope_id')
  })

  it('bounds every request with an abort signal so a stalled fetch cannot hang the handler', async () => {
    await fetchMovements(fakeEvent(), 2026, 9)

    // Node's fetch has no default timeout. Without a signal on all three requests,
    // one stalled response reproduces the original infinite-load symptom.
    expect(mocks.abortSignals).toHaveLength(3)
    for (const signal of mocks.abortSignals) {
      expect(signal).toBeInstanceOf(AbortSignal)
      expect(signal.aborted).toBe(false)
    }
  })

  it('throws rather than returning a partial feed when a request fails', async () => {
    mocks.responseByTable.transfers = {
      data: null,
      error: { message: 'permission denied for table transfers' },
    }

    // A silent empty array here would look like "no transfers this month" — the
    // exact class of bug that hides an RLS misconfiguration.
    await expect(fetchMovements(fakeEvent(), 2026, 9)).rejects.toThrow(/transfers/)
  })
})
