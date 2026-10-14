import { describe, it, expect } from 'vitest'
import { buildMovementsFeed } from '../../../../../server/utils/domain/movementsFeed'

describe('buildMovementsFeed', () => {
  it('maps a budget-financed expense with an envelope and account', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e1', date: '2026-09-13', label: 'Ramen Kodawari', amount: 28, financedBy: 'budget',
        envelopeName: 'Restaurants', envelopeEmoji: '🍽️',
        categoryName: 'Restaurants', categoryEmoji: '🍽️', categoryIsFixed: false,
        accountName: 'Compte courant',
      }],
      incomes: [],
      transfers: [],
    })
    expect(movement).toMatchObject({
      id: 'e1', type: 'expense', date: '2026-09-13', label: 'Ramen Kodawari',
      envelopeLabel: '🍽️ Restaurants', origin: 'Compte courant', amount: -28, sign: 'negative',
    })
  })

  it('labels a fixed-category expense with no envelope as "Charges fixes"', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e2', date: '2026-09-01', label: 'Loyer', amount: 620, financedBy: 'budget',
        envelopeName: null, envelopeEmoji: null,
        categoryName: 'Loyer', categoryEmoji: '🏠', categoryIsFixed: true,
        accountName: 'Compte courant',
      }],
      incomes: [],
      transfers: [],
    })
    expect(movement.envelopeLabel).toBe('Charges fixes')
  })

  it('falls back to the category name+emoji for a variable expense with no envelope', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e3', date: '2026-09-08', label: 'Courses', amount: 40, financedBy: 'budget',
        envelopeName: null, envelopeEmoji: null,
        categoryName: 'Courses', categoryEmoji: '🛒', categoryIsFixed: false,
        accountName: 'Compte courant',
      }],
      incomes: [],
      transfers: [],
    })
    expect(movement.envelopeLabel).toBe('🛒 Courses')
  })

  it('labels a gift-received expense origin as "Cadeau reçu" with no account', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e4', date: '2026-09-11', label: 'Sneakers', amount: 62, financedBy: 'gift_received',
        envelopeName: 'Anniversaire et fêtes', envelopeEmoji: '🎂',
        categoryName: 'Mode', categoryEmoji: '👗', categoryIsFixed: false,
        accountName: null,
      }],
      incomes: [],
      transfers: [],
    })
    expect(movement.origin).toBe('Cadeau reçu')
    expect(movement.amount).toBe(-62)
  })

  it('falls back to "—" for a budget expense with no account', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e5', date: '2026-09-08', label: 'Cash', amount: 10, financedBy: 'budget',
        envelopeName: null, envelopeEmoji: null,
        categoryName: 'Courses', categoryEmoji: '🛒', categoryIsFixed: false,
        accountName: null,
      }],
      incomes: [],
      transfers: [],
    })
    expect(movement.origin).toBe('—')
  })

  it('maps an income with a target envelope as a positive, green movement', () => {
    const [movement] = buildMovementsFeed({
      expenses: [],
      incomes: [{
        id: 'i1', date: '2026-09-14', label: 'Remboursement Claire', amount: 18,
        envelopeName: 'Restaurants', envelopeEmoji: '🍽️',
      }],
      transfers: [],
    })
    expect(movement).toMatchObject({
      id: 'i1', type: 'income', date: '2026-09-14', label: 'Remboursement Claire',
      envelopeLabel: '🍽️ Restaurants', origin: 'Virement', amount: 18, sign: 'positive',
    })
  })

  it('maps a transfer as one neutral movement combining both envelopes', () => {
    const [movement] = buildMovementsFeed({
      expenses: [],
      incomes: [],
      transfers: [{
        id: 't1', date: '2026-09-19', reason: 'rééquilibrage', amount: 20,
        fromEnvelopeName: 'Mode', toEnvelopeName: 'Restaurants',
      }],
    })
    expect(movement).toMatchObject({
      id: 't1', type: 'transfer', date: '2026-09-19', label: 'Transfert Mode → Restaurants',
      envelopeLabel: '⇄ deux enveloppes', origin: 'rééquilibrage', amount: 20, sign: 'neutral',
    })
  })

  it('sorts all movements by date descending, mixing types', () => {
    const movements = buildMovementsFeed({
      expenses: [{
        id: 'e1', date: '2026-09-01', label: 'Loyer', amount: 620, financedBy: 'budget',
        envelopeName: null, envelopeEmoji: null, categoryName: 'Loyer', categoryEmoji: '🏠',
        categoryIsFixed: true, accountName: 'Compte courant',
      }],
      incomes: [{
        id: 'i1', date: '2026-09-14', label: 'Remboursement Claire', amount: 18,
        envelopeName: null, envelopeEmoji: null,
      }],
      transfers: [{
        id: 't1', date: '2026-09-19', reason: 'rééquilibrage', amount: 20,
        fromEnvelopeName: 'Mode', toEnvelopeName: 'Restaurants',
      }],
    })
    expect(movements.map((m) => m.id)).toEqual(['t1', 'i1', 'e1'])
  })
})

