import { pgTable, uuid, text, boolean, numeric, integer, timestamp } from 'drizzle-orm/pg-core'
import { envelopeKindEnum, fiftyThirtyTwentyBucketEnum } from './enums'

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  emoji: text('emoji').notNull(),
  isFixed: boolean('is_fixed').notNull().default(false),
  defaultTarget: numeric('default_target', { precision: 10, scale: 2 }),
  fiftyThirtyTwentyBucket: fiftyThirtyTwentyBucketEnum('fifty_thirty_twenty_bucket'),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
})

export const envelopes = pgTable('envelopes', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  emoji: text('emoji').notNull(),
  kind: envelopeKindEnum('kind').notNull(),
  defaultCeiling: numeric('default_ceiling', { precision: 10, scale: 2 }),
  fiftyThirtyTwentyBucket: fiftyThirtyTwentyBucketEnum('fifty_thirty_twenty_bucket'),
  carryOverDefault: boolean('carry_over_default').notNull().default(false),
  showOnHome: boolean('show_on_home').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
})

export const incomeTypes = pgTable('income_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  emoji: text('emoji').notNull(),
  requiresDetailsText: boolean('requires_details_text').notNull().default(false),
  defaultTargetEnvelopeId: uuid('default_target_envelope_id').references(() => envelopes.id),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
})

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  emoji: text('emoji').notNull(),
  currentBalance: numeric('current_balance', { precision: 10, scale: 2 }).notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
})

export const savingsGoals = pgTable('savings_goals', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  receivesSalaryVariance: boolean('receives_salary_variance').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
})
