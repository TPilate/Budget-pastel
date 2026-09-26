import { describe, it, expect, beforeEach, vi } from 'vitest'

// Same stub shape as tests/unit/server/utils/movementsQuery.test.ts: the builder
// stays chainable and awaitable at each step, as PostgREST's does.
const mocks = vi.hoisted(() => {
  let response: { data: any[] | null, error: any } = { data: [], error: null }
  const calls = { select: '', is: [] as [string, unknown][], abortSignals: [] as AbortSignal[] }

  const makeClient = () => ({
    from: () => {
      const builder: any = {
        select: (columns: string) => { calls.select = columns; return builder },
        is: (column: string, value: unknown) => { calls.is.push([column, value]); return builder },
        abortSignal: (signal: AbortSignal) => { calls.abortSignals.push(signal); return builder },
        then: (ok: any, err: any) => Promise.resolve(response).then(ok, err),
      }
      return builder
    },
  })

  return {
    makeClient, calls,
    setResponse: (r: { data: any[] | null, error: any }) => { response = r },
  }
})

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => mocks.makeClient(),
}))

const ledgerMock = vi.hoisted(() => vi.fn())
vi.mock('../../../../server/utils/envelopeCeilingsQuery', () => ({
  listBudgetEnvelopeLedgers: ledgerMock,
}))

import { fetchWishlist } from '../../../../server/utils/wishlistQuery'

function fakeEvent() {
  return { context: {} } as any
}

describe('fetchWishlist', () => {
  beforeEach(() => {
    mocks.setResponse({ data: [], error: null })
    mocks.calls.select = ''
    mocks.calls.is = []
    mocks.calls.abortSignals = []
    ledgerMock.mockReset()
    ledgerMock.mockResolvedValue([])
  })

  it('returns only unpurchased items, sized, with the envelope resolved', async () => {
    mocks.setResponse({
      data: [{
        id: 'w1',
        label: 'Bottines d\'hiver',
        price: 120,
        product_url: null,
        priority: 'haute',
        note: null,
        purchased_at: null,
        envelopes: { id: 'e1', name: 'Mode', emoji: '👗' },
      }],
      error: null,
    })
    ledgerMock.mockResolvedValue([
      { id: 'e1', name: 'Mode', emoji: '👗', showOnHome: true, ceiling: 100, netSpent: 131, remaining: -31, subtitle: null },
    ])

    const [item] = await fetchWishlist(fakeEvent(), 2026, 9)

    expect(item).toMatchObject({
      id: 'w1',
      price: 120,
      size: 'moyenne',
      envelopeName: 'Mode',
      envelopeEmoji: '👗',
      envelopeRemaining: -31,
    })
    // Purchased items are excluded at the database, not in JS.
    expect(mocks.calls.is).toContainEqual(['purchased_at', null])
  })

  it('leaves envelope fields null when an item has no envelope', async () => {
    mocks.setResponse({
      data: [{
        id: 'w2', label: 'Vernis', price: 16, product_url: null,
        priority: 'basse', note: null, purchased_at: null, envelopes: null,
      }],
      error: null,
    })

    const [item] = await fetchWishlist(fakeEvent(), 2026, 9)

    expect(item).toMatchObject({
      size: 'petite', envelopeName: null, envelopeEmoji: null, envelopeRemaining: null,
    })
  })

  it('reports a linked reserve envelope by name but with no remaining amount', async () => {
    // Reserve envelopes carry a running balance, not a monthly ceiling remainder,
    // so listBudgetEnvelopeLedgers never returns them.
    mocks.setResponse({
      data: [{
        id: 'w3', label: 'Cadeau', price: 40, product_url: null,
        priority: 'moyenne', note: null, purchased_at: null,
        envelopes: { id: 'reserve-1', name: 'Anniversaire et fêtes', emoji: '🎂' },
      }],
      error: null,
    })
    ledgerMock.mockResolvedValue([])

    const [item] = await fetchWishlist(fakeEvent(), 2026, 9)

    expect(item.envelopeName).toBe('Anniversaire et fêtes')
    expect(item.envelopeRemaining).toBeNull()
  })

  it('asks PostgREST to embed the envelope rather than fetching envelopes separately', async () => {
    await fetchWishlist(fakeEvent(), 2026, 9)
    expect(mocks.calls.select).toContain('envelopes(')
  })

  it('bounds the request with an abort signal', async () => {
    await fetchWishlist(fakeEvent(), 2026, 9)
    expect(mocks.calls.abortSignals).toHaveLength(1)
    expect(mocks.calls.abortSignals[0]).toBeInstanceOf(AbortSignal)
  })

  it('throws rather than returning an empty list when the request fails', async () => {
    // An empty array would read as "no wishes yet" and hide an RLS problem.
    mocks.setResponse({ data: null, error: { message: 'permission denied for table wishlist_items' } })
    await expect(fetchWishlist(fakeEvent(), 2026, 9)).rejects.toThrow(/wishlist_items/)
  })
})
