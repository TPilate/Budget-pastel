import { describe, it, expect } from 'vitest'
import { apiErrorMessage } from '../../../app/utils/apiError'

describe('apiErrorMessage', () => {
  it('returns the server French message for a 409', () => {
    const error = { statusCode: 409, data: { statusCode: 409, message: 'x', data: { message: 'Septembre 2026 est clôturé.' } } }
    expect(apiErrorMessage(error)).toBe('Septembre 2026 est clôturé.')
  })

  it('returns the message of a 400 from a closure plan', () => {
    expect(apiErrorMessage({ statusCode: 400, data: { data: { message: 'Il reste 2 reliquats à répartir.' } } }))
      .toBe('Il reste 2 reliquats à répartir.')
  })

  it('returns the message of a 404, so a vanished movement is explained', () => {
    expect(apiErrorMessage({ statusCode: 404, data: { data: { message: "Ce mouvement n'existe plus." } } }))
      .toBe("Ce mouvement n'existe plus.")
  })

  it('returns null for anything else, so the form keeps its generic copy', () => {
    expect(apiErrorMessage({ statusCode: 500, data: { data: { message: 'internal' } } })).toBeNull()
    expect(apiErrorMessage(new Error('network'))).toBeNull()
    expect(apiErrorMessage({ statusCode: 400, data: { data: { issues: [] } } })).toBeNull()
  })
})
