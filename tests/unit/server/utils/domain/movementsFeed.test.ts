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
    expect(movement).toEqual({
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
    expect(movement).toEqual({
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
    expect(movement).toEqual({
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
