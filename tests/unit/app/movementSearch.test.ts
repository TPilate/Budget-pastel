import { describe, it, expect } from 'vitest'
import { matchesMovementSearch } from '../../../app/utils/movementSearch'

const m = (label: string, amount: number) => ({ label, amount })

describe('matchesMovementSearch', () => {
  it.each([
    ['12', m('Courses', -12.5), true],
    ['12,5', m('Courses', -12.5), true],
    ['12.50', m('Courses', -12.5), true],
    ['12 €', m('Courses', -12.5), true],
    ['-12', m('Courses', -12.5), true],
    ['1 234,50', m('Loyer', -1234.5), true],
    ['13', m('Courses', -12.5), false],
    ['ticket', m('Ticket 12', -3), true],
    ['12', m('Ticket 12', -3), true], // label match still counts
    ['', m('X', 1), true],
  ])('query %j on %j → %s', (query, movement, expected) => {
    expect(matchesMovementSearch(movement, query)).toBe(expected)
  })

  it('matches the label case-insensitively', () => {
    expect(matchesMovementSearch(m('Courses Carrefour', -40), 'CARREFOUR')).toBe(true)
  })

  it('treats a non-numeric query as label-only, not as an amount', () => {
    expect(matchesMovementSearch(m('Courses', -12.5), '12a')).toBe(false)
  })

  it('matches a non-breaking space inside the amount', () => {
    expect(matchesMovementSearch(m('Loyer', -1234.5), '1 234,5')).toBe(true)
  })
})
