import { test, expect } from '@playwright/test'

// Read-only (GET only): safe against production with
//   PERF_BASE_URL=https://budget-pastel.vercel.app npx playwright test tests/e2e/report-download.spec.ts

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL) && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => { test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user') })

test('the latest archived report downloads as a PDF with embedded fonts', async ({ request }) => {
  const closure = await request.get('/api/closure')
  expect(closure.status()).toBe(200)
  const { archives } = await closure.json() as { archives: Array<{ year: number, month: number }> }
  test.skip(!archives?.length, 'No archived report to download')
  const { year, month } = archives[0]!

  const response = await request.get(`/api/reports/${year}/${month}`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')

  const body = await response.body()
  expect(body.subarray(0, 4).toString('latin1')).toBe('%PDF')
  // pdfkit embeds each font as a subset: the name is prefixed ("ABCDEF+PlusJakartaSans-Bold")
  // and sits in uncompressed /BaseFont and /FontName entries.
  const text = body.toString('latin1')
  const names = [...text.matchAll(/\/(?:BaseFont|FontName)\s*\/([A-Z]{6}\+[A-Za-z0-9-]+)/g)].map(m => m[1]!)
  expect(names.some(name => name.includes('PlusJakartaSans'))).toBe(true)
})
