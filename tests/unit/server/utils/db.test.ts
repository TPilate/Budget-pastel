import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('postgres', () => ({
  default: vi.fn(() => ({})),
}))

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => ({ mockDrizzleClient: true })),
}))

describe('db client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('throws a clear error when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '')
    await expect(import('../../../../server/utils/db')).rejects.toThrow('DATABASE_URL is not set')
  })

  it('creates a drizzle client when DATABASE_URL is set', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/test')
    const { db } = await import('../../../../server/utils/db')
    expect(db).toBeDefined()
  })
})

describe('withDbTimeout', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/test')
  })

  it('resolves with the query result when the query finishes in time', async () => {
    const { withDbTimeout } = await import('../../../../server/utils/db')

    await expect(withDbTimeout(Promise.resolve(['row']))).resolves.toEqual(['row'])
  })

  it('rejects with a 503 instead of hanging forever when a query never settles', async () => {
    // This is the exact failure this helper exists for: postgres.js parks a query on an
    // unbounded, untimed queue when the pool has no free connection, so the promise never
    // settles and the request hangs until the platform kills it.
    vi.useFakeTimers()
    const { withDbTimeout } = await import('../../../../server/utils/db')

    const pending = expect(withDbTimeout(new Promise(() => {})))
      .rejects.toMatchObject({ statusCode: 503 })
    await vi.advanceTimersByTimeAsync(12000)
    await pending

    vi.useRealTimers()
  })
})
