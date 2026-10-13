import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { septemberSnapshot } from '../../fixtures/reportSnapshot'

// Covers the production path the PDF unit tests skip: the fonts come from Nitro's
// `assets:server` storage mount (server/assets/fonts), not from the filesystem.

vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1', email: null })) }))
const query = vi.hoisted(() => ({ fetchReportSnapshot: vi.fn() }))
vi.mock('../../../../server/utils/closureQuery', () => query)

const FONTS_DIR = fileURLToPath(new URL('../../../../server/assets/fonts/', import.meta.url))

const storage = vi.hoisted(() => ({
  bases: [] as string[],
  keys: [] as string[],
  missing: null as string | null,
}))
const headers = vi.hoisted(() => ({ value: null as Record<string, string> | null }))
const params = vi.hoisted(() => ({ value: {} as Record<string, string> }))

let getReport: (event: any) => Promise<any>
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (handler: any) => handler
  ;(globalThis as any).getRouterParams = () => params.value
  ;(globalThis as any).setResponseHeaders = (_event: unknown, value: Record<string, string>) => { headers.value = value }
  ;(globalThis as any).useStorage = (base: string) => {
    storage.bases.push(base)
    return {
      getItemRaw: async (key: string) => {
        storage.keys.push(key)
        if (key === storage.missing) return null
        const match = /^fonts:(PlusJakartaSans-[A-Za-z]+\.ttf)$/.exec(key)
        return match ? readFileSync(FONTS_DIR + match[1]) : null
      },
    }
  }
  getReport = (await import('../../../../server/api/reports/[year]/[month].get.ts')).default as any
})

describe('GET /api/reports/[year]/[month]', () => {
  beforeEach(() => {
    params.value = { year: '2026', month: '9' }
    headers.value = null
    storage.bases.length = 0
    storage.keys.length = 0
    storage.missing = null
    query.fetchReportSnapshot.mockReset()
    query.fetchReportSnapshot.mockResolvedValue(septemberSnapshot)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refuses month 13 with a 400, before any read', async () => {
    params.value = { year: '2026', month: '13' }
    await expect(getReport({ context: {} })).rejects.toMatchObject({ statusCode: 400 })
    expect(query.fetchReportSnapshot).not.toHaveBeenCalled()
  })

  it('answers 404 when the month has no report', async () => {
    query.fetchReportSnapshot.mockResolvedValue(null)
    await expect(getReport({ context: {} })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('renders the PDF with the fonts read from the server-assets mount', async () => {
    const body = await getReport({ context: {} })

    expect(query.fetchReportSnapshot).toHaveBeenCalledWith(expect.anything(), { year: 2026, month: 9 })
    expect(Buffer.isBuffer(body)).toBe(true)
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(headers.value).toMatchObject({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="budget-2026-09.pdf"',
    })
    expect(new Set(storage.bases)).toEqual(new Set(['assets:server']))
    expect(storage.keys.sort()).toEqual([
      'fonts:PlusJakartaSans-Bold.ttf',
      'fonts:PlusJakartaSans-ExtraBold.ttf',
      'fonts:PlusJakartaSans-SemiBold.ttf',
    ])
  }, 30000)

  it('fails with a 500 when a font is missing from the bundle', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    storage.missing = 'fonts:PlusJakartaSans-Bold.ttf'
    await expect(getReport({ context: {} })).rejects.toMatchObject({ statusCode: 500 })
    expect(headers.value).toBeNull()
  })
})
