import { describe, it, expect } from 'vitest'
import { bucketForPrice, summariseWishlist, sortWishlist } from '../../../../../server/utils/domain/wishlist'

describe('bucketForPrice', () => {
  it('puts a 50 € item in petites, not moyennes', () => {
    // The Figma labels the columns "jusqu'à 50 €" and "50 à 200 €", so the
    // boundary belongs to the lower bucket.
    expect(bucketForPrice(50)).toBe('petite')
  })

  it('puts a 200 € item in moyennes, not grosses', () => {
    // "50 à 200 €" vs "plus de 200 €".
    expect(bucketForPrice(200)).toBe('moyenne')
  })

  it('buckets values inside each range', () => {
    expect(bucketForPrice(16)).toBe('petite')
    expect(bucketForPrice(120)).toBe('moyenne')
    expect(bucketForPrice(1100)).toBe('grosse')
  })
})

describe('summariseWishlist', () => {
  it('counts and totals only unpurchased items', () => {
    const result = summariseWishlist([
      { price: 28, priority: 'moyenne', purchasedAt: null },
      { price: 22, priority: 'basse', purchasedAt: null },
      // Already bought: must not inflate the header badge.
      { price: 999, priority: 'haute', purchasedAt: '2026-09-01T00:00:00Z' },
    ])
    expect(result.count).toBe(2)
    expect(result.total).toBe(50)
  })

  it('tallies priorities across unpurchased items only', () => {
    const result = summariseWishlist([
      { price: 10, priority: 'haute', purchasedAt: null },
      { price: 10, priority: 'haute', purchasedAt: null },
      { price: 10, priority: 'moyenne', purchasedAt: null },
      { price: 10, priority: 'basse', purchasedAt: new Date('2026-09-01') },
    ])
    expect(result.byPriority).toEqual({ haute: 2, moyenne: 1, basse: 0 })
  })

  it('returns zeroes for an empty list', () => {
    expect(summariseWishlist([])).toEqual({
      count: 0, total: 0, byPriority: { haute: 0, moyenne: 0, basse: 0 },
    })
  })
})

describe('sortWishlist', () => {
  // Canapé is the discriminating fixture: it is the most expensive item but the
  // lowest priority, so the two modes MUST produce different orders. Without an
  // item like it, both assertions pass even if `mode` is ignored entirely.
  const items = [
    { label: 'Sac de sport', price: 75, priority: 'moyenne' as const },
    { label: 'Bottines', price: 120, priority: 'haute' as const },
    { label: 'Diffuseur', price: 59, priority: 'moyenne' as const },
    { label: 'Cours de poterie', price: 180, priority: 'haute' as const },
    { label: 'Canapé', price: 850, priority: 'basse' as const },
  ]

  it('orders by priority, then price descending', () => {
    expect(sortWishlist(items, 'priority').map((i) => i.label))
      .toEqual(['Cours de poterie', 'Bottines', 'Sac de sport', 'Diffuseur', 'Canapé'])
  })

  it('orders by price descending when asked, ignoring priority', () => {
    expect(sortWishlist(items, 'price').map((i) => i.label))
      .toEqual(['Canapé', 'Cours de poterie', 'Bottines', 'Sac de sport', 'Diffuseur'])
  })

  it('breaks ties on label so order never wobbles between renders', () => {
    // wishlist_items has no created_at and no sort_order, so without an
    // explicit tiebreak two identical items could swap places on each fetch.
    const tied = [
      { label: 'Zebre', price: 40, priority: 'basse' as const },
      { label: 'Abricot', price: 40, priority: 'basse' as const },
    ]
    expect(sortWishlist(tied, 'priority').map((i) => i.label)).toEqual(['Abricot', 'Zebre'])
    expect(sortWishlist(tied, 'price').map((i) => i.label)).toEqual(['Abricot', 'Zebre'])
  })

  it('does not mutate the input array', () => {
    const original = [...items]
    sortWishlist(items, 'price')
    expect(items).toEqual(original)
  })
})
