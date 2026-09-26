import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}))

import { requireUser } from '../../../../server/utils/auth'

// Real H3 events always carry a `context` object; requireUser caches the resolved user
// there so one request never pays for two auth round-trips.
function fakeEvent() {
  return { context: {} } as any
}

describe('requireUser', () => {
  beforeEach(() => {
    getUserMock.mockReset()
  })

  it('returns the authenticated user when the session is valid', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'laura@example.com' } },
      error: null,
    })

    const user = await requireUser(fakeEvent())

    expect(user).toEqual({ id: 'user-1', email: 'laura@example.com' })
  })

  it('throws a 401 when there is no session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })

    await expect(requireUser(fakeEvent())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws a 503 instead of hanging forever when the auth check never resolves', async () => {
    vi.useFakeTimers()
    getUserMock.mockReturnValue(new Promise(() => {})) // never resolves

    const pending = expect(requireUser(fakeEvent())).rejects.toMatchObject({ statusCode: 503 })
    await vi.advanceTimersByTimeAsync(8000)
    await pending

    vi.useRealTimers()
  })

  it('only hits the auth service once per request, even when called repeatedly', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'laura@example.com' } },
      error: null,
    })
    const event = fakeEvent()

    const first = await requireUser(event)
    const second = await requireUser(event)

    expect(first).toEqual(second)
    expect(getUserMock).toHaveBeenCalledTimes(1)
  })

  it('does not share the cached user between different requests', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'laura@example.com' } },
      error: null,
    })

    await requireUser(fakeEvent())
    await requireUser(fakeEvent())

    expect(getUserMock).toHaveBeenCalledTimes(2)
  })
})
