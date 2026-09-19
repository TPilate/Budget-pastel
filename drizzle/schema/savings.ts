import { pgTable, uuid, integer, numeric, date, text, timestamp } from 'drizzle-orm/pg-core'
import { savingsGoals } from './reference'

export const savingsEntries = pgTable('savings_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  savingsGoalId: uuid('savings_goal_id').notNull().references(() => savingsGoals.id),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
})

export const livrets = pgTable('livrets', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  openingBalance: numeric('opening_balance', { precision: 10, scale: 2 }).notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
})

export const livretContributions = pgTable('livret_contributions', {
  id: uuid('id').defaultRandom().primaryKey(),
  livretId: uuid('livret_id').notNull().references(() => livrets.id),
  date: date('date').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
})

export const livretYearlyHistory = pgTable('livret_yearly_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  livretId: uuid('livret_id').notNull().references(() => livrets.id),
  year: integer('year').notNull(),
  closingBalance: numeric('closing_balance', { precision: 10, scale: 2 }).notNull(),
})
