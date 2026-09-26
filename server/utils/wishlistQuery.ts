import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { listBudgetEnvelopeLedgers } from './envelopeCeilingsQuery'
import { bucketForPrice } from './domain/wishlist'
import type { WishlistSize, WishlistPriority } from './domain/wishlist'

// wishlist_items has exactly one foreign key to envelopes, so the embed is
// unambiguous and needs no disambiguation hint.
const WISHLIST_SELECT
  = 'id,label,price,product_url,priority,note,purchased_at,'
  + 'envelopes(id,name,emoji)'

// Node's fetch has no default timeout; without this a stalled request would hang
// the handler.
const REQUEST_TIMEOUT_MS = 10000

export interface WishlistItemView {
  id: string
  label: string
  price: number
  productUrl: string | null
  priority: WishlistPriority
  note: string | null
  size: WishlistSize
  envelopeName: string | null
  envelopeEmoji: string | null
  envelopeRemaining: number | null
}

interface EmbeddedEnvelope { id: string, name: string, emoji: string }

function unwrap(embed: EmbeddedEnvelope | EmbeddedEnvelope[] | null | undefined): EmbeddedEnvelope | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

export async function fetchWishlist(event: H3Event, year: number, month: number): Promise<WishlistItemView[]> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  const [itemsRes, ledgers] = await Promise.all([
    supabase.from('wishlist_items').select(WISHLIST_SELECT).is('purchased_at', null).abortSignal(signal),
    listBudgetEnvelopeLedgers(year, month),
  ])

  if (itemsRes.error) {
    // Never degrade to []: that would read as "no wishes yet" and mask an RLS or
    // schema problem.
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load wishlist',
      message: `wishlist: wishlist_items request failed: ${itemsRes.error.message}`,
    })
  }

  const remainingByEnvelopeId = new Map(ledgers.map((ledger) => [ledger.id, ledger.remaining]))

  return (itemsRes.data ?? []).map((row: any) => {
    const envelope = unwrap(row.envelopes)
    const price = Number(row.price)
    return {
      id: row.id,
      label: row.label,
      price,
      productUrl: row.product_url ?? null,
      priority: row.priority,
      note: row.note ?? null,
      size: bucketForPrice(price),
      envelopeName: envelope?.name ?? null,
      envelopeEmoji: envelope?.emoji ?? null,
      // Absent for reserve envelopes, which have a balance rather than a ceiling.
      envelopeRemaining: envelope ? remainingByEnvelopeId.get(envelope.id) ?? null : null,
    }
  })
}
