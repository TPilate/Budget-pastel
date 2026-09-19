import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()

vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}))

import { requireUser } from '../../../../server/utils/auth'

describe('requireUser', () => {
  beforeEach(() => {
    getUserMock.mockReset()
  })

  it('returns the authenticated user when the session is valid', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'laura@example.com' } },
      error: null,
    })

    const user = await requireUser({} as any)

    expect(user).toEqual({ id: 'user-1', email: 'laura@example.com' })
  })

  it('throws a 401 when there is no session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })

    await expect(requireUser({} as any)).rejects.toMatchObject({ statusCode: 401 })
  })
})