describe('buildMovementsFeed — savings and editing', () => {
  const savingsRow = (overrides = {}) => ({
    id: 's1', date: '2026-10-05' as string | null, year: 2026, month: 10, amount: 100,
    goalName: 'Voyage', source: 'manual' as const,
    savingsGoalId: 'g1',
    ...overrides,
  })

  it('lists a savings versement as money out', () => {
    const [movement] = buildMovementsFeed({ expenses: [], incomes: [], transfers: [], savings: [savingsRow()], monthOpen: true })
    expect(movement).toMatchObject({
      id: 's1', type: 'savings', date: '2026-10-05', label: 'Épargne — Voyage',
      envelopeLabel: '🐷 Épargne', origin: 'Versement', amount: -100, sign: 'negative', editable: true,
      fields: { savingsGoalId: 'g1', date: '2026-10-05', amount: 100 },
    })
  })

  it('dates an undated (older) versement on the 1st of its month, and keeps it editable', () => {
    const [movement] = buildMovementsFeed({ expenses: [], incomes: [], transfers: [], savings: [savingsRow({ date: null, month: 9 })], monthOpen: true })
    expect(movement.date).toBe('2026-09-01')
    expect(movement.fields).toMatchObject({ date: '2026-09-01' })
    expect(movement.editable).toBe(true)
  })

  it('marks a closure versement as not editable, even in an open month', () => {
    const [movement] = buildMovementsFeed({ expenses: [], incomes: [], transfers: [], savings: [savingsRow({ source: 'closure' })], monthOpen: true })
    expect(movement).toMatchObject({ origin: 'Clôture', editable: false })
  })

  it('marks every movement of a closed month as not editable', () => {
    const feed = buildMovementsFeed({ expenses: [], incomes: [], transfers: [], savings: [savingsRow()], monthOpen: false })
    expect(feed.every((m) => !m.editable)).toBe(true)
  })

  it('labels an uncategorised envelope expense by its envelope and carries its form fields', () => {
    const [movement] = buildMovementsFeed({
      expenses: [{
        id: 'e9', date: '2026-10-12', label: 'Ramen', amount: 28, financedBy: 'budget',
        envelopeName: 'Restaurants', envelopeEmoji: '🍽️',
        categoryName: '', categoryEmoji: '', categoryIsFixed: false, accountName: null,
        categoryId: null, envelopeId: 'env', accountId: null,
      }],
      incomes: [], transfers: [], savings: [], monthOpen: true,
    })
    expect(movement.envelopeLabel).toBe('🍽️ Restaurants')
    expect(movement.fields).toEqual({ date: '2026-10-12', categoryId: null, label: 'Ramen', amount: 28, accountId: null, envelopeId: 'env', financedBy: 'budget' })
  })
})
