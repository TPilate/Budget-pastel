import { pgTable, uuid, text, numeric, date, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { financedByEnum } from './enums'
import { categories, envelopes, accounts, incomeTypes } from './reference'

export const expenseEntries = pgTable('expense_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  date: date('date').notNull(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  label: text('label').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  accountId: uuid('account_id').references(() => accounts.id),
  envelopeId: uuid('envelope_id').references(() => envelopes.id),
  financedBy: financedByEnum('financed_by').notNull().default('budget'),
  monthAssigned: integer('month_assigned').notNull(),
  yearAssigned: integer('year_assigned').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  yearMonthIdx: index('expense_entries_year_month_idx').on(table.yearAssigned, table.monthAssigned),
}))

export const incomeEntries = pgTable('income_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  incomeTypeId: uuid('income_type_id').notNull().references(() => incomeTypes.id),
  label: text('label').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  dateReceived: date('date_received').notNull(),
  monthAssigned: integer('month_assigned').notNull(),
  yearAssigned: integer('year_assigned').notNull(),
  detailsText: text('details_text'),
  targetEnvelopeId: uuid('target_envelope_id').references(() => envelopes.id),
  expectedAmount: numeric('expected_amount', { precision: 10, scale: 2 }),
  expectedDate: date('expected_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  yearMonthIdx: index('income_entries_year_month_idx').on(table.yearAssigned, table.monthAssigned),
}))

export const transfers = pgTable('transfers', {
  id: uuid('id').defaultRandom().primaryKey(),
  date: date('date').notNull(),
  fromEnvelopeId: uuid('from_envelope_id').notNull().references(() => envelopes.id),
  toEnvelopeId: uuid('to_envelope_id').notNull().references(() => envelopes.id),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  monthAssigned: integer('month_assigned').notNull(),
  yearAssigned: integer('year_assigned').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  yearMonthIdx: index('transfers_year_month_idx').on(table.yearAssigned, table.monthAssigned),
}))

export const monthlyEnvelopeAllocations = pgTable('monthly_envelope_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  envelopeId: uuid('envelope_id').notNull().references(() => envelopes.id),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  baseCeiling: numeric('base_ceiling', { precision: 10, scale: 2 }).notNull(),
  carriedOverAmount: numeric('carried_over_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  overspendDeduction: numeric('overspend_deduction', { precision: 10, scale: 2 }).notNull().default('0'),
}, (table) => ({
  envelopeYearMonthUnique: uniqueIndex('monthly_envelope_allocations_envelope_year_month_idx').on(table.envelopeId, table.year, table.month),
}))
