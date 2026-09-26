export type WishlistSize = 'petite' | 'moyenne' | 'grosse'
export type WishlistPriority = 'haute' | 'moyenne' | 'basse'

// Thresholds come from the Figma column headers ("jusqu'à 50 €", "50 à 200 €",
// "plus de 200 €"), which supersede the parent spec's 150 € boundary.
export function bucketForPrice(price: number): WishlistSize {
  if (price <= 50) return 'petite'
  if (price <= 200) return 'moyenne'
  return 'grosse'
}

export interface WishlistSummaryInput {
  price: number
  priority: WishlistPriority
  purchasedAt: Date | string | null
}

export function summariseWishlist(items: WishlistSummaryInput[]): {
  count: number
  total: number
  byPriority: Record<WishlistPriority, number>
} {
  // The header badge and the sidebar tallies describe outstanding wishes, so a
  // purchased item must not count towards either.
  const outstanding = items.filter((item) => item.purchasedAt === null)

  const byPriority: Record<WishlistPriority, number> = { haute: 0, moyenne: 0, basse: 0 }
  for (const item of outstanding) byPriority[item.priority] += 1

  return {
    count: outstanding.length,
    total: outstanding.reduce((sum, item) => sum + item.price, 0),
    byPriority,
  }
}

const PRIORITY_RANK: Record<WishlistPriority, number> = { haute: 0, moyenne: 1, basse: 2 }

export function sortWishlist<T extends { price: number, priority: WishlistPriority, label: string }>(
  items: T[],
  mode: 'priority' | 'price',
): T[] {
  // Sorting a copy: callers render the source array and must not see it reordered
  // underneath them.
  return [...items].sort((a, b) => {
    if (mode === 'priority') {
      const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (rank !== 0) return rank
    }
    if (a.price !== b.price) return b.price - a.price
    // wishlist_items carries no created_at or sort_order, so without this the
    // order of equal items is whatever the database happened to return.
    return a.label.localeCompare(b.label, 'fr')
  })
}
