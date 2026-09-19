import { pgTable, uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core'
import { wishlistPriorityEnum } from './enums'

export const wishlistItems = pgTable('wishlist_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: text('label').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  productUrl: text('product_url'),
  priority: wishlistPriorityEnum('priority').notNull(),
  note: text('note'),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }),
})
