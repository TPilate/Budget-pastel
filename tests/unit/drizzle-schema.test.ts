import { describe, it, expect } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import * as schema from '../../drizzle/schema'

describe('drizzle schema', () => {
  it('exports every table required by the design spec', () => {
    const expectedTables = [
      'categories', 'envelopes', 'incomeTypes', 'accounts', 'savingsGoals',
      'expenseEntries', 'incomeEntries', 'transfers', 'monthlyEnvelopeAllocations',
      'savingsEntries', 'livrets', 'livretContributions', 'livretYearlyHistory',
      'wishlistItems', 'monthClosures', 'closureEnvelopeDecisions', 'monthlyReports',
    ]

    for (const tableName of expectedTables) {
      expect(schema).toHaveProperty(tableName)
    }
  })

  it('defines the envelopes table with the expected columns', () => {
    const columns = Object.keys(getTableColumns(schema.envelopes))
    expect(columns).toEqual(expect.arrayContaining([
      'id', 'name', 'emoji', 'kind', 'defaultCeiling',
      'fiftyThirtyTwentyBucket', 'carryOverDefault', 'showOnHome',
    ]))
  })

  it('defines the expense_entries table with the expected columns', () => {
    const columns = Object.keys(getTableColumns(schema.expenseEntries))
    expect(columns).toEqual(expect.arrayContaining([
      'id', 'date', 'categoryId', 'amount', 'accountId',
      'envelopeId', 'financedBy', 'monthAssigned', 'yearAssigned',
    ]))
  })

  it('defines the income_entries table with the expected columns', () => {
    const columns = Object.keys(getTableColumns(schema.incomeEntries))
    expect(columns).toEqual(expect.arrayContaining([
      'id', 'incomeTypeId', 'amount', 'dateReceived', 'monthAssigned',
      'yearAssigned', 'detailsText', 'targetEnvelopeId', 'expectedAmount', 'expectedDate',
    ]))
  })
})

import { wishlistItems, accounts } from '../../drizzle/schema'

describe('milestone 6 schema additions', () => {
  it('links a wishlist item to the envelope that would fund it', () => {
    expect(wishlistItems.envelopeId).toBeDefined()
    expect(wishlistItems.envelopeId.notNull).toBe(false)
  })

  it('distinguishes spending accounts from savings accounts', () => {
    // 'Solde bancaire' is labelled "compte courant seul" in the design, so the
    // KPI needs a way to exclude savings vehicles.
    expect(accounts.kind).toBeDefined()
    expect(accounts.kind.notNull).toBe(true)
    expect(accounts.kind.enumValues).toEqual(['courant', 'epargne'])
  })
})

import { savingsGoals } from '../../drizzle/schema'

describe('savings goal poche columns', () => {
  it('carries a nullable target, so a poche without an objective is valid', () => {
    // The design shows "sans échéance" — a poche with no target is a real state, and the
    // page renders it with no progress bar rather than dividing by zero.
    expect(savingsGoals.targetAmount).toBeDefined()
    expect(savingsGoals.targetAmount.notNull).toBe(false)
  })

  it('carries a monthly amount that defaults rather than being null', () => {
    // It is summed for the header's "X € répartis chaque mois", so a null would poison
    // that total. Existing rows must become 0, not null.
    expect(savingsGoals.monthlyAmount).toBeDefined()
    expect(savingsGoals.monthlyAmount.notNull).toBe(true)
    expect(savingsGoals.monthlyAmount.hasDefault).toBe(true)
  })

  it('carries a nullable note for the subtitle line', () => {
    expect(savingsGoals.note).toBeDefined()
    expect(savingsGoals.note.notNull).toBe(false)
  })
})
