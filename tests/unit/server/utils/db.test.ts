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
