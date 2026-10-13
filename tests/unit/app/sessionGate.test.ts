import { describe, it, expect } from 'vitest'
import { needsSessionCheck, isUnauthorizedApiCall, SESSION_STATE_KEY } from '../../../app/utils/sessionGate'

describe('needsSessionCheck', () => {
  it('always checks during the server render (the first load)', () => {
    expect(needsSessionCheck({ isClient: false, verified: true, toPath: '/mouvements' })).toBe(true)
  })

  it('skips the check on client navigations once the session was verified', () => {
    expect(needsSessionCheck({ isClient: true, verified: true, toPath: '/mouvements' })).toBe(false)
  })

  it('checks again on the client when nothing was verified yet — e.g. right after logging out', () => {
    expect(needsSessionCheck({ isClient: true, verified: false, toPath: '/mouvements' })).toBe(true)
  })

  it('always checks when going to /login, to bounce a signed-in visitor', () => {
    expect(needsSessionCheck({ isClient: true, verified: true, toPath: '/login' })).toBe(true)
  })

  it('uses a stable state key', () => {
    expect(SESSION_STATE_KEY).toBe('session-verified')
  })
})

describe('isUnauthorizedApiCall', () => {
  it('flags a 401 from an app API route', () => {
    expect(isUnauthorizedApiCall('/api/pages/mouvements', 401)).toBe(true)
    expect(isUnauthorizedApiCall('http://127.0.0.1:3000/api/epargne?x=1', 401)).toBe(true)
  })

  it('ignores the session probe itself, other statuses and non-API URLs', () => {
    expect(isUnauthorizedApiCall('/api/health', 401)).toBe(false)
    expect(isUnauthorizedApiCall('/api/pages/mouvements', 500)).toBe(false)
    expect(isUnauthorizedApiCall('https://x.supabase.co/auth/v1/token', 401)).toBe(false)
    expect(isUnauthorizedApiCall('/api/epargne', undefined)).toBe(false)
  })
})
