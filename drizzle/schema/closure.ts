import { pgTable, uuid, integer, timestamp, numeric, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { closureStatusEnum, closureDestinationEnum } from './enums'
import { envelopes, savingsGoals } from './reference'

export const monthClosures = pgTable('month_closures', {
  id: uuid('id').defaultRandom().primaryKey(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  status: closureStatusEnum('status').notNull().default('open'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => ({
  yearMonthUnique: uniqueIndex('month_closures_year_month_idx').on(table.year, table.month),
}))

export const closureEnvelopeDecisions = pgTable('closure_envelope_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  monthClosureId: uuid('month_closure_id').notNull().references(() => monthClosures.id),
  envelopeId: uuid('envelope_id').notNull().references(() => envelopes.id),
  leftoverAmount: numeric('leftover_amount', { precision: 10, scale: 2 }).notNull(),
  destination: closureDestinationEnum('destination').notNull(),
  destinationSavingsGoalId: uuid('destination_savings_goal_id').references(() => savingsGoals.id),
  destinationEnvelopeId: uuid('destination_envelope_id').references(() => envelopes.id),
})

export const monthlyReports = pgTable('monthly_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  monthClosureId: uuid('month_closure_id').notNull().references(() => monthClosures.id),
  pdfPath: text('pdf_path').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  emailedAt: timestamp('emailed_at', { withTimezone: true }),
})
