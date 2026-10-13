# Compte rendu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/compte-rendu` — close a finished month by giving every positive envelope leftover a destination, write the next month's ceilings, freeze and lock the closed month, and archive a two-page PDF report rendered from a frozen snapshot.

**Architecture:** All closure arithmetic is pure and unit-tested (`domain/closure.ts`, `domain/reportSnapshot.ts`). A Data-API-only query module feeds it, a service module composes the three endpoints, and a hand-written Postgres function `close_month` performs every write atomically in one RPC. The PDF is drawn by `pdfkit` from a pure layout description of the stored snapshot, so the renderer stays swappable.

**Tech Stack:** Nuxt 4, Vue 3.5 `<script setup>`, Nuxt UI 3 (`UModal`), Drizzle (schema & migrations), `@supabase/ssr` (Data API + RPC), Zod, `pdfkit` 0.20, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-compte-rendu-design.md`

## Global Constraints

- **Every new closure module stays on the Supabase Data API.** `closureQuery.ts`, `closureService.ts` and `monthLock.ts` must NOT import `server/utils/db`, `listBudgetEnvelopeLedgers` or `listReserveEnvelopeBalances`. Pinned by tests that make importing `db` throw.
- Every Data API request carries `AbortSignal.timeout(10000)`; a failure is logged with the table name, then thrown as a 500. Never degrade to partial data.
- `numeric` columns arrive from PostgREST as **strings** — wrap each in `Number()`; nullable ones keep `null` as `null`.
- **Every money figure the closure domain outputs goes through `toCents`.** Floats such as `0.1 + 0.2` must never surface as a 0,0000000001 € leftover that demands a decision.
- **A closure is final, and E2E never performs one.** No Playwright test may click "Confirmer la clôture" or POST a valid closure: the suite runs against the live database.
- **Never run `drizzle-kit push`** — it silently disables RLS on all 17 tables. Generate migrations; apply them with `npm run db:migrate` **only after the human partner confirms** (it modifies the live database).
- User-facing server messages are French and travel in `message` and `data.message` via `userError()` (Task 5). **Never put French text in `statusMessage`**: h3 strips non-ASCII characters from it.
- Amount fields in Zod schemas use `z.coerce.number()`; forms normalise a French decimal comma with `.trim().replace(',', '.')`.
- Money in the app renders only through `formatEuro` / `formatEuroShort`; in the PDF only through `formatPdfEuro` (Task 8), which wraps `formatEuro`.
- Forms carry `isHydrated` (set in `onMounted`) and `isSubmitting` guards.
- Project design tokens only (`--color-*` in `app/assets/css/main.css`); no stock Tailwind colours beyond the `bg-white` idiom.
- "Finished month" is judged in **Europe/Paris**, never server-local or UTC.
- Out of scope, and no UI may hint at it: scheduled email, reopening a month, persisted drafts, livrets, mobile layout.

## Review Focus

1. **Float residue on leftovers** — an envelope whose spend sums to its ceiling through decimals (`0.1 + 0.2` against `0.30`) must show 0 € and need no decision; one at `90 − 89.7` must show exactly `0.3`. → Task 3 tests.
2. **The Paris midnight boundary** — on 31 October 2026 at 23:59 Paris (22:59 UTC), October is not closable; at 00:00 on 1 November (23:00 UTC), it is. → Task 3 tests.
3. **Default ceiling edits after a closure** — closing September writes October's allocation rows with a `base_ceiling` snapshot, so editing an envelope's default ceiling in October would silently do nothing for October. The PATCH must also update allocations of every month that is not closed. → Task 6 tests.
4. **A double submit or a second tab** — a second confirmation for the same month must get a 409 and write nothing, never a half-written closure. → Task 7 tests (RPC error mapping, including Postgres unique violation `23505`).
5. **French spaces in the PDF** — `Intl` formats `1 234,50 €` with U+202F/U+00A0, which an embedded font may lack and render as boxes; the PDF must use plain spaces. → Task 8 tests.

---

## File Structure

**Created:**
- `server/assets/fonts/PlusJakartaSans-{SemiBold,Bold,ExtraBold}.ttf` — embedded PDF fonts (SIL OFL)
- `server/utils/pdfDocument.ts` — `pdfkit` document factory + buffer collection
- `server/utils/pdfFonts.ts` — loads the fonts from Nitro server assets
- `server/utils/domain/closure.ts` — closable month, leftovers, closure plan (pure)
- `server/utils/domain/reportSnapshot.ts` — month summary + frozen snapshot (pure)
- `server/utils/userError.ts` — French user-facing errors
- `server/utils/closureQuery.ts` — Data API reads
- `server/utils/monthLock.ts` — `assertMonthOpen`
- `server/utils/closureService.ts` — composes status, page payload and the closure write
- `server/utils/reportLayout.ts` — snapshot → layout blocks (pure)
- `server/utils/reportPdf.ts` — layout blocks → PDF
- `shared/schemas/closure.ts` — Zod schemas
- `drizzle/migrations/0005_*.sql` (generated), `drizzle/migrations/0006_close_month.sql` (hand-written)
- `server/api/closure/status.get.ts`, `server/api/closure/index.get.ts`, `server/api/closure/index.post.ts`
- `server/api/reports/[year]/[month].get.ts`
- `app/utils/apiError.ts`, `app/pages/compte-rendu.vue`
- Tests mirroring each; `tests/e2e/compte-rendu.spec.ts`; later `tests/e2e/compte-rendu-closed.spec.ts`

**Modified:**
- `drizzle/schema/enums.ts`, `drizzle/schema/savings.ts`, `drizzle/schema/closure.ts`
- `server/api/savings/index.post.ts` — upsert only `manual` rows
- `server/api/expenses/index.post.ts`, `server/api/incomes/index.post.ts`, `server/api/transfers/index.post.ts` — lock
- `server/api/envelopes/[id].patch.ts` — propagate default ceiling to open months
- `app/components/entry/{Expense,Income,Transfer}Form.vue`, `app/pages/index.vue` — show the lock message; dashboard closure button
- `server/utils/domain/savings.ts`, `server/utils/epargneQuery.ts` — "Reliquats de clôture" row
- `package.json`, `docs/HANDOFF.md`

---

### Task 1: PDF toolchain spike — `pdfkit` with embedded fonts under a Nitro build

The spec's §6.3 risk comes first: if `pdfkit` cannot run once Nitro bundles it, we switch to `pdfmake` before anything depends on it.

**Files:**
- Modify: `package.json` (dependency `pdfkit`, devDependency `@types/pdfkit`)
- Create: `server/assets/fonts/PlusJakartaSans-SemiBold.ttf`, `-Bold.ttf`, `-ExtraBold.ttf`
- Create: `server/utils/pdfDocument.ts`, `server/utils/pdfFonts.ts`
- Test: `tests/unit/server/utils/pdfDocument.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface ReportFonts { semibold: Buffer, bold: Buffer, extrabold: Buffer }`; `createPdfDocument(fonts: ReportFonts, options?: { compress?: boolean, title?: string }): PDFKit.PDFDocument` (fonts registered as `'semibold'`, `'bold'`, `'extrabold'`); `pdfToBuffer(doc): Promise<Buffer>` (ends the document); `loadReportFonts(): Promise<ReportFonts>`.

- [ ] **Step 1: Install and fetch the fonts**

```bash
npm install pdfkit@^0.20.0
npm install -D @types/pdfkit
mkdir -p server/assets/fonts
for w in SemiBold Bold ExtraBold; do
  curl -sfL -o "server/assets/fonts/PlusJakartaSans-$w.ttf" \
    "https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/fonts/ttf/PlusJakartaSans-$w.ttf"
done
ls -l server/assets/fonts
```
Expected: three `.ttf` files, each tens of kilobytes or more (not 0 bytes, not an HTML error page).

- [ ] **Step 2: Write the failing test**

`tests/unit/server/utils/pdfDocument.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createPdfDocument, pdfToBuffer } from '../../../../server/utils/pdfDocument'

const fontDir = path.join(process.cwd(), 'server/assets/fonts')
const fonts = {
  semibold: readFileSync(path.join(fontDir, 'PlusJakartaSans-SemiBold.ttf')),
  bold: readFileSync(path.join(fontDir, 'PlusJakartaSans-Bold.ttf')),
  extrabold: readFileSync(path.join(fontDir, 'PlusJakartaSans-ExtraBold.ttf')),
}

function pageCount(pdf: Buffer): number {
  // Page objects are written as "/Type /Page"; the page tree is "/Type /Pages", which
  // the \b excludes. Object dictionaries are never compressed by pdfkit.
  return (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length
}

describe('createPdfDocument', () => {
  it('renders a one-page PDF with the embedded fonts', async () => {
    const doc = createPdfDocument(fonts, { title: 'Spike' })
    doc.font('extrabold').fontSize(20).text('Compte rendu — Septembre 2026')
    doc.font('semibold').fontSize(10).text('1 234,50 €')
    const pdf = await pdfToBuffer(doc)

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pageCount(pdf)).toBe(1)
    // The embedded font is declared, so no standard Helvetica was needed.
    expect(pdf.toString('latin1')).toContain('PlusJakartaSans')
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/unit/server/utils/pdfDocument.test.ts`
Expected: FAIL — cannot resolve `server/utils/pdfDocument`.

- [ ] **Step 4: Implement**

`server/utils/pdfDocument.ts`:
```ts
import PDFDocument from 'pdfkit'

export interface ReportFonts {
  semibold: Buffer
  bold: Buffer
  extrabold: Buffer
}

export function createPdfDocument(
  fonts: ReportFonts,
  options: { compress?: boolean, title?: string } = {},
): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    compress: options.compress ?? true,
    // Passing our own font as the initial one keeps pdfkit from loading its built-in
    // Helvetica AFM file from disk, which is the part that tends to break once Nitro
    // bundles the server.
    font: fonts.semibold as unknown as string,
    info: { Title: options.title ?? 'Compte rendu', Author: 'Budget' },
  } as PDFKit.PDFDocumentOptions)

  doc.registerFont('semibold', fonts.semibold)
  doc.registerFont('bold', fonts.bold)
  doc.registerFont('extrabold', fonts.extrabold)
  doc.font('semibold')
  return doc
}

export function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}
```

`server/utils/pdfFonts.ts`:
```ts
import { createError } from 'h3'
import type { ReportFonts } from './pdfDocument'

const FILES = {
  semibold: 'fonts:PlusJakartaSans-SemiBold.ttf',
  bold: 'fonts:PlusJakartaSans-Bold.ttf',
  extrabold: 'fonts:PlusJakartaSans-ExtraBold.ttf',
} as const

// server/assets/ is bundled by Nitro and exposed as the `assets:server` storage mount,
// which is the only way the font files reach the Vercel function.
export async function loadReportFonts(): Promise<ReportFonts> {
  const storage = useStorage('assets:server')
  const entries = await Promise.all(Object.entries(FILES).map(async ([key, file]) => {
    const raw = await storage.getItemRaw<Buffer | Uint8Array>(file)
    if (!raw) {
      console.error(`[pdfFonts] missing server asset ${file}`)
      throw createError({ statusCode: 500, statusMessage: 'Report fonts missing' })
    }
    return [key, Buffer.from(raw)] as const
  }))
  return Object.fromEntries(entries) as unknown as ReportFonts
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/server/utils/pdfDocument.test.ts`
Expected: PASS.

- [ ] **Step 6: Prove it survives a Nitro build (throwaway route, never committed)**

Create `server/api/pdf-smoke.get.ts` **temporarily**:
```ts
import { createPdfDocument, pdfToBuffer } from '../utils/pdfDocument'
import { loadReportFonts } from '../utils/pdfFonts'

export default defineEventHandler(async (event) => {
  const doc = createPdfDocument(await loadReportFonts())
  doc.font('extrabold').text('Smoke 1 234,50 €')
  setResponseHeader(event, 'Content-Type', 'application/pdf')
  return pdfToBuffer(doc)
})
```
Run:
```bash
npm run build
node .output/server/index.mjs &   # PORT 3000
sleep 3
curl -s -o /tmp/smoke.pdf -w "%{http_code} %{content_type}\n" http://localhost:3000/api/pdf-smoke
head -c 5 /tmp/smoke.pdf; echo
kill %1
NITRO_PRESET=vercel npm run build
ls .vercel/output/functions/__nitro.func/node_modules | grep -E "^(pdfkit|fontkit)$"
```
Expected: `200 application/pdf`, the file starts with `%PDF-`, and both `pdfkit` and `fontkit` are traced into the Vercel function.
Then **delete `server/api/pdf-smoke.get.ts`**, `.vercel/` and `.output/`.

If either build fails because of a missing `pdfkit`/`fontkit`/`linebreak` data file, first try adding them to `nitro.externals.inline` in `nuxt.config.ts`. If that does not work, STOP and report: the fallback is `pdfmake` (spec §6.3), and Tasks 1 and 8 change accordingly.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json server/assets/fonts server/utils/pdfDocument.ts server/utils/pdfFonts.ts tests/unit/server/utils/pdfDocument.test.ts
git commit -m "feat: add the pdfkit toolchain with embedded Plus Jakarta Sans"
```

---

### Task 2: Schema — report snapshot and savings entry source

**Files:**
- Modify: `drizzle/schema/enums.ts`, `drizzle/schema/savings.ts:4-10`, `drizzle/schema/closure.ts:25-31`
- Create: `drizzle/migrations/0005_<generated>.sql` (+ meta)
- Modify: `server/api/savings/index.post.ts`
- Test: `tests/unit/drizzle-schema.test.ts`, `tests/unit/server/api/savingsPost.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `savingsEntrySourceEnum` (`'manual' | 'closure'`); `savingsEntries.source`; `monthlyReports.snapshot` (jsonb, NOT NULL); `monthlyReports.pdfPath` nullable; unique index `monthly_reports_month_closure_idx`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/drizzle-schema.test.ts`:
```ts
import { savingsEntries, monthlyReports } from '../../drizzle/schema'

describe('compte rendu schema additions', () => {
  it('tags each savings entry with where it came from', () => {
    expect(savingsEntries.source).toBeDefined()
    expect(savingsEntries.source.notNull).toBe(true)
    expect(savingsEntries.source.enumValues).toEqual(['manual', 'closure'])
  })

  it('stores the report as a snapshot rather than a file', () => {
    expect(monthlyReports.snapshot).toBeDefined()
    expect(monthlyReports.snapshot.notNull).toBe(true)
    expect(monthlyReports.pdfPath.notNull).toBe(false)
  })
})
```

In `tests/unit/server/api/savingsPost.test.ts`, extend `fieldFor` with
`if (col === savingsEntries.source) return 'source'`, then append:
```ts
  it('never overwrites a closure contribution for the same goal and month', async () => {
    // A closure versement lives alongside the manual one; the manual form must not
    // treat it as "the existing figure" and replace it.
    testDb.store.rows.push({ id: 'closure-row', savingsGoalId: 'g1', year: 2026, month: 9, amount: '40', source: 'closure' })
    inputState.current = { savingsGoalId: 'g1', year: 2026, month: 9, amount: 150 }

    const row = await postSavings(fakeEvent())

    expect(row.id).not.toBe('closure-row')
    expect(testDb.store.rows.find((r) => r.id === 'closure-row')!.amount).toBe('40')
    expect(testDb.store.rows).toHaveLength(2)
  })
```
Also change the existing first test's expectation to `toMatchObject({ ..., source: 'manual' })`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/drizzle-schema.test.ts tests/unit/server/api/savingsPost.test.ts`
Expected: FAIL — `source` / `snapshot` undefined, and the closure row gets overwritten.

- [ ] **Step 3: Implement the schema**

`drizzle/schema/enums.ts` — add:
```ts
export const savingsEntrySourceEnum = pgEnum('savings_entry_source', ['manual', 'closure'])
```
`drizzle/schema/savings.ts` — import it and add to `savingsEntries`:
```ts
  // A closure versement is a separate row from the manual one, so the manual upsert in
  // POST /api/savings can never overwrite what a month closure put aside.
  source: savingsEntrySourceEnum('source').notNull().default('manual'),
```
`drizzle/schema/closure.ts` — `monthlyReports` becomes:
```ts
export const monthlyReports = pgTable('monthly_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  monthClosureId: uuid('month_closure_id').notNull().references(() => monthClosures.id),
  // No file is stored: the PDF is rendered on demand from `snapshot`. Kept nullable for
  // a future stored-file variant (e.g. the scheduled email attachment).
  pdfPath: text('pdf_path'),
  snapshot: jsonb('snapshot').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  emailedAt: timestamp('emailed_at', { withTimezone: true }),
}, (table) => ({
  monthClosureUnique: uniqueIndex('monthly_reports_month_closure_idx').on(table.monthClosureId),
}))
```
(add `jsonb` to the `drizzle-orm/pg-core` import).

`server/api/savings/index.post.ts` — the lookup gains `eq(savingsEntries.source, 'manual')` inside its `and(...)`, the insert gains `source: 'manual'`, and the comment above the lookup gains: "Only `manual` rows are matched: a closure versement for the same goal and month is a separate row this form must never overwrite."

- [ ] **Step 4: Generate the migration and inspect it**

Run: `npm run db:generate`
Expected: a new `drizzle/migrations/0005_*.sql` containing exactly these statements (order may differ):
```sql
CREATE TYPE "public"."savings_entry_source" AS ENUM('manual', 'closure');
ALTER TABLE "monthly_reports" ALTER COLUMN "pdf_path" DROP NOT NULL;
ALTER TABLE "monthly_reports" ADD COLUMN "snapshot" jsonb NOT NULL;
ALTER TABLE "savings_entries" ADD COLUMN "source" "savings_entry_source" DEFAULT 'manual' NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_reports_month_closure_idx" ON "monthly_reports" USING btree ("month_closure_id");
```
If it contains anything touching RLS or policies, or any `DROP` other than `DROP NOT NULL`, STOP and report.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/drizzle-schema.test.ts tests/unit/server/api/savingsPost.test.ts`
Expected: PASS.

- [ ] **Step 6: Apply to the live database — ask first**

The change is additive and safe for the code currently in production (old code ignores `source`, `monthly_reports` is empty). **Ask the human partner for confirmation**, then run `npm run db:migrate`. Expected: migration `0005` applied without error.

- [ ] **Step 7: Commit**

```bash
git add drizzle/schema drizzle/migrations server/api/savings/index.post.ts tests/unit/drizzle-schema.test.ts tests/unit/server/api/savingsPost.test.ts
git commit -m "feat: add the report snapshot column and a source on savings entries"
```

---

### Task 3: Closure domain logic

**Files:**
- Create: `server/utils/domain/closure.ts`
- Test: `tests/unit/server/utils/domain/closure.test.ts`

**Interfaces:**
- Consumes: `computeEnvelopeLedger` from `server/utils/domain/envelopeLedger.ts`; `Bucket5030` from `server/utils/domain/dashboard.ts`.
- Produces (all exported):
  - `interface YearMonth { year: number, month: number }`
  - `toCents(value: number): number`, `monthName(month: number): string` (lower-case, e.g. `'septembre'`), `monthLabel(ym: YearMonth): string` (`'Septembre 2026'`)
  - `compareYearMonth(a, b): number`, `nextYearMonth(ym): YearMonth`, `parisYearMonth(now: Date): YearMonth`
  - `closureWindow(input: { firstDataMonth: YearMonth | null, closedMonths: YearMonth[], now: Date }): { closable: YearMonth | null, nextOpening: YearMonth | null }`
  - `interface MonthData` (below), `interface LeftoverRow`, `computeLeftovers(data: MonthData): LeftoverRow[]`
  - `type ClosureDestination = 'carry_over' | 'savings' | 'envelope'`, `interface ClosureDecision`, `interface PlannedDecision`, `interface ClosurePlan`, `class ClosurePlanError`
  - `planClosure(input: { leftovers: LeftoverRow[], decisions: ClosureDecision[], savingsGoalIds: string[] }): ClosurePlan`
  - `defaultSavingsGoalId(goals: { id: string, receivesSalaryVariance: boolean }[]): string | null`

- [ ] **Step 1: Write the failing tests**

`tests/unit/server/utils/domain/closure.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  toCents, monthLabel, nextYearMonth, parisYearMonth, closureWindow,
  computeLeftovers, planClosure, ClosurePlanError, defaultSavingsGoalId,
} from '../../../../../server/utils/domain/closure'
import type { MonthData, LeftoverRow } from '../../../../../server/utils/domain/closure'

const SEPT = { year: 2026, month: 9 }

function monthData(over: Partial<MonthData> = {}): MonthData {
  return {
    month: SEPT,
    envelopes: [], allocations: [], expenses: [], incomes: [], transfers: [],
    savingsEntries: [], savingsGoals: [],
    ...over,
  }
}

const envelope = (id: string, defaultCeiling: number, over = {}) => ({
  id, name: id, emoji: '🥂', kind: 'budget' as const, defaultCeiling, bucket: 'envies' as const, archived: false, ...over,
})
const expense = (envelopeId: string | null, amount: number) => ({
  date: '2026-09-10', label: 'x', amount, envelopeId, financedBy: 'budget' as const,
  categoryName: 'Courses', categoryEmoji: '🛒', categoryBucket: 'besoins' as const,
})
const row = (envelopeId: string, leftover: number, over: Partial<LeftoverRow> = {}): LeftoverRow => ({
  envelopeId, name: envelopeId, emoji: '🥂', defaultCeiling: 90, ceiling: 90, netSpent: 90 - leftover,
  leftover, hasAllocation: true, ...over,
})

describe('toCents and labels', () => {
  it('rounds to the cent and never returns negative zero', () => {
    expect(toCents(0.1 + 0.2)).toBe(0.3)
    expect(Object.is(toCents(-0.000001), 0)).toBe(true)
  })

  it('labels months in French', () => {
    expect(monthLabel(SEPT)).toBe('Septembre 2026')
    expect(nextYearMonth({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 })
  })
})

describe('parisYearMonth and closureWindow', () => {
  it('judges the month in Europe/Paris, not UTC', () => {
    // After the 25 Oct 2026 DST change Paris is UTC+1.
    expect(parisYearMonth(new Date('2026-10-31T22:59:00Z'))).toEqual({ year: 2026, month: 10 })
    expect(parisYearMonth(new Date('2026-10-31T23:00:00Z'))).toEqual({ year: 2026, month: 11 })
  })

  it('does not offer October until midnight in Paris on 1 November', () => {
    const base = { firstDataMonth: { year: 2026, month: 10 }, closedMonths: [] }
    expect(closureWindow({ ...base, now: new Date('2026-10-31T22:59:00Z') }).closable).toBeNull()
    expect(closureWindow({ ...base, now: new Date('2026-10-31T23:00:00Z') }).closable).toEqual({ year: 2026, month: 10 })
  })

  it('offers the oldest unclosed month first when several are overdue', () => {
    const result = closureWindow({
      firstDataMonth: { year: 2026, month: 8 },
      closedMonths: [{ year: 2026, month: 8 }],
      now: new Date('2026-11-05T10:00:00Z'),
    })
    expect(result).toEqual({ closable: { year: 2026, month: 9 }, nextOpening: null })
  })

  it('reports when the next closure opens once everything is caught up', () => {
    const result = closureWindow({
      firstDataMonth: SEPT,
      closedMonths: [SEPT],
      now: new Date('2026-10-13T10:00:00Z'),
    })
    expect(result).toEqual({ closable: null, nextOpening: { year: 2026, month: 11 } })
  })

  it('has nothing to close when there is no data at all', () => {
    const result = closureWindow({ firstDataMonth: null, closedMonths: [], now: new Date('2026-10-13T10:00:00Z') })
    expect(result).toEqual({ closable: null, nextOpening: { year: 2026, month: 11 } })
  })
})

describe('computeLeftovers', () => {
  it('computes each budget envelope remaining, rounded to the cent', () => {
    const rows = computeLeftovers(monthData({
      envelopes: [envelope('sorties', 90)],
      expenses: [expense('sorties', 30.1), expense('sorties', 30.2), expense('sorties', 29.4)],
    }))
    expect(rows).toEqual([{
      envelopeId: 'sorties', name: 'sorties', emoji: '🥂', defaultCeiling: 90,
      ceiling: 90, netSpent: 89.7, leftover: 0.3, hasAllocation: false,
    }])
  })

  it('treats a ceiling spent exactly through decimals as zero, not a tiny negative', () => {
    const [result] = computeLeftovers(monthData({
      envelopes: [envelope('beaute', 0.3)],
      expenses: [expense('beaute', 0.1), expense('beaute', 0.2)],
    }))
    expect(Object.is(result.leftover, 0)).toBe(true)
  })

  it('applies allocations, transfers and income credits, and skips reserves and archived envelopes', () => {
    const rows = computeLeftovers(monthData({
      envelopes: [
        envelope('sorties', 90),
        envelope('resto', 110),
        envelope('fetes', 0, { kind: 'reserve' }),
        envelope('old', 50, { archived: true }),
      ],
      allocations: [{ envelopeId: 'sorties', baseCeiling: 80, carriedOverAmount: 15, overspendDeduction: 5 }],
      transfers: [{ date: '2026-09-12', fromEnvelopeId: 'resto', toEnvelopeId: 'sorties', amount: 20, reason: 'anniv' }],
      expenses: [expense('sorties', 100)],
      incomes: [{ date: '2026-09-15', label: 'Coline', amount: 12, expectedAmount: null, targetEnvelopeId: 'sorties', typeName: 'Remboursement', typeEmoji: '🔁' }],
    }))
    expect(rows.map((r) => r.envelopeId)).toEqual(['sorties', 'resto'])
    // 80 + 15 − 5 + 20 = 110 ceiling; 100 − 12 = 88 net; 22 left.
    expect(rows[0]).toMatchObject({ ceiling: 110, netSpent: 88, leftover: 22, hasAllocation: true })
    // 110 − 20 transferred out, nothing spent.
    expect(rows[1]).toMatchObject({ ceiling: 90, netSpent: 0, leftover: 90, hasAllocation: false })
  })
})

describe('planClosure', () => {
  const goals = ['long-terme', 'vacances']

  it('routes each destination and builds next month allocations', () => {
    const plan = planClosure({
      leftovers: [
        row('sorties', 26, { defaultCeiling: 90 }),
        row('resto', 40, { defaultCeiling: 110 }),
        row('mode', 10, { defaultCeiling: 60 }),
        row('voyage', -12, { defaultCeiling: 0 }),
        row('sport', 0, { defaultCeiling: 25, hasAllocation: false }),
      ],
      decisions: [
        { envelopeId: 'sorties', destination: 'carry_over' },
        { envelopeId: 'resto', destination: 'savings', savingsGoalId: 'long-terme' },
        { envelopeId: 'mode', destination: 'envelope', targetEnvelopeId: 'sorties' },
      ],
      savingsGoalIds: goals,
    })

    expect(plan.decisions).toEqual([
      { envelopeId: 'sorties', leftoverAmount: 26, destination: 'carry_over', savingsGoalId: null, targetEnvelopeId: null },
      { envelopeId: 'resto', leftoverAmount: 40, destination: 'savings', savingsGoalId: 'long-terme', targetEnvelopeId: null },
      { envelopeId: 'mode', leftoverAmount: 10, destination: 'envelope', savingsGoalId: null, targetEnvelopeId: 'sorties' },
    ])
    expect(plan.nextAllocations).toEqual([
      // Its own 26 plus the 10 sent from Mode.
      { envelopeId: 'sorties', baseCeiling: 90, carriedOverAmount: 36, overspendDeduction: 0 },
      { envelopeId: 'resto', baseCeiling: 110, carriedOverAmount: 0, overspendDeduction: 0 },
      { envelopeId: 'mode', baseCeiling: 60, carriedOverAmount: 0, overspendDeduction: 0 },
      { envelopeId: 'voyage', baseCeiling: 0, carriedOverAmount: 0, overspendDeduction: 12 },
      { envelopeId: 'sport', baseCeiling: 25, carriedOverAmount: 0, overspendDeduction: 0 },
    ])
    expect(plan.freezeAllocations).toEqual([{ envelopeId: 'sport', baseCeiling: 25 }])
    expect(plan.savingsEntries).toEqual([{ savingsGoalId: 'long-terme', amount: 40 }])
    expect(plan.totals).toEqual({ carriedOver: 26, toSavings: 40, toOtherEnvelopes: 10, overspendDeducted: 12 })
  })

  it('sums two leftovers sent to the same poche into one entry', () => {
    const plan = planClosure({
      leftovers: [row('a', 10.1), row('b', 20.2)],
      decisions: [
        { envelopeId: 'a', destination: 'savings', savingsGoalId: 'vacances' },
        { envelopeId: 'b', destination: 'savings', savingsGoalId: 'vacances' },
      ],
      savingsGoalIds: goals,
    })
    expect(plan.savingsEntries).toEqual([{ savingsGoalId: 'vacances', amount: 30.3 }])
  })

  it('keeps a carry-over and an overspend on the same envelope in one row', () => {
    // Voyage is overspent and also receives Mode's leftover.
    const plan = planClosure({
      leftovers: [row('voyage', -12, { defaultCeiling: 0 }), row('mode', 10)],
      decisions: [{ envelopeId: 'mode', destination: 'envelope', targetEnvelopeId: 'voyage' }],
      savingsGoalIds: goals,
    })
    expect(plan.nextAllocations[0]).toEqual({ envelopeId: 'voyage', baseCeiling: 0, carriedOverAmount: 10, overspendDeduction: 12 })
  })

  it.each([
    ['a missing decision', [row('a', 10)], [], /reste 1 reliquat/],
    ['a decision on an overspent envelope', [row('a', -5)], [{ envelopeId: 'a', destination: 'carry_over' }], /pas de reliquat/],
    ['a decision on a zero leftover', [row('a', 0)], [{ envelopeId: 'a', destination: 'carry_over' }], /pas de reliquat/],
    ['an unknown envelope', [row('a', 10)], [{ envelopeId: 'zz', destination: 'carry_over' }], /inconnue/],
    ['two decisions for one envelope', [row('a', 10)], [{ envelopeId: 'a', destination: 'carry_over' }, { envelopeId: 'a', destination: 'carry_over' }], /deux destinations/],
    ['savings without a poche', [row('a', 10)], [{ envelopeId: 'a', destination: 'savings' }], /poche/],
    ['savings to an unknown poche', [row('a', 10)], [{ envelopeId: 'a', destination: 'savings', savingsGoalId: 'nope' }], /poche/],
    ['an envelope sent to itself', [row('a', 10)], [{ envelopeId: 'a', destination: 'envelope', targetEnvelopeId: 'a' }], /autre enveloppe/],
    ['an envelope sent nowhere', [row('a', 10)], [{ envelopeId: 'a', destination: 'envelope' }], /autre enveloppe/],
  ] as const)('rejects %s', (_label, leftovers, decisions, message) => {
    expect(() => planClosure({ leftovers: [...leftovers], decisions: [...decisions] as any, savingsGoalIds: goals }))
      .toThrowError(message)
    expect(() => planClosure({ leftovers: [...leftovers], decisions: [...decisions] as any, savingsGoalIds: goals }))
      .toThrowError(ClosurePlanError)
  })
})

describe('defaultSavingsGoalId', () => {
  it('prefers the poche that receives the salary variance', () => {
    expect(defaultSavingsGoalId([
      { id: 'a', receivesSalaryVariance: false },
      { id: 'b', receivesSalaryVariance: true },
    ])).toBe('b')
  })

  it('falls back to the first poche, then to null', () => {
    expect(defaultSavingsGoalId([{ id: 'a', receivesSalaryVariance: false }])).toBe('a')
    expect(defaultSavingsGoalId([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/server/utils/domain/closure.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`server/utils/domain/closure.ts`:
```ts
import { computeEnvelopeLedger } from './envelopeLedger'
import type { Bucket5030 } from './dashboard'

export interface YearMonth { year: number, month: number }

const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Rounds to the cent. Normalises -0 to 0 so a fully spent envelope is never "negative". */
export function toCents(value: number): number {
  const rounded = Math.round(value * 100) / 100
  return rounded === 0 ? 0 : rounded
}

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1]
}

export function monthLabel({ year, month }: YearMonth): string {
  const name = monthName(month)
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`
}

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return (a.year - b.year) * 12 + (a.month - b.month)
}

export function nextYearMonth({ year, month }: YearMonth): YearMonth {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

const PARIS_MONTH = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric' })

/** The household lives in France; Vercel runs in UTC. A month ends at midnight Paris time. */
export function parisYearMonth(now: Date): YearMonth {
  const parts = PARIS_MONTH.formatToParts(now)
  return {
    year: Number(parts.find((part) => part.type === 'year')!.value),
    month: Number(parts.find((part) => part.type === 'month')!.value),
  }
}

const key = ({ year, month }: YearMonth) => `${year}-${month}`

export function closureWindow(input: {
  firstDataMonth: YearMonth | null
  closedMonths: YearMonth[]
  now: Date
}): { closable: YearMonth | null, nextOpening: YearMonth | null } {
  const current = parisYearMonth(input.now)
  const closed = new Set(input.closedMonths.map(key))

  // Months close strictly in order: walk forward from the first month with data, past
  // every month already closed. The first one found is the only candidate.
  let candidate = input.firstDataMonth
  if (candidate) {
    while (closed.has(key(candidate))) candidate = nextYearMonth(candidate)
  }

  if (candidate && compareYearMonth(candidate, current) < 0) {
    return { closable: candidate, nextOpening: null }
  }

  const pending = candidate && compareYearMonth(candidate, current) > 0 ? candidate : current
  return { closable: null, nextOpening: nextYearMonth(pending) }
}

export interface MonthData {
  month: YearMonth
  /** Every envelope, budget and reserve, archived or not — names are needed for the report. */
  envelopes: {
    id: string
    name: string
    emoji: string
    kind: 'budget' | 'reserve'
    defaultCeiling: number
    bucket: Bucket5030 | null
    archived: boolean
  }[]
  allocations: { envelopeId: string, baseCeiling: number, carriedOverAmount: number, overspendDeduction: number }[]
  expenses: {
    date: string
    label: string
    amount: number
    envelopeId: string | null
    financedBy: 'budget' | 'gift_given' | 'gift_received'
    categoryName: string
    categoryEmoji: string
    categoryBucket: Bucket5030 | null
  }[]
  incomes: {
    date: string
    label: string
    amount: number
    expectedAmount: number | null
    targetEnvelopeId: string | null
    typeName: string
    typeEmoji: string
  }[]
  transfers: { date: string, fromEnvelopeId: string, toEnvelopeId: string, amount: number, reason: string }[]
  /** This month only. */
  savingsEntries: { savingsGoalId: string, amount: number, source: 'manual' | 'closure' }[]
  savingsGoals: { id: string, name: string, receivesSalaryVariance: boolean }[]
}

export interface LeftoverRow {
  envelopeId: string
  name: string
  emoji: string
  defaultCeiling: number
  ceiling: number
  netSpent: number
  leftover: number
  hasAllocation: boolean
}

const sum = (rows: { amount: number }[]) => rows.reduce((total, row) => total + row.amount, 0)

export function computeLeftovers(data: MonthData): LeftoverRow[] {
  const allocationByEnvelope = new Map(data.allocations.map((allocation) => [allocation.envelopeId, allocation]))

  // Reserve envelopes never take part in a closure: their balance already carries
  // forward indefinitely.
  return data.envelopes
    .filter((envelope) => envelope.kind === 'budget' && !envelope.archived)
    .map((envelope) => {
      const allocation = allocationByEnvelope.get(envelope.id) ?? null
      const ledger = computeEnvelopeLedger({
        defaultCeiling: envelope.defaultCeiling,
        allocation: allocation
          ? {
              baseCeiling: allocation.baseCeiling,
              carriedOverAmount: allocation.carriedOverAmount,
              overspendDeduction: allocation.overspendDeduction,
            }
          : null,
        transfersIn: sum(data.transfers.filter((t) => t.toEnvelopeId === envelope.id)),
        transfersOut: sum(data.transfers.filter((t) => t.fromEnvelopeId === envelope.id)),
        expensesTotal: sum(data.expenses.filter((e) => e.envelopeId === envelope.id)),
        incomeCreditsTotal: sum(data.incomes.filter((i) => i.targetEnvelopeId === envelope.id)),
      })

      return {
        envelopeId: envelope.id,
        name: envelope.name,
        emoji: envelope.emoji,
        defaultCeiling: envelope.defaultCeiling,
        ceiling: toCents(ledger.ceiling),
        netSpent: toCents(ledger.netSpent),
        leftover: toCents(ledger.remaining),
        hasAllocation: allocation !== null,
      }
    })
}

export type ClosureDestination = 'carry_over' | 'savings' | 'envelope'

export interface ClosureDecision {
  envelopeId: string
  destination: ClosureDestination
  savingsGoalId?: string | null
  targetEnvelopeId?: string | null
}

export interface PlannedDecision {
  envelopeId: string
  leftoverAmount: number
  destination: ClosureDestination
  savingsGoalId: string | null
  targetEnvelopeId: string | null
}

export interface ClosurePlan {
  decisions: PlannedDecision[]
  /** Month M+1, one row per budget envelope. */
  nextAllocations: { envelopeId: string, baseCeiling: number, carriedOverAmount: number, overspendDeduction: number }[]
  /** Month M, for envelopes that were read live from default_ceiling. */
  freezeAllocations: { envelopeId: string, baseCeiling: number }[]
  /** Dated month M, source 'closure'. */
  savingsEntries: { savingsGoalId: string, amount: number }[]
  totals: { carriedOver: number, toSavings: number, toOtherEnvelopes: number, overspendDeducted: number }
}

export class ClosurePlanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClosurePlanError'
  }
}

export function planClosure(input: {
  leftovers: LeftoverRow[]
  decisions: ClosureDecision[]
  savingsGoalIds: string[]
}): ClosurePlan {
  const rowsById = new Map(input.leftovers.map((row) => [row.envelopeId, row]))
  const goalIds = new Set(input.savingsGoalIds)
  const seen = new Set<string>()
  const decisions: PlannedDecision[] = []

  for (const decision of input.decisions) {
    const row = rowsById.get(decision.envelopeId)
    if (!row) throw new ClosurePlanError('Enveloppe inconnue dans la répartition.')
    if (seen.has(row.envelopeId)) throw new ClosurePlanError(`« ${row.name} » a reçu deux destinations.`)
    seen.add(row.envelopeId)

    // Amounts always come from the server-side recomputation, never from the client.
    if (row.leftover <= 0) throw new ClosurePlanError(`« ${row.name} » n'a pas de reliquat à répartir.`)

    if (decision.destination === 'savings' && !(decision.savingsGoalId && goalIds.has(decision.savingsGoalId))) {
      throw new ClosurePlanError(`Choisissez une poche d'épargne pour « ${row.name} ».`)
    }
    if (decision.destination === 'envelope') {
      const target = decision.targetEnvelopeId
      if (!target || target === row.envelopeId || !rowsById.has(target)) {
        throw new ClosurePlanError(`Choisissez une autre enveloppe pour « ${row.name} ».`)
      }
    }

    decisions.push({
      envelopeId: row.envelopeId,
      leftoverAmount: row.leftover,
      destination: decision.destination,
      savingsGoalId: decision.destination === 'savings' ? decision.savingsGoalId! : null,
      targetEnvelopeId: decision.destination === 'envelope' ? decision.targetEnvelopeId! : null,
    })
  }

  const missing = input.leftovers.filter((row) => row.leftover > 0 && !seen.has(row.envelopeId))
  if (missing.length === 1) throw new ClosurePlanError(`Il reste 1 reliquat à répartir (« ${missing[0].name} »).`)
  if (missing.length > 1) throw new ClosurePlanError(`Il reste ${missing.length} reliquats à répartir.`)

  const carried = new Map<string, number>()
  const savings = new Map<string, number>()
  const totals = { carriedOver: 0, toSavings: 0, toOtherEnvelopes: 0, overspendDeducted: 0 }
  const add = (map: Map<string, number>, id: string, amount: number) => map.set(id, (map.get(id) ?? 0) + amount)

  for (const decision of decisions) {
    if (decision.destination === 'carry_over') {
      add(carried, decision.envelopeId, decision.leftoverAmount)
      totals.carriedOver += decision.leftoverAmount
    }
    else if (decision.destination === 'envelope') {
      add(carried, decision.targetEnvelopeId!, decision.leftoverAmount)
      totals.toOtherEnvelopes += decision.leftoverAmount
    }
    else {
      add(savings, decision.savingsGoalId!, decision.leftoverAmount)
      totals.toSavings += decision.leftoverAmount
    }
  }

  const nextAllocations = input.leftovers.map((row) => {
    // An overspend is never a choice: it is taken off the same envelope next month.
    const overspend = row.leftover < 0 ? -row.leftover : 0
    totals.overspendDeducted += overspend
    return {
      envelopeId: row.envelopeId,
      baseCeiling: row.defaultCeiling,
      carriedOverAmount: toCents(carried.get(row.envelopeId) ?? 0),
      overspendDeduction: toCents(overspend),
    }
  })

  return {
    decisions,
    nextAllocations,
    // Without a row, month M's ceiling is read live from default_ceiling, and editing
    // that later would rewrite the history of a closed month.
    freezeAllocations: input.leftovers
      .filter((row) => !row.hasAllocation)
      .map((row) => ({ envelopeId: row.envelopeId, baseCeiling: row.defaultCeiling })),
    savingsEntries: [...savings].map(([savingsGoalId, amount]) => ({ savingsGoalId, amount: toCents(amount) })),
    totals: {
      carriedOver: toCents(totals.carriedOver),
      toSavings: toCents(totals.toSavings),
      toOtherEnvelopes: toCents(totals.toOtherEnvelopes),
      overspendDeducted: toCents(totals.overspendDeducted),
    },
  }
}

export function defaultSavingsGoalId(goals: { id: string, receivesSalaryVariance: boolean }[]): string | null {
  return (goals.find((goal) => goal.receivesSalaryVariance) ?? goals[0])?.id ?? null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/utils/domain/closure.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/domain/closure.ts tests/unit/server/utils/domain/closure.test.ts
git commit -m "feat: add the month closure domain logic"
```

---

### Task 4: Month summary and report snapshot

**Files:**
- Create: `server/utils/domain/reportSnapshot.ts`
- Test: `tests/unit/server/utils/domain/reportSnapshot.test.ts`

**Interfaces:**
- Consumes: `MonthData`, `LeftoverRow`, `ClosurePlan`, `monthLabel`, `toCents` (Task 3); `summariseIncome`, `compute503020`, `Bucket5030` from `domain/dashboard.ts`.
- Produces:
  - `interface MonthSummary { income: number, spent: number, saved: number, remaining: number }`
  - `interface Rule503020View { targets: Record<Bucket5030, number>, actuals: Record<Bucket5030, number> }`
  - `summariseMonth(data: MonthData, closureSavings: number): { summary: MonthSummary, rule503020: Rule503020View }`
  - `interface ReportSnapshotV1` (spec §3.4, exact shape below), `buildReportSnapshot(input: { data: MonthData, leftovers: LeftoverRow[], plan: ClosurePlan, closedAt: Date }): ReportSnapshotV1`

- [ ] **Step 1: Write the failing tests**

`tests/unit/server/utils/domain/reportSnapshot.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { summariseMonth, buildReportSnapshot } from '../../../../../server/utils/domain/reportSnapshot'
import { computeLeftovers, planClosure } from '../../../../../server/utils/domain/closure'
import type { MonthData } from '../../../../../server/utils/domain/closure'

// One coherent September. Every expected figure below is worked out by hand in the
// comments, never re-derived with the code under test.
const data: MonthData = {
  month: { year: 2026, month: 9 },
  envelopes: [
    { id: 'sorties', name: 'Sorties', emoji: '🥂', kind: 'budget', defaultCeiling: 90, bucket: 'envies', archived: false },
    { id: 'voyage', name: 'Voyage', emoji: '✈️', kind: 'budget', defaultCeiling: 0, bucket: 'envies', archived: false },
    { id: 'fetes', name: 'Anniversaire et fêtes', emoji: '🎂', kind: 'reserve', defaultCeiling: 0, bucket: null, archived: false },
  ],
  allocations: [],
  expenses: [
    { date: '2026-09-03', label: 'Loyer', amount: 650, envelopeId: null, financedBy: 'budget', categoryName: 'Loyer', categoryEmoji: '🏠', categoryBucket: 'besoins' },
    { date: '2026-09-12', label: 'Bouillon', amount: 64, envelopeId: 'sorties', financedBy: 'budget', categoryName: 'Restaurants', categoryEmoji: '🍽️', categoryBucket: 'besoins' },
    { date: '2026-09-20', label: 'Train', amount: 12, envelopeId: 'voyage', financedBy: 'budget', categoryName: 'Transport', categoryEmoji: '🚗', categoryBucket: 'besoins' },
    { date: '2026-09-22', label: 'Fleurs', amount: 30, envelopeId: 'fetes', financedBy: 'gift_received', categoryName: 'Cadeaux', categoryEmoji: '🎁', categoryBucket: 'envies' },
  ],
  incomes: [
    { date: '2026-09-28', label: 'Salaire septembre', amount: 2000, expectedAmount: 2000, targetEnvelopeId: null, typeName: 'Salaire', typeEmoji: '💼' },
    { date: '2026-09-15', label: 'Coline', amount: 10, expectedAmount: null, targetEnvelopeId: 'sorties', typeName: 'Remboursement', typeEmoji: '🔁' },
  ],
  transfers: [],
  savingsEntries: [{ savingsGoalId: 'lt', amount: 200, source: 'manual' }],
  savingsGoals: [
    { id: 'lt', name: 'Long terme', receivesSalaryVariance: true },
    { id: 'vac', name: 'Vacances', receivesSalaryVariance: false },
  ],
}

describe('summariseMonth', () => {
  it('excludes reimbursements from income and gift-funded spend from spending', () => {
    const { summary, rule503020 } = summariseMonth(data, 0)
    // Income: 2000 (the 10 € reimbursement credits Sorties instead).
    // Spent: 650 + 64 + 12 = 726 (the 30 € gift-received spend is not budget money).
    // Saved: 200 manual. Remaining: 2000 − 726 − 200 = 1074.
    expect(summary).toEqual({ income: 2000, spent: 726, saved: 200, remaining: 1074 })
    // Besoins: 650 (Loyer, no envelope) = 33 %. Envies: 64 + 12 (envelope buckets win) = 4 %.
    // Épargne: 200 = 10 %.
    expect(rule503020.actuals).toEqual({ besoins: 33, envies: 4, epargne: 10 })
    expect(rule503020.targets).toEqual({ besoins: 50, envies: 30, epargne: 20 })
  })

  it('counts closure savings on top of manual savings', () => {
    expect(summariseMonth(data, 36).summary).toEqual({ income: 2000, spent: 726, saved: 236, remaining: 1038 })
  })
})

describe('buildReportSnapshot', () => {
  it('freezes names, amounts and destinations', () => {
    const leftovers = computeLeftovers(data)
    // Sorties: 90 − (64 − 10) = 36 left. Voyage: 0 − 12 = −12.
    const plan = planClosure({
      leftovers,
      decisions: [{ envelopeId: 'sorties', destination: 'savings', savingsGoalId: 'vac' }],
      savingsGoalIds: ['lt', 'vac'],
    })
    const snapshot = buildReportSnapshot({ data, leftovers, plan, closedAt: new Date('2026-10-13T08:00:00Z') })

    expect(snapshot.version).toBe(1)
    expect(snapshot.month).toEqual({ year: 2026, month: 9, label: 'Septembre 2026' })
    expect(snapshot.closedAt).toBe('2026-10-13T08:00:00.000Z')
    expect(snapshot.summary).toEqual({ income: 2000, spent: 726, saved: 236, remaining: 1038 })
    expect(snapshot.envelopes).toEqual([
      { name: 'Sorties', emoji: '🥂', ceiling: 90, netSpent: 54, leftover: 36, destinationLabel: 'Épargne · Vacances' },
      { name: 'Voyage', emoji: '✈️', ceiling: 0, netSpent: 12, leftover: -12, destinationLabel: 'Déduit le mois suivant' },
    ])
    expect(snapshot.incomes[1]).toEqual({
      date: '2026-09-15', label: 'Coline', typeName: 'Remboursement', typeEmoji: '🔁', amount: 10, targetEnvelopeName: 'Sorties',
    })
    expect(snapshot.expenses[3]).toMatchObject({ envelopeName: 'Anniversaire et fêtes', financedBy: 'gift_received' })
    expect(snapshot.savings).toEqual([
      { goalName: 'Long terme', manual: 200, fromClosure: 0 },
      { goalName: 'Vacances', manual: 0, fromClosure: 36 },
    ])
    expect(snapshot.closure).toEqual({ carriedOver: 0, toSavings: 36, toOtherEnvelopes: 0, overspendDeducted: 12 })
  })

  it('labels carry-overs and transfers to another envelope', () => {
    const leftovers = [
      { envelopeId: 'sorties', name: 'Sorties', emoji: '🥂', defaultCeiling: 90, ceiling: 90, netSpent: 60, leftover: 30, hasAllocation: true },
      { envelopeId: 'voyage', name: 'Voyage', emoji: '✈️', defaultCeiling: 50, ceiling: 50, netSpent: 40, leftover: 10, hasAllocation: true },
      { envelopeId: 'sport', name: 'Sport', emoji: '🏃', defaultCeiling: 25, ceiling: 25, netSpent: 25, leftover: 0, hasAllocation: true },
    ]
    const plan = planClosure({
      leftovers,
      decisions: [
        { envelopeId: 'sorties', destination: 'carry_over' },
        { envelopeId: 'voyage', destination: 'envelope', targetEnvelopeId: 'sorties' },
      ],
      savingsGoalIds: [],
    })
    const snapshot = buildReportSnapshot({ data, leftovers, plan, closedAt: new Date('2026-10-13T08:00:00Z') })
    expect(snapshot.envelopes.map((e) => e.destinationLabel)).toEqual(['Reporté', 'Vers Sorties', null])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/server/utils/domain/reportSnapshot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`server/utils/domain/reportSnapshot.ts`:
```ts
import { summariseIncome, compute503020 } from './dashboard'
import type { Bucket5030 } from './dashboard'
import { monthLabel, toCents } from './closure'
import type { MonthData, LeftoverRow, ClosurePlan, PlannedDecision } from './closure'

export interface MonthSummary { income: number, spent: number, saved: number, remaining: number }
export interface Rule503020View {
  targets: Record<Bucket5030, number>
  actuals: Record<Bucket5030, number>
}

export interface ReportSnapshotV1 {
  version: 1
  month: { year: number, month: number, label: string }
  closedAt: string
  summary: MonthSummary
  rule503020: Rule503020View
  incomes: { date: string, label: string, typeName: string, typeEmoji: string, amount: number, targetEnvelopeName: string | null }[]
  expenses: { date: string, label: string, categoryName: string, categoryEmoji: string, envelopeName: string | null, financedBy: string, amount: number }[]
  transfers: { date: string, fromName: string, toName: string, reason: string | null, amount: number }[]
  envelopes: { name: string, emoji: string, ceiling: number, netSpent: number, leftover: number, destinationLabel: string | null }[]
  savings: { goalName: string, manual: number, fromClosure: number }[]
  closure: ClosurePlan['totals']
}

const sum = (rows: { amount: number }[]) => rows.reduce((total, row) => total + row.amount, 0)

/**
 * The month's headline figures, with the same rules as the dashboard and Épargne:
 * envelope-targeted income is a reimbursement, gift-received spend is not budget money,
 * and an envelope's bucket outranks its category's.
 */
export function summariseMonth(data: MonthData, closureSavings: number): { summary: MonthSummary, rule503020: Rule503020View } {
  const income = summariseIncome(data.incomes.map((income) => ({
    amount: income.amount,
    expectedAmount: income.expectedAmount,
    targetEnvelopeId: income.targetEnvelopeId,
  }))).received

  const budgetSpend = data.expenses.filter((expense) => expense.financedBy !== 'gift_received')
  const spent = sum(budgetSpend)
  const saved = sum(data.savingsEntries.filter((entry) => entry.source === 'manual')) + closureSavings

  const bucketByEnvelope = new Map(data.envelopes.map((envelope) => [envelope.id, envelope.bucket]))
  const rule = compute503020({
    incomeReceived: income,
    taggedSpend: budgetSpend.map((expense) => ({
      amount: expense.amount,
      bucket: (expense.envelopeId !== null ? bucketByEnvelope.get(expense.envelopeId) : expense.categoryBucket) ?? null,
    })),
    savings: saved,
  })

  return {
    summary: {
      income: toCents(income),
      spent: toCents(spent),
      saved: toCents(saved),
      remaining: toCents(income - spent - saved),
    },
    rule503020: { targets: rule.targets, actuals: rule.actuals },
  }
}

export function buildReportSnapshot(input: {
  data: MonthData
  leftovers: LeftoverRow[]
  plan: ClosurePlan
  closedAt: Date
}): ReportSnapshotV1 {
  const { data, leftovers, plan } = input
  const envelopeName = (id: string | null) => (id ? data.envelopes.find((e) => e.id === id)?.name ?? null : null)
  const goalName = (id: string | null) => data.savingsGoals.find((g) => g.id === id)?.name ?? ''
  const decisionByEnvelope = new Map(plan.decisions.map((decision) => [decision.envelopeId, decision]))

  function destinationLabel(row: LeftoverRow, decision: PlannedDecision | undefined): string | null {
    if (row.leftover < 0) return 'Déduit le mois suivant'
    if (!decision) return null
    if (decision.destination === 'carry_over') return 'Reporté'
    if (decision.destination === 'savings') return `Épargne · ${goalName(decision.savingsGoalId)}`
    return `Vers ${envelopeName(decision.targetEnvelopeId)}`
  }

  const { summary, rule503020 } = summariseMonth(data, plan.totals.toSavings)

  return {
    version: 1,
    month: { ...data.month, label: monthLabel(data.month) },
    closedAt: input.closedAt.toISOString(),
    summary,
    rule503020,
    incomes: data.incomes.map((income) => ({
      date: income.date,
      label: income.label,
      typeName: income.typeName,
      typeEmoji: income.typeEmoji,
      amount: income.amount,
      targetEnvelopeName: envelopeName(income.targetEnvelopeId),
    })),
    expenses: data.expenses.map((expense) => ({
      date: expense.date,
      label: expense.label,
      categoryName: expense.categoryName,
      categoryEmoji: expense.categoryEmoji,
      envelopeName: envelopeName(expense.envelopeId),
      financedBy: expense.financedBy,
      amount: expense.amount,
    })),
    transfers: data.transfers.map((transfer) => ({
      date: transfer.date,
      fromName: envelopeName(transfer.fromEnvelopeId) ?? '—',
      toName: envelopeName(transfer.toEnvelopeId) ?? '—',
      reason: transfer.reason || null,
      amount: transfer.amount,
    })),
    envelopes: leftovers.map((row) => ({
      name: row.name,
      emoji: row.emoji,
      ceiling: row.ceiling,
      netSpent: row.netSpent,
      leftover: row.leftover,
      destinationLabel: destinationLabel(row, decisionByEnvelope.get(row.envelopeId)),
    })),
    savings: data.savingsGoals.map((goal) => ({
      goalName: goal.name,
      manual: toCents(sum(data.savingsEntries.filter((e) => e.savingsGoalId === goal.id && e.source === 'manual'))),
      fromClosure: plan.savingsEntries.find((entry) => entry.savingsGoalId === goal.id)?.amount ?? 0,
    })),
    closure: plan.totals,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/utils/domain/reportSnapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/domain/reportSnapshot.ts tests/unit/server/utils/domain/reportSnapshot.test.ts
git commit -m "feat: add the month summary and the frozen report snapshot"
```

---

### Task 5: Data API queries for the closure

**Files:**
- Create: `server/utils/userError.ts`, `server/utils/closureQuery.ts`
- Test: `tests/unit/server/utils/closureQuery.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient` (`server/utils/supabase.ts`); `YearMonth`, `MonthData`, `compareYearMonth`, `monthLabel` (Task 3); `ReportSnapshotV1` (Task 4).
- Produces:
  - `userError(statusCode: number, statusMessage: string, message: string): H3Error` — `statusMessage` is ASCII, `message` and `data.message` carry the French text.
  - `fetchClosureState(event): Promise<{ firstDataMonth: YearMonth | null, closedMonths: YearMonth[] }>`
  - `fetchMonthData(event, month: YearMonth): Promise<MonthData>`
  - `interface ArchiveRow { year: number, month: number, label: string, generatedAt: string }`, `fetchArchives(event): Promise<ArchiveRow[]>` (newest month first)
  - `fetchReportSnapshot(event, month: YearMonth): Promise<ReportSnapshotV1 | null>`

- [ ] **Step 1: Write the failing tests**

`tests/unit/server/utils/closureQuery.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const responseByTable: Record<string, { data: any, error: any }> = {}
  const calls: Record<string, [string, ...unknown[]][]> = {}

  const makeClient = () => ({
    from(table: string) {
      const record = (name: string) => (...args: unknown[]) => { (calls[table] ??= []).push([name, ...args]); return builder }
      const builder: any = {
        select: record('select'), eq: record('eq'), is: record('is'), order: record('order'),
        limit: record('limit'), abortSignal: () => builder,
        maybeSingle: () => Promise.resolve(responseByTable[table] ?? { data: null, error: null }),
        then: (ok: any, err: any) => Promise.resolve(responseByTable[table] ?? { data: [], error: null }).then(ok, err),
      }
      return builder
    },
  })
  return { responseByTable, calls, makeClient }
})

vi.mock('../../../../server/utils/supabase', () => ({ createSupabaseServerClient: () => mocks.makeClient() }))
// The pool is this project's main hazard. Importing it from here must fail the suite.
vi.mock('../../../../server/utils/db', () => { throw new Error('closureQuery must not touch the connection pool') })

import { fetchClosureState, fetchMonthData, fetchArchives, fetchReportSnapshot } from '../../../../server/utils/closureQuery'

const event = { context: {} } as any

describe('closureQuery', () => {
  beforeEach(() => {
    for (const key of Object.keys(mocks.responseByTable)) delete mocks.responseByTable[key]
    for (const key of Object.keys(mocks.calls)) delete mocks.calls[key]
  })

  it('finds the earliest month with data across all four tables, and the closed months', async () => {
    mocks.responseByTable.month_closures = { data: [{ year: 2026, month: 8 }], error: null }
    mocks.responseByTable.expense_entries = { data: [{ year_assigned: 2026, month_assigned: 9 }], error: null }
    mocks.responseByTable.income_entries = { data: [{ year_assigned: 2026, month_assigned: 8 }], error: null }
    mocks.responseByTable.transfers = { data: [], error: null }
    mocks.responseByTable.savings_entries = { data: [{ year: 2025, month: 12 }], error: null }

    const state = await fetchClosureState(event)

    expect(state).toEqual({ firstDataMonth: { year: 2025, month: 12 }, closedMonths: [{ year: 2026, month: 8 }] })
    expect(mocks.calls.month_closures).toContainEqual(['eq', 'status', 'closed'])
  })

  it('maps one month of rows, keeping nulls and turning numeric strings into numbers', async () => {
    mocks.responseByTable.envelopes = { data: [
      { id: 'e1', name: 'Sorties', emoji: '🥂', kind: 'budget', default_ceiling: '90.00', fifty_thirty_twenty_bucket: 'envies', archived_at: null },
      { id: 'e2', name: 'Fêtes', emoji: '🎂', kind: 'reserve', default_ceiling: null, fifty_thirty_twenty_bucket: null, archived_at: '2026-01-01' },
    ], error: null }
    mocks.responseByTable.monthly_envelope_allocations = { data: [
      { envelope_id: 'e1', base_ceiling: '80.00', carried_over_amount: '5.50', overspend_deduction: '0.00' },
    ], error: null }
    mocks.responseByTable.expense_entries = { data: [
      { date: '2026-09-12', label: 'Bouillon', amount: '64.00', envelope_id: 'e1', financed_by: 'budget', categories: { name: 'Restaurants', emoji: '🍽️', fifty_thirty_twenty_bucket: 'envies' } },
    ], error: null }
    mocks.responseByTable.income_entries = { data: [
      { date_received: '2026-09-28', label: 'Salaire', amount: '2000.00', expected_amount: null, target_envelope_id: null, income_types: [{ name: 'Salaire', emoji: '💼' }] },
    ], error: null }
    mocks.responseByTable.transfers = { data: [
      { date: '2026-09-02', from_envelope_id: 'e1', to_envelope_id: 'e2', amount: '10.00', reason: 'test' },
    ], error: null }
    mocks.responseByTable.savings_entries = { data: [{ savings_goal_id: 'g1', amount: '200.00', source: 'manual' }], error: null }
    mocks.responseByTable.savings_goals = { data: [{ id: 'g1', name: 'Long terme', receives_salary_variance: true }], error: null }

    const data = await fetchMonthData(event, { year: 2026, month: 9 })

    expect(data.envelopes).toEqual([
      { id: 'e1', name: 'Sorties', emoji: '🥂', kind: 'budget', defaultCeiling: 90, bucket: 'envies', archived: false },
      { id: 'e2', name: 'Fêtes', emoji: '🎂', kind: 'reserve', defaultCeiling: 0, bucket: null, archived: true },
    ])
    expect(data.allocations).toEqual([{ envelopeId: 'e1', baseCeiling: 80, carriedOverAmount: 5.5, overspendDeduction: 0 }])
    expect(data.expenses[0]).toEqual({
      date: '2026-09-12', label: 'Bouillon', amount: 64, envelopeId: 'e1', financedBy: 'budget',
      categoryName: 'Restaurants', categoryEmoji: '🍽️', categoryBucket: 'envies',
    })
    expect(data.incomes[0]).toMatchObject({ amount: 2000, expectedAmount: null, targetEnvelopeId: null, typeName: 'Salaire' })
    expect(data.transfers[0]).toEqual({ date: '2026-09-02', fromEnvelopeId: 'e1', toEnvelopeId: 'e2', amount: 10, reason: 'test' })
    expect(data.savingsEntries).toEqual([{ savingsGoalId: 'g1', amount: 200, source: 'manual' }])
    expect(data.savingsGoals).toEqual([{ id: 'g1', name: 'Long terme', receivesSalaryVariance: true }])

    // Month scoping is real, not assumed.
    expect(mocks.calls.expense_entries).toContainEqual(['eq', 'year_assigned', 2026])
    expect(mocks.calls.expense_entries).toContainEqual(['eq', 'month_assigned', 9])
    expect(mocks.calls.savings_entries).toContainEqual(['eq', 'month', 9])
    expect(mocks.calls.monthly_envelope_allocations).toContainEqual(['eq', 'month', 9])
  })

  it('throws a 500 naming the table when a request fails', async () => {
    mocks.responseByTable.transfers = { data: null, error: { message: 'boom' } }
    await expect(fetchMonthData(event, { year: 2026, month: 9 })).rejects.toMatchObject({
      statusCode: 500, message: expect.stringContaining('transfers'),
    })
  })

  it('lists archives newest first with French labels', async () => {
    mocks.responseByTable.monthly_reports = { data: [
      { generated_at: '2026-10-13T08:00:00Z', month_closures: { year: 2026, month: 9 } },
      { generated_at: '2026-11-02T08:00:00Z', month_closures: { year: 2026, month: 10 } },
    ], error: null }

    expect(await fetchArchives(event)).toEqual([
      { year: 2026, month: 10, label: 'Octobre 2026', generatedAt: '2026-11-02T08:00:00Z' },
      { year: 2026, month: 9, label: 'Septembre 2026', generatedAt: '2026-10-13T08:00:00Z' },
    ])
  })

  it('returns a stored snapshot, or null when the month has no report', async () => {
    expect(await fetchReportSnapshot(event, { year: 2026, month: 9 })).toBeNull()

    mocks.responseByTable.monthly_reports = { data: { snapshot: { version: 1 } }, error: null }
    expect(await fetchReportSnapshot(event, { year: 2026, month: 9 })).toEqual({ version: 1 })
    expect(mocks.calls.monthly_reports).toContainEqual(['eq', 'month_closures.year', 2026])
    expect(mocks.calls.monthly_reports).toContainEqual(['eq', 'month_closures.month', 9])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/server/utils/closureQuery.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`server/utils/userError.ts`:
```ts
import { createError } from 'h3'

/**
 * A user-facing error. h3 strips non-ASCII characters from statusMessage (it is an HTTP
 * header), so the French sentence travels in `message` and `data.message`, which reach the
 * client intact as FetchError.data.
 */
export function userError(statusCode: number, statusMessage: string, message: string) {
  return createError({ statusCode, statusMessage, message, data: { message } })
}
```

`server/utils/closureQuery.ts`:
```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { compareYearMonth, monthLabel } from './domain/closure'
import type { MonthData, YearMonth } from './domain/closure'
import type { ReportSnapshotV1 } from './domain/reportSnapshot'

// Data API only, like /api/epargne. This module must never import ./db or the
// pool-backed ledger helpers: an exhausted pool hangs a request forever.
const REQUEST_TIMEOUT_MS = 10000

function assertOk(table: string, error: { message: string } | null) {
  if (!error) return
  console.error(`[closureQuery] ${table} request failed: ${error.message}`)
  throw createError({
    statusCode: 500,
    statusMessage: 'Failed to load closure data',
    message: `closure: ${table} request failed: ${error.message}`,
  })
}

function unwrap<T>(embed: T | T[] | null | undefined): T | null {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

export async function fetchClosureState(event: H3Event): Promise<{ firstDataMonth: YearMonth | null, closedMonths: YearMonth[] }> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const earliest = (table: string, yearColumn: string, monthColumn: string) => supabase
    .from(table)
    .select(`${yearColumn},${monthColumn}`)
    .order(yearColumn, { ascending: true })
    .order(monthColumn, { ascending: true })
    .limit(1)
    .abortSignal(signal)

  const [closuresRes, expenseRes, incomeRes, transferRes, savingsRes] = await Promise.all([
    supabase.from('month_closures').select('year,month').eq('status', 'closed').abortSignal(signal),
    earliest('expense_entries', 'year_assigned', 'month_assigned'),
    earliest('income_entries', 'year_assigned', 'month_assigned'),
    earliest('transfers', 'year_assigned', 'month_assigned'),
    earliest('savings_entries', 'year', 'month'),
  ])

  assertOk('month_closures', closuresRes.error)
  assertOk('expense_entries', expenseRes.error)
  assertOk('income_entries', incomeRes.error)
  assertOk('transfers', transferRes.error)
  assertOk('savings_entries', savingsRes.error)

  const assigned = (rows: any[] | null) => (rows ?? []).map((row) => ({ year: row.year_assigned, month: row.month_assigned }))
  const candidates: YearMonth[] = [
    ...assigned(expenseRes.data),
    ...assigned(incomeRes.data),
    ...assigned(transferRes.data),
    ...(savingsRes.data ?? []).map((row: any) => ({ year: row.year, month: row.month })),
  ]

  return {
    firstDataMonth: candidates.sort(compareYearMonth)[0] ?? null,
    closedMonths: (closuresRes.data ?? []).map((row: any) => ({ year: row.year, month: row.month })),
  }
}

export async function fetchMonthData(event: H3Event, { year, month }: YearMonth): Promise<MonthData> {
  const supabase = createSupabaseServerClient(event)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  const [envelopesRes, allocationsRes, expensesRes, incomesRes, transfersRes, savingsRes, goalsRes] = await Promise.all([
    supabase.from('envelopes')
      .select('id,name,emoji,kind,default_ceiling,fifty_thirty_twenty_bucket,archived_at')
      .order('sort_order').abortSignal(signal),
    supabase.from('monthly_envelope_allocations')
      .select('envelope_id,base_ceiling,carried_over_amount,overspend_deduction')
      .eq('year', year).eq('month', month).abortSignal(signal),
    supabase.from('expense_entries')
      .select('date,label,amount,envelope_id,financed_by,categories(name,emoji,fifty_thirty_twenty_bucket)')
      .eq('year_assigned', year).eq('month_assigned', month).order('date').abortSignal(signal),
    supabase.from('income_entries')
      .select('date_received,label,amount,expected_amount,target_envelope_id,income_types(name,emoji)')
      .eq('year_assigned', year).eq('month_assigned', month).order('date_received').abortSignal(signal),
    supabase.from('transfers')
      .select('date,from_envelope_id,to_envelope_id,amount,reason')
      .eq('year_assigned', year).eq('month_assigned', month).order('date').abortSignal(signal),
    supabase.from('savings_entries')
      .select('savings_goal_id,amount,source')
      .eq('year', year).eq('month', month).abortSignal(signal),
    supabase.from('savings_goals')
      .select('id,name,receives_salary_variance')
      .order('sort_order').abortSignal(signal),
  ])

  assertOk('envelopes', envelopesRes.error)
  assertOk('monthly_envelope_allocations', allocationsRes.error)
  assertOk('expense_entries', expensesRes.error)
  assertOk('income_entries', incomesRes.error)
  assertOk('transfers', transfersRes.error)
  assertOk('savings_entries', savingsRes.error)
  assertOk('savings_goals', goalsRes.error)

  return {
    month: { year, month },
    envelopes: (envelopesRes.data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      kind: row.kind,
      // Reserve envelopes have no ceiling; 0 keeps the type simple and they never reach
      // the ledger anyway.
      defaultCeiling: row.default_ceiling === null ? 0 : Number(row.default_ceiling),
      bucket: row.fifty_thirty_twenty_bucket ?? null,
      archived: row.archived_at !== null,
    })),
    allocations: (allocationsRes.data ?? []).map((row: any) => ({
      envelopeId: row.envelope_id,
      baseCeiling: Number(row.base_ceiling),
      carriedOverAmount: Number(row.carried_over_amount),
      overspendDeduction: Number(row.overspend_deduction),
    })),
    expenses: (expensesRes.data ?? []).map((row: any) => {
      const category = unwrap<any>(row.categories)
      return {
        date: row.date,
        label: row.label,
        amount: Number(row.amount),
        envelopeId: row.envelope_id ?? null,
        financedBy: row.financed_by,
        categoryName: category?.name ?? '',
        categoryEmoji: category?.emoji ?? '',
        categoryBucket: category?.fifty_thirty_twenty_bucket ?? null,
      }
    }),
    incomes: (incomesRes.data ?? []).map((row: any) => {
      const type = unwrap<any>(row.income_types)
      return {
        date: row.date_received,
        label: row.label,
        amount: Number(row.amount),
        expectedAmount: row.expected_amount === null ? null : Number(row.expected_amount),
        targetEnvelopeId: row.target_envelope_id ?? null,
        typeName: type?.name ?? '',
        typeEmoji: type?.emoji ?? '',
      }
    }),
    transfers: (transfersRes.data ?? []).map((row: any) => ({
      date: row.date,
      fromEnvelopeId: row.from_envelope_id,
      toEnvelopeId: row.to_envelope_id,
      amount: Number(row.amount),
      reason: row.reason,
    })),
    savingsEntries: (savingsRes.data ?? []).map((row: any) => ({
      savingsGoalId: row.savings_goal_id,
      amount: Number(row.amount),
      source: row.source,
    })),
    savingsGoals: (goalsRes.data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      receivesSalaryVariance: Boolean(row.receives_salary_variance),
    })),
  }
}

export interface ArchiveRow { year: number, month: number, label: string, generatedAt: string }

export async function fetchArchives(event: H3Event): Promise<ArchiveRow[]> {
  const supabase = createSupabaseServerClient(event)
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('generated_at,month_closures(year,month)')
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  assertOk('monthly_reports', error)

  return (data ?? [])
    .map((row: any) => {
      const closure = unwrap<any>(row.month_closures)
      return { year: closure.year, month: closure.month, label: monthLabel(closure), generatedAt: row.generated_at }
    })
    .sort((a, b) => compareYearMonth(b, a))
}

export async function fetchReportSnapshot(event: H3Event, { year, month }: YearMonth): Promise<ReportSnapshotV1 | null> {
  const supabase = createSupabaseServerClient(event)
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('snapshot,month_closures!inner(year,month)')
    .eq('month_closures.year', year)
    .eq('month_closures.month', month)
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
    .maybeSingle()
  assertOk('monthly_reports', error)

  return (data?.snapshot as ReportSnapshotV1 | undefined) ?? null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/utils/closureQuery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/userError.ts server/utils/closureQuery.ts tests/unit/server/utils/closureQuery.test.ts
git commit -m "feat: add the Data API queries behind the month closure"
```

---

### Task 6: Lock closed months, keep open months following the default ceiling, and show the message

**Files:**
- Create: `server/utils/monthLock.ts`, `app/utils/apiError.ts`
- Modify: `server/api/expenses/index.post.ts`, `server/api/incomes/index.post.ts`, `server/api/transfers/index.post.ts`, `server/api/savings/index.post.ts`, `server/api/envelopes/[id].patch.ts`
- Modify: `app/components/entry/ExpenseForm.vue:68-70`, `app/components/entry/IncomeForm.vue:66-68`, `app/components/entry/TransferForm.vue:55-57`, `app/pages/index.vue:127-129`
- Test: `tests/unit/server/utils/monthLock.test.ts`, `tests/unit/server/api/entryLock.test.ts`, `tests/unit/server/api/envelopePatch.test.ts`, `tests/unit/app/apiError.test.ts`

**Interfaces:**
- Consumes: `userError` (Task 5), `monthLabel` (Task 3), `createSupabaseServerClient`.
- Produces: `assertMonthOpen(event: H3Event, year: number, month: number): Promise<void>` (throws 409 with `"<Mois année> est clôturé. Affectez ce mouvement à un mois ouvert."`); `apiErrorMessage(error: unknown): string | null` (the server's French message for a 400/409, else `null`).

- [ ] **Step 1: Write the failing tests**

`tests/unit/server/utils/monthLock.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ response: { data: [] as any[] | null, error: null as any }, eqs: [] as unknown[][] }))
vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => ({
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: (...args: unknown[]) => { state.eqs.push(args); return builder },
        limit: () => builder,
        abortSignal: () => builder,
        then: (ok: any, err: any) => Promise.resolve(state.response).then(ok, err),
      }
      return builder
    },
  }),
}))
vi.mock('../../../../server/utils/db', () => { throw new Error('monthLock must not touch the connection pool') })

import { assertMonthOpen } from '../../../../server/utils/monthLock'

describe('assertMonthOpen', () => {
  beforeEach(() => {
    state.response = { data: [], error: null }
    state.eqs.length = 0
  })

  it('lets an open month through', async () => {
    await expect(assertMonthOpen({ context: {} } as any, 2026, 10)).resolves.toBeUndefined()
    expect(state.eqs).toEqual([['year', 2026], ['month', 10], ['status', 'closed']])
  })

  it('rejects a closed month with a 409 and a French message', async () => {
    state.response = { data: [{ id: 'c1' }], error: null }
    await expect(assertMonthOpen({ context: {} } as any, 2026, 9)).rejects.toMatchObject({
      statusCode: 409,
      data: { message: 'Septembre 2026 est clôturé. Affectez ce mouvement à un mois ouvert.' },
    })
  })

  it('fails closed with a 500 when the check itself fails', async () => {
    state.response = { data: null, error: { message: 'boom' } }
    await expect(assertMonthOpen({ context: {} } as any, 2026, 9)).rejects.toMatchObject({ statusCode: 500 })
  })
})
```

`tests/unit/server/api/entryLock.test.ts`:
```ts
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const lock = vi.hoisted(() => ({ assertMonthOpen: vi.fn(), input: null as any }))
vi.mock('../../../../server/utils/monthLock', () => ({ assertMonthOpen: lock.assertMonthOpen }))
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1', email: null })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => lock.input) }))

const db = vi.hoisted(() => {
  const chain: any = {}
  chain.insert = vi.fn(() => chain)
  chain.values = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve([]))
  chain.returning = vi.fn(() => Promise.resolve([{ id: 'row' }]))
  return chain
})
vi.mock('../../../../server/utils/db', () => ({ db, withDbTimeout: <T>(p: Promise<T>) => p }))

const routes: Record<string, (event: any) => Promise<any>> = {}
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (handler: any) => handler
  routes.expenses = (await import('../../../../server/api/expenses/index.post.ts')).default as any
  routes.incomes = (await import('../../../../server/api/incomes/index.post.ts')).default as any
  routes.transfers = (await import('../../../../server/api/transfers/index.post.ts')).default as any
  routes.savings = (await import('../../../../server/api/savings/index.post.ts')).default as any
})

const event = () => ({ context: {} }) as any

describe('closed-month lock on every create endpoint', () => {
  beforeEach(() => {
    lock.assertMonthOpen.mockReset()
    db.insert.mockClear()
  })

  it('checks an expense against the month of its date', async () => {
    lock.input = { date: '2026-09-28', categoryId: 'c', label: 'x', amount: 10, financedBy: 'budget' }
    await routes.expenses(event())
    expect(lock.assertMonthOpen).toHaveBeenCalledWith(expect.anything(), 2026, 9)
  })

  it('checks an income against its assigned month, not its reception date', async () => {
    lock.input = { incomeTypeId: 'i', label: 'x', amount: 10, dateReceived: '2026-10-02', monthAssigned: 9, yearAssigned: 2026 }
    await routes.incomes(event())
    expect(lock.assertMonthOpen).toHaveBeenCalledWith(expect.anything(), 2026, 9)
  })

  it('checks a savings entry against its month', async () => {
    lock.input = { savingsGoalId: 'g', year: 2026, month: 9, amount: 10 }
    await routes.savings(event())
    expect(lock.assertMonthOpen).toHaveBeenCalledWith(expect.anything(), 2026, 9)
  })

  it('checks a transfer against the current month', async () => {
    lock.input = { fromEnvelopeId: 'a', toEnvelopeId: 'b', amount: 10, reason: 'r' }
    await routes.transfers(event())
    expect(lock.assertMonthOpen).toHaveBeenCalledTimes(1)
  })

  it.each(['expenses', 'incomes', 'transfers', 'savings'])('writes nothing to a closed month (%s)', async (name) => {
    lock.input = {
      date: '2026-09-28', categoryId: 'c', label: 'x', amount: 10, financedBy: 'budget',
      incomeTypeId: 'i', dateReceived: '2026-09-28', monthAssigned: 9, yearAssigned: 2026,
      fromEnvelopeId: 'a', toEnvelopeId: 'b', reason: 'r', savingsGoalId: 'g', year: 2026, month: 9,
    }
    lock.assertMonthOpen.mockRejectedValueOnce(Object.assign(new Error('closed'), { statusCode: 409 }))
    await expect(routes[name](event())).rejects.toMatchObject({ statusCode: 409 })
    expect(db.insert).not.toHaveBeenCalled()
  })
})
```

`tests/unit/server/api/envelopePatch.test.ts`:
```ts
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ input: null as any }))
vi.mock('../../../../server/utils/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'u1', email: null })) }))
vi.mock('../../../../server/utils/validateBody', () => ({ validateBody: vi.fn(async () => state.input) }))
vi.mock('../../../../server/utils/referenceCrud', () => ({ patchRow: vi.fn(async () => ({ id: 'env-1' })) }))

const db = vi.hoisted(() => {
  const chain: any = {}
  chain.update = vi.fn(() => chain)
  chain.set = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve([]))
  chain.select = vi.fn(() => chain)
  chain.from = vi.fn(() => chain)
  return chain
})
vi.mock('../../../../server/utils/db', () => ({ db, withDbTimeout: <T>(p: Promise<T>) => p }))

let patchEnvelope: (event: any) => Promise<any>
beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (handler: any) => handler
  ;(globalThis as any).getRouterParam = () => 'env-1'
  patchEnvelope = (await import('../../../../server/api/envelopes/[id].patch.ts')).default as any
})

describe('PATCH /api/envelopes/[id]', () => {
  beforeEach(() => {
    db.update.mockClear()
    db.set.mockClear()
  })

  it('carries a new default ceiling into the allocations of every month that is not closed', async () => {
    // A closure writes next month's allocation with a base_ceiling snapshot. Without
    // this, editing the ceiling during that month would silently change nothing.
    state.input = { defaultCeiling: 120 }
    await patchEnvelope({ context: {} })
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(db.set).toHaveBeenCalledWith({ baseCeiling: '120' })
  })

  it('touches no allocation when the ceiling is not part of the edit', async () => {
    state.input = { name: 'Sorties' }
    await patchEnvelope({ context: {} })
    expect(db.update).not.toHaveBeenCalled()
  })
})
```

`tests/unit/app/apiError.test.ts`:
```ts
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

  it('returns null for anything else, so the form keeps its generic copy', () => {
    expect(apiErrorMessage({ statusCode: 500, data: { data: { message: 'internal' } } })).toBeNull()
    expect(apiErrorMessage(new Error('network'))).toBeNull()
    expect(apiErrorMessage({ statusCode: 400, data: { data: { issues: [] } } })).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/server/utils/monthLock.test.ts tests/unit/server/api/entryLock.test.ts tests/unit/server/api/envelopePatch.test.ts tests/unit/app/apiError.test.ts`
Expected: FAIL — modules missing, the lock is never called, no allocation update.

- [ ] **Step 3: Implement the lock**

`server/utils/monthLock.ts`:
```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { monthLabel } from './domain/closure'
import { userError } from './userError'

// Data API only: it is called from pool-backed write routes, and must not take a second
// pool slot of its own while they hold one.
export async function assertMonthOpen(event: H3Event, year: number, month: number): Promise<void> {
  const supabase = createSupabaseServerClient(event)
  const { data, error } = await supabase
    .from('month_closures')
    .select('id')
    .eq('year', year)
    .eq('month', month)
    .eq('status', 'closed')
    .limit(1)
    .abortSignal(AbortSignal.timeout(10000))

  if (error) {
    console.error(`[monthLock] month_closures request failed: ${error.message}`)
    // Fail closed: writing into a month that might be closed would falsify its report.
    throw createError({ statusCode: 500, statusMessage: 'Failed to check month lock' })
  }

  if (data && data.length > 0) {
    throw userError(409, 'Month closed', `${monthLabel({ year, month })} est clôturé. Affectez ce mouvement à un mois ouvert.`)
  }
}
```

Wire it into each route, immediately after `validateBody` and before any write:
- `server/api/expenses/index.post.ts`: after computing `entryYear`/`entryMonth`, add `await assertMonthOpen(event, entryYear, entryMonth)`.
- `server/api/incomes/index.post.ts`: `await assertMonthOpen(event, input.yearAssigned, input.monthAssigned)`.
- `server/api/transfers/index.post.ts`: after computing `transferYear`/`transferMonth`, `await assertMonthOpen(event, transferYear, transferMonth)`.
- `server/api/savings/index.post.ts`: `await assertMonthOpen(event, input.year, input.month)` before the lookup.

Each with the import `import { assertMonthOpen } from '../../utils/monthLock'` and this one-line comment: `// A closed month is frozen: its report and leftovers must stay true.`

- [ ] **Step 4: Implement the ceiling propagation**

`server/api/envelopes/[id].patch.ts` becomes:
```ts
import { and, eq, notExists } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { patchRow } from '../../utils/referenceCrud'
import { validateBody } from '../../utils/validateBody'
import { db, withDbTimeout } from '../../utils/db'
import { envelopes, monthlyEnvelopeAllocations, monthClosures } from '../../../drizzle/schema'
import { envelopePatchSchema } from '../../../shared/schemas/envelope'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const input = await validateBody(event, envelopePatchSchema)
  const row = await patchRow(envelopes, id, input)

  // A month closure writes the next month's allocation with a base_ceiling snapshot, so
  // the default ceiling alone no longer reaches that month. Every month that is not
  // closed follows the new default; closed months keep the figure their report used.
  if (input.defaultCeiling !== undefined && input.defaultCeiling !== null) {
    await withDbTimeout(db
      .update(monthlyEnvelopeAllocations)
      .set({ baseCeiling: String(input.defaultCeiling) })
      .where(and(
        eq(monthlyEnvelopeAllocations.envelopeId, id),
        notExists(db
          .select()
          .from(monthClosures)
          .where(and(
            eq(monthClosures.year, monthlyEnvelopeAllocations.year),
            eq(monthClosures.month, monthlyEnvelopeAllocations.month),
            eq(monthClosures.status, 'closed'),
          ))),
      )))
  }

  return row
})
```
Update the helper text in `app/components/EnvelopeEditForm.vue:114` to: `Utilisé pour le mois en cours et les suivants. Ne modifie pas un mois déjà clôturé.`

- [ ] **Step 5: Implement the client message**

`app/utils/apiError.ts`:
```ts
/**
 * The server's French explanation for a refusal the user can act on — a closed month
 * (409) or an incomplete closure (400). Anything else returns null so the caller keeps
 * its own generic copy. See server/utils/userError.ts for where the message travels.
 */
export function apiErrorMessage(error: unknown): string | null {
  const e = error as { statusCode?: number, data?: { message?: unknown, data?: { message?: unknown } } } | null
  if (!e || (e.statusCode !== 409 && e.statusCode !== 400)) return null
  const message = e.data?.data?.message
  return typeof message === 'string' ? message : null
}
```
In each form's `catch`, take the error and prefer the server message. `ExpenseForm.vue`:
```ts
  } catch (error) {
    errorMessage.value = apiErrorMessage(error) ?? "Impossible d'enregistrer la sortie. Vérifiez les champs et réessayez."
  } finally {
```
Same pattern in `IncomeForm.vue` (keep its own generic sentence), `TransferForm.vue` (keep its own), and the savings form in `app/pages/index.vue` (`savingsError.value = apiErrorMessage(error) ?? "Impossible d'enregistrer ce montant."`). `apiErrorMessage` is auto-imported from `app/utils`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/utils/monthLock.test.ts tests/unit/server/api/entryLock.test.ts tests/unit/server/api/envelopePatch.test.ts tests/unit/app/apiError.test.ts tests/unit/server/api/savingsPost.test.ts`
Expected: PASS. (`savingsPost.test.ts` needs `vi.mock('../../../../server/utils/monthLock', () => ({ assertMonthOpen: vi.fn() }))` added at the top, since the route now calls it.)

- [ ] **Step 7: Run the whole unit suite**

Run: `npm test`
Expected: all pass. Any other existing test that imports one of the four POST routes needs the same `monthLock` mock.

- [ ] **Step 8: Commit**

```bash
git add server/utils/monthLock.ts app/utils/apiError.ts server/api app/components/entry app/components/EnvelopeEditForm.vue app/pages/index.vue tests/unit
git commit -m "feat: lock closed months against new movements and keep open months on the default ceiling"
```

---

### Task 7: Closure service, `close_month` function and the closure endpoints

**Files:**
- Create: `shared/schemas/closure.ts`, `server/utils/closureService.ts`
- Create: `drizzle/migrations/0006_close_month.sql`; Modify: `drizzle/migrations/meta/_journal.json`
- Create: `server/api/closure/status.get.ts`, `server/api/closure/index.get.ts`, `server/api/closure/index.post.ts`
- Test: `tests/unit/server/utils/closureService.test.ts`, `tests/unit/shared/schemas/closure.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–5.
- Produces:
  - `closureInputSchema` (`{ year, month, decisions: { envelopeId, destination, savingsGoalId?, targetEnvelopeId? }[] }`), `reportParamsSchema` (`{ year, month }`, coerced)
  - `interface ClosureStatusPayload { closableMonth: { year: number, month: number, label: string, name: string } | null }`
  - `interface ClosurePagePayload` (exact shape below)
  - `getClosureStatus(event, now: Date): Promise<ClosureStatusPayload>`
  - `getClosurePage(event, now: Date): Promise<ClosurePagePayload>`
  - `closeMonth(event, input: ClosureInput, now: Date): Promise<YearMonth>`
  - Postgres `public.close_month(payload jsonb) returns uuid`

- [ ] **Step 1: Write the failing tests**

`tests/unit/shared/schemas/closure.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { closureInputSchema, reportParamsSchema } from '../../../../shared/schemas/closure'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('closure schemas', () => {
  it('accepts a decision list with optional targets', () => {
    const parsed = closureInputSchema.parse({
      year: '2026', month: '9',
      decisions: [{ envelopeId: uuid, destination: 'savings', savingsGoalId: uuid, targetEnvelopeId: null }],
    })
    expect(parsed.year).toBe(2026)
    expect(parsed.decisions[0].destination).toBe('savings')
  })

  it('rejects an unknown destination and an impossible month', () => {
    expect(closureInputSchema.safeParse({ year: 2026, month: 13, decisions: [] }).success).toBe(false)
    expect(closureInputSchema.safeParse({ year: 2026, month: 9, decisions: [{ envelopeId: uuid, destination: 'lost' }] }).success).toBe(false)
  })

  it('coerces route params', () => {
    expect(reportParamsSchema.parse({ year: '2026', month: '09' })).toEqual({ year: 2026, month: 9 })
    expect(reportParamsSchema.safeParse({ year: '2026', month: 'abc' }).success).toBe(false)
  })
})
```

`tests/unit/server/utils/closureService.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MonthData } from '../../../../server/utils/domain/closure'

const q = vi.hoisted(() => ({
  fetchClosureState: vi.fn(),
  fetchMonthData: vi.fn(),
  fetchArchives: vi.fn(),
}))
vi.mock('../../../../server/utils/closureQuery', () => q)

const rpc = vi.hoisted(() => ({ calls: [] as any[], result: { data: 'closure-id', error: null as any } }))
vi.mock('../../../../server/utils/supabase', () => ({
  createSupabaseServerClient: () => ({
    rpc: (name: string, args: any) => {
      rpc.calls.push([name, args])
      return { abortSignal: () => Promise.resolve(rpc.result) }
    },
  }),
}))
vi.mock('../../../../server/utils/db', () => { throw new Error('closureService must not touch the connection pool') })

import { getClosureStatus, getClosurePage, closeMonth } from '../../../../server/utils/closureService'

const event = { context: {} } as any
const NOW = new Date('2026-10-13T08:00:00Z')
const SEPT = { year: 2026, month: 9 }

const septemberData: MonthData = {
  month: SEPT,
  envelopes: [
    { id: 'sorties', name: 'Sorties', emoji: '🥂', kind: 'budget', defaultCeiling: 90, bucket: 'envies', archived: false },
    { id: 'voyage', name: 'Voyage', emoji: '✈️', kind: 'budget', defaultCeiling: 0, bucket: 'envies', archived: false },
  ],
  allocations: [],
  expenses: [
    { date: '2026-09-12', label: 'Bouillon', amount: 64, envelopeId: 'sorties', financedBy: 'budget', categoryName: 'Restaurants', categoryEmoji: '🍽️', categoryBucket: 'envies' },
    { date: '2026-09-20', label: 'Train', amount: 12, envelopeId: 'voyage', financedBy: 'budget', categoryName: 'Transport', categoryEmoji: '🚗', categoryBucket: 'besoins' },
  ],
  incomes: [],
  transfers: [],
  savingsEntries: [],
  savingsGoals: [{ id: 'lt', name: 'Long terme', receivesSalaryVariance: true }],
}

describe('closureService', () => {
  beforeEach(() => {
    q.fetchClosureState.mockResolvedValue({ firstDataMonth: SEPT, closedMonths: [] })
    q.fetchMonthData.mockResolvedValue(septemberData)
    q.fetchArchives.mockResolvedValue([])
    rpc.calls.length = 0
    rpc.result = { data: 'closure-id', error: null }
  })

  it('reports the closable month for the dashboard', async () => {
    expect(await getClosureStatus(event, NOW)).toEqual({
      closableMonth: { year: 2026, month: 9, label: 'Septembre 2026', name: 'septembre' },
    })
  })

  it('builds the page payload for the closable month', async () => {
    const page = await getClosurePage(event, NOW)
    expect(page.closable).toEqual({ year: 2026, month: 9, label: 'Septembre 2026', nextMonthName: 'octobre' })
    expect(page.envelopes).toEqual([
      { id: 'sorties', name: 'Sorties', emoji: '🥂', ceiling: 90, netSpent: 64, leftover: 26 },
      { id: 'voyage', name: 'Voyage', emoji: '✈️', ceiling: 0, netSpent: 12, leftover: -12 },
    ])
    expect(page.summary).toEqual({ income: 0, spent: 76, saved: 0, remaining: -76 })
    expect(page.defaultSavingsGoalId).toBe('lt')
    expect(page.nextOpening).toBeNull()
  })

  it('shows when the next closure opens once nothing is closable', async () => {
    q.fetchClosureState.mockResolvedValue({ firstDataMonth: SEPT, closedMonths: [SEPT] })
    const page = await getClosurePage(event, NOW)
    expect(page.closable).toBeNull()
    expect(page.envelopes).toEqual([])
    expect(page.summary).toBeNull()
    expect(page.nextOpening).toEqual({ year: 2026, month: 11, label: '1er novembre' })
    expect(q.fetchMonthData).not.toHaveBeenCalled()
  })

  it('sends one atomic RPC with the plan and the snapshot', async () => {
    const result = await closeMonth(event, {
      year: 2026, month: 9, decisions: [{ envelopeId: 'sorties', destination: 'carry_over' }],
    }, NOW)

    expect(result).toEqual(SEPT)
    expect(rpc.calls).toHaveLength(1)
    const [name, { payload }] = rpc.calls[0]
    expect(name).toBe('close_month')
    expect(payload.year).toBe(2026)
    expect(payload.month).toBe(9)
    expect(payload.nextAllocations).toEqual([
      { envelopeId: 'sorties', baseCeiling: 90, carriedOverAmount: 26, overspendDeduction: 0 },
      { envelopeId: 'voyage', baseCeiling: 0, carriedOverAmount: 0, overspendDeduction: 12 },
    ])
    expect(payload.freezeAllocations).toHaveLength(2)
    expect(payload.snapshot.version).toBe(1)
    expect(payload.snapshot.closure).toEqual({ carriedOver: 26, toSavings: 0, toOtherEnvelopes: 0, overspendDeducted: 12 })
  })

  it('refuses a month that is not the closable one, before any write', async () => {
    await expect(closeMonth(event, { year: 2026, month: 10, decisions: [] }, NOW))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(rpc.calls).toHaveLength(0)
  })

  it('turns an incomplete plan into a 400 with the French reason', async () => {
    await expect(closeMonth(event, { year: 2026, month: 9, decisions: [] }, NOW))
      .rejects.toMatchObject({ statusCode: 400, data: { message: 'Il reste 1 reliquat à répartir (« Sorties »).' } })
    expect(rpc.calls).toHaveLength(0)
  })

  it.each([
    [{ message: 'MONTH_ALREADY_CLOSED', code: 'P0001' }, 409],
    [{ message: 'duplicate key value violates unique constraint', code: '23505' }, 409],
    [{ message: 'PREVIOUS_MONTH_OPEN', code: 'P0001' }, 409],
    [{ message: 'something else', code: 'XX000' }, 500],
  ])('maps a database refusal %o to %i', async (error, status) => {
    // A double click or a second tab reaches the database after the first closure won.
    rpc.result = { data: null, error }
    await expect(closeMonth(event, {
      year: 2026, month: 9, decisions: [{ envelopeId: 'sorties', destination: 'carry_over' }],
    }, NOW)).rejects.toMatchObject({ statusCode: status })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/shared/schemas/closure.test.ts tests/unit/server/utils/closureService.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement the schemas**

`shared/schemas/closure.ts`:
```ts
import { z } from 'zod'

export const closureDecisionSchema = z.object({
  envelopeId: z.string().uuid(),
  destination: z.enum(['carry_over', 'savings', 'envelope']),
  savingsGoalId: z.string().uuid().nullable().optional(),
  targetEnvelopeId: z.string().uuid().nullable().optional(),
})

export const closureInputSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  decisions: z.array(closureDecisionSchema).max(200),
})

export type ClosureInput = z.infer<typeof closureInputSchema>

export const reportParamsSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})
```

- [ ] **Step 4: Implement the service**

`server/utils/closureService.ts`:
```ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createSupabaseServerClient } from './supabase'
import { fetchClosureState, fetchMonthData, fetchArchives } from './closureQuery'
import type { ArchiveRow } from './closureQuery'
import {
  closureWindow, computeLeftovers, planClosure, ClosurePlanError,
  defaultSavingsGoalId, monthLabel, monthName, nextYearMonth,
} from './domain/closure'
import type { YearMonth } from './domain/closure'
import { summariseMonth, buildReportSnapshot } from './domain/reportSnapshot'
import type { MonthSummary, Rule503020View } from './domain/reportSnapshot'
import { userError } from './userError'
import type { ClosureInput } from '../../shared/schemas/closure'

// Data API only — see closureQuery.ts.

export interface ClosureStatusPayload {
  closableMonth: { year: number, month: number, label: string, name: string } | null
}

export interface ClosurePagePayload {
  closable: { year: number, month: number, label: string, nextMonthName: string } | null
  nextOpening: { year: number, month: number, label: string } | null
  envelopes: { id: string, name: string, emoji: string, ceiling: number, netSpent: number, leftover: number }[]
  summary: MonthSummary | null
  rule503020: Rule503020View | null
  savingsGoals: { id: string, name: string, receivesSalaryVariance: boolean }[]
  defaultSavingsGoalId: string | null
  archives: ArchiveRow[]
}

async function currentWindow(event: H3Event, now: Date) {
  return closureWindow({ ...(await fetchClosureState(event)), now })
}

export async function getClosureStatus(event: H3Event, now: Date): Promise<ClosureStatusPayload> {
  const { closable } = await currentWindow(event, now)
  return {
    closableMonth: closable ? { ...closable, label: monthLabel(closable), name: monthName(closable.month) } : null,
  }
}

export async function getClosurePage(event: H3Event, now: Date): Promise<ClosurePagePayload> {
  const [{ closable, nextOpening }, archives] = await Promise.all([currentWindow(event, now), fetchArchives(event)])

  if (!closable) {
    return {
      closable: null,
      nextOpening: nextOpening ? { ...nextOpening, label: `1er ${monthName(nextOpening.month)}` } : null,
      envelopes: [],
      summary: null,
      rule503020: null,
      savingsGoals: [],
      defaultSavingsGoalId: null,
      archives,
    }
  }

  const data = await fetchMonthData(event, closable)
  const { summary, rule503020 } = summariseMonth(data, 0)

  return {
    closable: { ...closable, label: monthLabel(closable), nextMonthName: monthName(nextYearMonth(closable).month) },
    nextOpening: null,
    envelopes: computeLeftovers(data).map((row) => ({
      id: row.envelopeId,
      name: row.name,
      emoji: row.emoji,
      ceiling: row.ceiling,
      netSpent: row.netSpent,
      leftover: row.leftover,
    })),
    summary,
    rule503020,
    savingsGoals: data.savingsGoals,
    defaultSavingsGoalId: defaultSavingsGoalId(data.savingsGoals),
    archives,
  }
}

export async function closeMonth(event: H3Event, input: ClosureInput, now: Date): Promise<YearMonth> {
  const { closable } = await currentWindow(event, now)
  if (!closable || closable.year !== input.year || closable.month !== input.month) {
    throw userError(409, 'Month not closable', closable
      ? `Seul ${monthLabel(closable).toLowerCase()} peut être clôturé maintenant.`
      : "Aucun mois ne peut être clôturé pour l'instant.")
  }

  // Leftovers are always recomputed here; the client only sends destinations.
  const data = await fetchMonthData(event, closable)
  const leftovers = computeLeftovers(data)

  let plan
  try {
    plan = planClosure({ leftovers, decisions: input.decisions, savingsGoalIds: data.savingsGoals.map((goal) => goal.id) })
  }
  catch (error) {
    if (error instanceof ClosurePlanError) throw userError(400, 'Invalid closure', error.message)
    throw error
  }

  const snapshot = buildReportSnapshot({ data, leftovers, plan, closedAt: now })

  const supabase = createSupabaseServerClient(event)
  const { error } = await supabase
    .rpc('close_month', {
      payload: {
        year: closable.year,
        month: closable.month,
        decisions: plan.decisions,
        nextAllocations: plan.nextAllocations,
        freezeAllocations: plan.freezeAllocations,
        savingsEntries: plan.savingsEntries,
        snapshot,
      },
    })
    .abortSignal(AbortSignal.timeout(10000))

  if (error) {
    // The database re-checks what was checked above: a second tab or a double click can
    // get here after the first closure committed.
    if (error.message.includes('MONTH_ALREADY_CLOSED') || error.code === '23505') {
      throw userError(409, 'Month already closed', `${monthLabel(closable)} est déjà clôturé.`)
    }
    if (error.message.includes('PREVIOUS_MONTH_OPEN')) {
      throw userError(409, 'Previous month open', 'Le mois précédent doit être clôturé avant celui-ci.')
    }
    console.error(`[closureService] close_month failed: ${error.message}`)
    throw createError({ statusCode: 500, statusMessage: 'Month closure failed' })
  }

  return closable
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/shared/schemas/closure.test.ts tests/unit/server/utils/closureService.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the `close_month` migration**

`drizzle/migrations/0006_close_month.sql`:
```sql
-- Performs every write of a month closure in one transaction.
--
-- Hand-written, like 0002_enable_rls.sql: Drizzle does not manage functions, so a later
-- `db:generate` neither recreates nor drops it. SECURITY INVOKER keeps RLS in force — the
-- caller is the signed-in household through the Data API, never the table owner.
--
-- The server computes the plan (server/utils/domain/closure.ts); this function re-checks
-- the two ordering rules the server already checked, because a second tab or a double
-- click can arrive after the first closure has committed.

CREATE OR REPLACE FUNCTION public.close_month(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p_year int := (payload->>'year')::int;
  p_month int := (payload->>'month')::int;
  next_year int := CASE WHEN (payload->>'month')::int = 12 THEN (payload->>'year')::int + 1 ELSE (payload->>'year')::int END;
  next_month int := CASE WHEN (payload->>'month')::int = 12 THEN 1 ELSE (payload->>'month')::int + 1 END;
  closure_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM month_closures WHERE year = p_year AND month = p_month AND status = 'closed') THEN
    RAISE EXCEPTION 'MONTH_ALREADY_CLOSED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT year_assigned AS y, month_assigned AS m FROM expense_entries
      UNION SELECT year_assigned, month_assigned FROM income_entries
      UNION SELECT year_assigned, month_assigned FROM transfers
      UNION SELECT year, month FROM savings_entries
    ) AS data_months
    WHERE (data_months.y, data_months.m) < (p_year, p_month)
      AND NOT EXISTS (
        SELECT 1 FROM month_closures c
        WHERE c.year = data_months.y AND c.month = data_months.m AND c.status = 'closed'
      )
  ) THEN
    RAISE EXCEPTION 'PREVIOUS_MONTH_OPEN';
  END IF;

  INSERT INTO month_closures (year, month, status, closed_at)
  VALUES (p_year, p_month, 'closed', now())
  RETURNING id INTO closure_id;

  INSERT INTO closure_envelope_decisions
    (month_closure_id, envelope_id, leftover_amount, destination, destination_savings_goal_id, destination_envelope_id)
  SELECT closure_id,
         (d->>'envelopeId')::uuid,
         (d->>'leftoverAmount')::numeric,
         (d->>'destination')::closure_destination,
         (d->>'savingsGoalId')::uuid,
         (d->>'targetEnvelopeId')::uuid
  FROM jsonb_array_elements(payload->'decisions') AS d;

  INSERT INTO monthly_envelope_allocations (envelope_id, year, month, base_ceiling, carried_over_amount, overspend_deduction)
  SELECT (a->>'envelopeId')::uuid, p_year, p_month, (a->>'baseCeiling')::numeric, 0, 0
  FROM jsonb_array_elements(payload->'freezeAllocations') AS a
  ON CONFLICT (envelope_id, year, month) DO NOTHING;

  INSERT INTO monthly_envelope_allocations (envelope_id, year, month, base_ceiling, carried_over_amount, overspend_deduction)
  SELECT (a->>'envelopeId')::uuid, next_year, next_month,
         (a->>'baseCeiling')::numeric, (a->>'carriedOverAmount')::numeric, (a->>'overspendDeduction')::numeric
  FROM jsonb_array_elements(payload->'nextAllocations') AS a
  ON CONFLICT (envelope_id, year, month) DO UPDATE
    SET carried_over_amount = EXCLUDED.carried_over_amount,
        overspend_deduction = EXCLUDED.overspend_deduction;

  INSERT INTO savings_entries (savings_goal_id, year, month, amount, source)
  SELECT (s->>'savingsGoalId')::uuid, p_year, p_month, (s->>'amount')::numeric, 'closure'
  FROM jsonb_array_elements(payload->'savingsEntries') AS s;

  INSERT INTO monthly_reports (month_closure_id, snapshot)
  VALUES (closure_id, payload->'snapshot');

  RETURN closure_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.close_month(jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.close_month(jsonb) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
```

Add the journal entry to `drizzle/migrations/meta/_journal.json`, after the `0005` entry, with `"when"` = the `0005` entry's `when` + 1 (as `0002_enable_rls` was added):
```json
    {
      "idx": 6,
      "version": "7",
      "when": <0005 when + 1>,
      "tag": "0006_close_month",
      "breakpoints": true
    }
```

- [ ] **Step 7: Apply to the live database — ask first**

The function is new and nothing calls it yet. **Ask the human partner for confirmation**, then run `npm run db:migrate`. Then check it exists without running it:
```bash
npx tsx -e "import 'dotenv/config'; import postgres from 'postgres'; const sql = postgres(process.env.DATABASE_URL!); const r = await sql\`select proname, prosecdef from pg_proc where proname = 'close_month'\`; console.log(r); await sql.end()"
```
Expected: one row, `prosecdef: false` (security invoker).

- [ ] **Step 8: Add the endpoints**

`server/api/closure/status.get.ts`:
```ts
import { requireUser } from '../../utils/auth'
import { getClosureStatus } from '../../utils/closureService'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getClosureStatus(event, new Date())
})
```
`server/api/closure/index.get.ts`:
```ts
import { requireUser } from '../../utils/auth'
import { getClosurePage } from '../../utils/closureService'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return getClosurePage(event, new Date())
})
```
`server/api/closure/index.post.ts`:
```ts
import { requireUser } from '../../utils/auth'
import { validateBody } from '../../utils/validateBody'
import { closeMonth } from '../../utils/closureService'
import { closureInputSchema } from '../../../shared/schemas/closure'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const input = await validateBody(event, closureInputSchema)
  return closeMonth(event, input, new Date())
})
```

- [ ] **Step 9: Smoke-check the read endpoints against the live database**

Run `npm run dev`, sign in at `http://localhost:3000/login`, then open `http://localhost:3000/api/closure/status` and `http://localhost:3000/api/closure` in the same browser.
Expected (today, 2026-10-13, with data since September): `closableMonth` is September 2026; `/api/closure` lists the budget envelopes with leftovers that match `/enveloppes` for September. **Do not POST.**

- [ ] **Step 10: Commit**

```bash
git add shared/schemas/closure.ts server/utils/closureService.ts server/api/closure drizzle/migrations tests/unit
git commit -m "feat: add the closure service, the close_month function and the closure endpoints"
```

---

### Task 8: The PDF report

**Files:**
- Create: `server/utils/reportLayout.ts`, `server/utils/reportPdf.ts`, `server/api/reports/[year]/[month].get.ts`
- Test: `tests/unit/server/utils/reportLayout.test.ts`, `tests/unit/server/utils/reportPdf.test.ts`, `tests/unit/fixtures/reportSnapshot.ts`

**Interfaces:**
- Consumes: `ReportSnapshotV1` (Task 4), `createPdfDocument`, `pdfToBuffer`, `ReportFonts`, `loadReportFonts` (Task 1), `fetchReportSnapshot` (Task 5), `reportParamsSchema` (Task 7), `formatEuro` (`app/utils/currency.ts`).
- Produces:
  - `type LayoutBlock = { kind: 'title', text: string, subtitle: string } | { kind: 'tiles', tiles: { label: string, value: string }[] } | { kind: 'heading', text: string } | { kind: 'note', text: string } | { kind: 'table', columns: { header: string, width: number, align: 'left' | 'right' }[], rows: { cells: string[], tone?: 'warn' | 'strong' }[] }`
  - `buildReportLayout(snapshot: ReportSnapshotV1): LayoutBlock[][]` (exactly two logical pages)
  - `formatPdfEuro(value: number): string`, `formatPdfDate(isoDate: string): string` (`'28/09'`), `formatClosedAt(iso: string): string` (`'13 octobre 2026'`, Paris time)
  - `renderReportPdf(snapshot: ReportSnapshotV1, fonts: ReportFonts, options?: { compress?: boolean }): Promise<Buffer>`
  - `GET /api/reports/:year/:month` → `application/pdf`, attachment `budget-YYYY-MM.pdf`

- [ ] **Step 1: Write the shared fixture**

`tests/unit/fixtures/reportSnapshot.ts`:
```ts
import type { ReportSnapshotV1 } from '../../../server/utils/domain/reportSnapshot'

export const septemberSnapshot: ReportSnapshotV1 = {
  version: 1,
  month: { year: 2026, month: 9, label: 'Septembre 2026' },
  closedAt: '2026-10-13T08:00:00.000Z',
  summary: { income: 2316, spent: 1234.5, saved: 381, remaining: 700.5 },
  rule503020: { targets: { besoins: 50, envies: 30, epargne: 20 }, actuals: { besoins: 48, envies: 29, epargne: 16 } },
  incomes: [{ date: '2026-09-28', label: 'Salaire septembre', typeName: 'Salaire', typeEmoji: '💼', amount: 2316, targetEnvelopeName: null }],
  expenses: [
    { date: '2026-09-03', label: 'Loyer', categoryName: 'Loyer', categoryEmoji: '🏠', envelopeName: null, financedBy: 'budget', amount: 650 },
    { date: '2026-09-12', label: 'Resto Le Bouillon', categoryName: 'Restaurants', categoryEmoji: '🍽️', envelopeName: 'Sorties', financedBy: 'budget', amount: 64 },
    { date: '2026-09-14', label: 'Monoprix', categoryName: 'Courses', categoryEmoji: '🛒', envelopeName: null, financedBy: 'budget', amount: 520.5 },
  ],
  transfers: [{ date: '2026-09-18', fromName: 'Restaurants', toName: 'Sorties', reason: 'anniversaire', amount: 20 }],
  envelopes: [
    { name: 'Sorties', emoji: '🥂', ceiling: 110, netSpent: 84, leftover: 26, destinationLabel: 'Reporté' },
    { name: 'Voyage', emoji: '✈️', ceiling: 0, netSpent: 12, leftover: -12, destinationLabel: 'Déduit le mois suivant' },
  ],
  savings: [{ goalName: 'Long terme', manual: 345, fromClosure: 36 }],
  closure: { carriedOver: 26, toSavings: 36, toOtherEnvelopes: 0, overspendDeducted: 12 },
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/server/utils/reportLayout.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildReportLayout, formatPdfEuro, formatPdfDate, formatClosedAt } from '../../../../server/utils/reportLayout'
import { septemberSnapshot } from '../../fixtures/reportSnapshot'

describe('report formatting', () => {
  it('uses plain spaces so the embedded font never needs U+202F or U+00A0', () => {
    expect(formatPdfEuro(1234.5)).toBe('1 234,50 €')
    expect(formatPdfEuro(-12)).toBe('-12,00 €')
    expect(formatPdfEuro(1234.5)).not.toMatch(/[  ]/)
  })

  it('formats dates the French way, in Paris time', () => {
    expect(formatPdfDate('2026-09-28')).toBe('28/09')
    expect(formatClosedAt('2026-10-31T23:30:00.000Z')).toBe('1 novembre 2026')
  })
})

describe('buildReportLayout', () => {
  const [page1, page2] = buildReportLayout(septemberSnapshot)

  it('has exactly two logical pages', () => {
    expect(buildReportLayout(septemberSnapshot)).toHaveLength(2)
  })

  it('opens page 1 with the title, the closure date and the four tiles', () => {
    expect(page1[0]).toEqual({ kind: 'title', text: 'Compte rendu — Septembre 2026', subtitle: 'Clôturé le 13 octobre 2026' })
    expect(page1[1]).toEqual({ kind: 'tiles', tiles: [
      { label: 'Revenus', value: '2 316,00 €' },
      { label: 'Dépensé', value: '1 234,50 €' },
      { label: 'Épargné', value: '381,00 €' },
      { label: 'Reste', value: '700,50 €' },
    ] })
  })

  it('shows envelopes with their destination, and overspends in the warning tone', () => {
    const table = page1.find((b) => b.kind === 'table' && b.columns[0].header === 'Enveloppe') as any
    expect(table.rows).toEqual([
      { cells: ['🥂 Sorties', '110,00 €', '84,00 €', '26,00 €', 'Reporté'] },
      { cells: ['✈️ Voyage', '0,00 €', '12,00 €', '-12,00 €', 'Déduit le mois suivant'], tone: 'warn' },
    ])
  })

  it('groups expenses by category on page 2, with a subtotal per category', () => {
    const table = page2.find((b) => b.kind === 'table' && b.columns[0].header === 'Date') as any
    expect(table.rows).toEqual([
      { cells: ['03/09', 'Loyer', '—', '650,00 €'] },
      { cells: ['', '🏠 Loyer', '', '650,00 €'], tone: 'strong' },
      { cells: ['12/09', 'Resto Le Bouillon', 'Sorties', '64,00 €'] },
      { cells: ['', '🍽️ Restaurants', '', '64,00 €'], tone: 'strong' },
      { cells: ['14/09', 'Monoprix', '—', '520,50 €'] },
      { cells: ['', '🛒 Courses', '', '520,50 €'], tone: 'strong' },
    ])
  })

  it('ends page 2 with the closure summary', () => {
    const last = page2[page2.length - 1] as any
    expect(last.kind).toBe('table')
    expect(last.rows.map((r: any) => r.cells)).toEqual([
      ['Reporté sur le mois suivant', '26,00 €'],
      ["Versé à l'épargne", '36,00 €'],
      ["Vers d'autres enveloppes", '0,00 €'],
      ['Dépassements déduits', '12,00 €'],
    ])
  })

  it('writes a note instead of an empty table', () => {
    const [p1, p2] = buildReportLayout({ ...septemberSnapshot, incomes: [], transfers: [] })
    expect(p1).toContainEqual({ kind: 'note', text: 'Aucune entrée ce mois-ci.' })
    expect(p2).toContainEqual({ kind: 'note', text: 'Aucun transfert ce mois-ci.' })
  })
})
```

`tests/unit/server/utils/reportPdf.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderReportPdf } from '../../../../server/utils/reportPdf'
import { septemberSnapshot } from '../../fixtures/reportSnapshot'

const fontDir = path.join(process.cwd(), 'server/assets/fonts')
const fonts = {
  semibold: readFileSync(path.join(fontDir, 'PlusJakartaSans-SemiBold.ttf')),
  bold: readFileSync(path.join(fontDir, 'PlusJakartaSans-Bold.ttf')),
  extrabold: readFileSync(path.join(fontDir, 'PlusJakartaSans-ExtraBold.ttf')),
}
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length

describe('renderReportPdf', () => {
  it('renders the two pages of a normal month', async () => {
    const pdf = await renderReportPdf(septemberSnapshot, fonts)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pageCount(pdf)).toBe(2)
  })

  it('continues a long list on extra pages instead of cutting it', async () => {
    const expenses = Array.from({ length: 120 }, (_, i) => ({
      ...septemberSnapshot.expenses[2], label: `Achat ${i}`,
    }))
    const pdf = await renderReportPdf({ ...septemberSnapshot, expenses }, fonts)
    expect(pageCount(pdf)).toBeGreaterThan(2)
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/unit/server/utils/reportLayout.test.ts tests/unit/server/utils/reportPdf.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement the layout**

`server/utils/reportLayout.ts`:
```ts
import { formatEuro } from '../../app/utils/currency'
import type { ReportSnapshotV1 } from './domain/reportSnapshot'

export type LayoutBlock =
  | { kind: 'title', text: string, subtitle: string }
  | { kind: 'tiles', tiles: { label: string, value: string }[] }
  | { kind: 'heading', text: string }
  | { kind: 'note', text: string }
  | {
      kind: 'table'
      columns: { header: string, width: number, align: 'left' | 'right' }[]
      rows: { cells: string[], tone?: 'warn' | 'strong' }[]
    }

/** formatEuro with plain spaces: Intl's U+202F / U+00A0 may be missing from the embedded font. */
export function formatPdfEuro(value: number): string {
  return formatEuro(value).replace(/[  ]/g, ' ')
}

export function formatPdfDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}

const CLOSED_AT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' })

export function formatClosedAt(iso: string): string {
  return CLOSED_AT.format(new Date(iso)).replace(/[  ]/g, ' ')
}

const percent = (value: number) => `${value} %`

export function buildReportLayout(s: ReportSnapshotV1): LayoutBlock[][] {
  const page1: LayoutBlock[] = [
    { kind: 'title', text: `Compte rendu — ${s.month.label}`, subtitle: `Clôturé le ${formatClosedAt(s.closedAt)}` },
    { kind: 'tiles', tiles: [
      { label: 'Revenus', value: formatPdfEuro(s.summary.income) },
      { label: 'Dépensé', value: formatPdfEuro(s.summary.spent) },
      { label: 'Épargné', value: formatPdfEuro(s.summary.saved) },
      { label: 'Reste', value: formatPdfEuro(s.summary.remaining) },
    ] },
    { kind: 'heading', text: 'Règle 50/30/20' },
    {
      kind: 'table',
      columns: [
        { header: 'Poste', width: 0.5, align: 'left' },
        { header: 'Réel', width: 0.25, align: 'right' },
        { header: 'Cible', width: 0.25, align: 'right' },
      ],
      rows: [
        { cells: ['Besoins', percent(s.rule503020.actuals.besoins), percent(s.rule503020.targets.besoins)] },
        { cells: ['Envies', percent(s.rule503020.actuals.envies), percent(s.rule503020.targets.envies)] },
        { cells: ['Épargne', percent(s.rule503020.actuals.epargne), percent(s.rule503020.targets.epargne)] },
      ],
    },
    { kind: 'heading', text: 'Entrées' },
    s.incomes.length === 0
      ? { kind: 'note', text: 'Aucune entrée ce mois-ci.' }
      : {
          kind: 'table',
          columns: [
            { header: 'Date', width: 0.12, align: 'left' },
            { header: 'Libellé', width: 0.4, align: 'left' },
            { header: 'Type', width: 0.28, align: 'left' },
            { header: 'Montant', width: 0.2, align: 'right' },
          ],
          rows: s.incomes.map((income) => ({
            cells: [
              formatPdfDate(income.date),
              income.targetEnvelopeName ? `${income.label} → ${income.targetEnvelopeName}` : income.label,
              `${income.typeEmoji} ${income.typeName}`,
              formatPdfEuro(income.amount),
            ],
          })),
        },
    { kind: 'heading', text: 'Enveloppes' },
    {
      kind: 'table',
      columns: [
        { header: 'Enveloppe', width: 0.26, align: 'left' },
        { header: 'Plafond', width: 0.16, align: 'right' },
        { header: 'Dépensé', width: 0.16, align: 'right' },
        { header: 'Reliquat', width: 0.16, align: 'right' },
        { header: 'Destination', width: 0.26, align: 'left' },
      ],
      rows: s.envelopes.map((envelope) => ({
        cells: [
          `${envelope.emoji} ${envelope.name}`,
          formatPdfEuro(envelope.ceiling),
          formatPdfEuro(envelope.netSpent),
          formatPdfEuro(envelope.leftover),
          envelope.destinationLabel ?? '—',
        ],
        ...(envelope.leftover < 0 ? { tone: 'warn' as const } : {}),
      })),
    },
  ]

  // Expenses grouped by category, in order of first appearance, each group followed by
  // its subtotal.
  const groups = new Map<string, { emoji: string, rows: ReportSnapshotV1['expenses'] }>()
  for (const expense of s.expenses) {
    const group = groups.get(expense.categoryName) ?? { emoji: expense.categoryEmoji, rows: [] }
    group.rows.push(expense)
    groups.set(expense.categoryName, group)
  }
  const expenseRows = [...groups].flatMap(([name, group]) => [
    ...group.rows.map((expense) => ({
      cells: [formatPdfDate(expense.date), expense.label, expense.envelopeName ?? '—', formatPdfEuro(expense.amount)],
    })),
    {
      cells: ['', `${group.emoji} ${name}`, '', formatPdfEuro(group.rows.reduce((total, e) => total + e.amount, 0))],
      tone: 'strong' as const,
    },
  ])

  const page2: LayoutBlock[] = [
    { kind: 'heading', text: 'Sorties' },
    s.expenses.length === 0
      ? { kind: 'note', text: 'Aucune sortie ce mois-ci.' }
      : {
          kind: 'table',
          columns: [
            { header: 'Date', width: 0.12, align: 'left' },
            { header: 'Libellé', width: 0.44, align: 'left' },
            { header: 'Enveloppe', width: 0.24, align: 'left' },
            { header: 'Montant', width: 0.2, align: 'right' },
          ],
          rows: expenseRows,
        },
    { kind: 'heading', text: 'Transferts' },
    s.transfers.length === 0
      ? { kind: 'note', text: 'Aucun transfert ce mois-ci.' }
      : {
          kind: 'table',
          columns: [
            { header: 'Date', width: 0.12, align: 'left' },
            { header: 'De → vers', width: 0.44, align: 'left' },
            { header: 'Motif', width: 0.24, align: 'left' },
            { header: 'Montant', width: 0.2, align: 'right' },
          ],
          rows: s.transfers.map((transfer) => ({
            cells: [formatPdfDate(transfer.date), `${transfer.fromName} → ${transfer.toName}`, transfer.reason ?? '—', formatPdfEuro(transfer.amount)],
          })),
        },
    { kind: 'heading', text: 'Épargne' },
    {
      kind: 'table',
      columns: [
        { header: 'Poche', width: 0.4, align: 'left' },
        { header: 'Versé', width: 0.2, align: 'right' },
        { header: 'Reliquats', width: 0.2, align: 'right' },
        { header: 'Total', width: 0.2, align: 'right' },
      ],
      rows: s.savings.map((goal) => ({
        cells: [goal.goalName, formatPdfEuro(goal.manual), formatPdfEuro(goal.fromClosure), formatPdfEuro(goal.manual + goal.fromClosure)],
      })),
    },
    { kind: 'heading', text: 'Synthèse de clôture' },
    {
      kind: 'table',
      columns: [
        { header: 'Poste', width: 0.7, align: 'left' },
        { header: 'Montant', width: 0.3, align: 'right' },
      ],
      rows: [
        { cells: ['Reporté sur le mois suivant', formatPdfEuro(s.closure.carriedOver)] },
        { cells: ["Versé à l'épargne", formatPdfEuro(s.closure.toSavings)] },
        { cells: ["Vers d'autres enveloppes", formatPdfEuro(s.closure.toOtherEnvelopes)] },
        { cells: ['Dépassements déduits', formatPdfEuro(s.closure.overspendDeducted)] },
      ],
    },
  ]

  return [page1, page2]
}
```

- [ ] **Step 5: Implement the renderer**

`server/utils/reportPdf.ts`:
```ts
import { createPdfDocument, pdfToBuffer } from './pdfDocument'
import type { ReportFonts } from './pdfDocument'
import { buildReportLayout } from './reportLayout'
import type { LayoutBlock } from './reportLayout'
import type { ReportSnapshotV1 } from './domain/reportSnapshot'

// The app's tokens (app/assets/css/main.css), with the translucent inks flattened onto
// white because PDF text has no alpha blending worth relying on.
const COLORS = {
  ink: '#3a3450',
  muted: '#716d81',
  faint: '#bab8c2',
  appBg: '#f7f4fb',
  divider: '#f1eef6',
  warnInk: '#b4553a',
}

const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = 595.28 - 2 * MARGIN
const ROW_HEIGHT = 18

type Doc = PDFKit.PDFDocument

function hasRoomFor(doc: Doc, height: number) {
  return doc.y + height <= PAGE_HEIGHT - MARGIN
}

function drawTable(doc: Doc, block: Extract<LayoutBlock, { kind: 'table' }>) {
  const drawRow = (cells: string[], font: string, color: string, size: number) => {
    const top = doc.y
    let x = MARGIN
    cells.forEach((cell, index) => {
      const column = block.columns[index]
      const width = column.width * CONTENT_WIDTH
      doc.font(font).fontSize(size).fillColor(color)
        .text(cell, x + 4, top + 4, { width: width - 8, height: ROW_HEIGHT - 4, align: column.align, ellipsis: true })
      x += width
    })
    doc.y = top + ROW_HEIGHT
  }
  const divider = () => {
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).lineWidth(0.6).strokeColor(COLORS.divider).stroke()
  }
  const header = () => {
    drawRow(block.columns.map((column) => column.header.toUpperCase()), 'bold', COLORS.faint, 7.5)
    divider()
  }

  if (!hasRoomFor(doc, ROW_HEIGHT * 2)) doc.addPage()
  header()
  for (const row of block.rows) {
    // A long list continues on a new page with its header repeated; it is never cut.
    if (!hasRoomFor(doc, ROW_HEIGHT)) {
      doc.addPage()
      header()
    }
    drawRow(row.cells, row.tone === 'strong' ? 'extrabold' : 'semibold', row.tone === 'warn' ? COLORS.warnInk : COLORS.ink, 9)
    divider()
  }
  doc.y += 12
}

function drawBlock(doc: Doc, block: LayoutBlock) {
  switch (block.kind) {
    case 'title':
      doc.font('extrabold').fontSize(20).fillColor(COLORS.ink).text(block.text, MARGIN, doc.y)
      doc.font('semibold').fontSize(10).fillColor(COLORS.muted).text(block.subtitle, MARGIN)
      doc.y += 14
      break
    case 'tiles': {
      const gap = 10
      const width = (CONTENT_WIDTH - gap * (block.tiles.length - 1)) / block.tiles.length
      const top = doc.y
      block.tiles.forEach((tile, index) => {
        const x = MARGIN + index * (width + gap)
        doc.roundedRect(x, top, width, 56, 10).fill(COLORS.appBg)
        doc.font('semibold').fontSize(8.5).fillColor(COLORS.faint).text(tile.label, x + 10, top + 10, { width: width - 20 })
        doc.font('extrabold').fontSize(14).fillColor(COLORS.ink).text(tile.value, x + 10, top + 26, { width: width - 20 })
      })
      doc.x = MARGIN
      doc.y = top + 56 + 16
      break
    }
    case 'heading':
      // Keep a heading with at least its table's header and first row.
      if (!hasRoomFor(doc, 24 + ROW_HEIGHT * 2)) doc.addPage()
      doc.font('extrabold').fontSize(12).fillColor(COLORS.ink).text(block.text, MARGIN, doc.y)
      doc.y += 6
      break
    case 'note':
      doc.font('semibold').fontSize(9.5).fillColor(COLORS.faint).text(block.text, MARGIN, doc.y)
      doc.y += 12
      break
    case 'table':
      drawTable(doc, block)
      break
  }
}

export async function renderReportPdf(
  snapshot: ReportSnapshotV1,
  fonts: ReportFonts,
  options: { compress?: boolean } = {},
): Promise<Buffer> {
  const doc = createPdfDocument(fonts, { compress: options.compress, title: `Compte rendu — ${snapshot.month.label}` })
  buildReportLayout(snapshot).forEach((blocks, index) => {
    if (index > 0) doc.addPage()
    for (const block of blocks) drawBlock(doc, block)
  })
  return pdfToBuffer(doc)
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/utils/reportLayout.test.ts tests/unit/server/utils/reportPdf.test.ts`
Expected: PASS. If the two-page test produces 3 pages, the fixture overflows page 1 — reduce font sizes or spacing in the renderer, never the fixture.

- [ ] **Step 7: Add the route**

`server/api/reports/[year]/[month].get.ts`:
```ts
import { createError } from 'h3'
import { requireUser } from '../../../utils/auth'
import { fetchReportSnapshot } from '../../../utils/closureQuery'
import { loadReportFonts } from '../../../utils/pdfFonts'
import { renderReportPdf } from '../../../utils/reportPdf'
import { reportParamsSchema } from '../../../../shared/schemas/closure'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const params = reportParamsSchema.safeParse(getRouterParams(event))
  if (!params.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid month' })
  }
  const { year, month } = params.data

  const snapshot = await fetchReportSnapshot(event, { year, month })
  if (!snapshot) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }
  if (snapshot.version !== 1) {
    console.error(`[reports] unsupported snapshot version ${snapshot.version} for ${year}-${month}`)
    throw createError({ statusCode: 500, statusMessage: 'Unsupported report version' })
  }

  let pdf: Buffer
  try {
    pdf = await renderReportPdf(snapshot, await loadReportFonts())
  }
  catch (error) {
    console.error(`[reports] PDF generation failed for ${year}-${month}:`, error)
    throw createError({ statusCode: 500, statusMessage: 'PDF generation failed' })
  }

  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="budget-${year}-${String(month).padStart(2, '0')}.pdf"`,
    'Cache-Control': 'private, no-store',
  })
  return pdf
})
```

- [ ] **Step 8: Run the whole unit suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add server/utils/reportLayout.ts server/utils/reportPdf.ts "server/api/reports" tests/unit
git commit -m "feat: render the archived month report to PDF"
```

---

### Task 9: The `/compte-rendu` page

**Files:**
- Create: `app/pages/compte-rendu.vue`
- Test: `tests/e2e/compte-rendu.spec.ts`

**Interfaces:**
- Consumes: `GET /api/closure` (`ClosurePagePayload`, Task 7), `POST /api/closure`, `GET /api/reports/:year/:month`, `apiErrorMessage` (Task 6), `PageHeader`, `PillSelector`, `UModal`, `formatEuro`, `formatEuroShort`.
- Produces: the page; `data-testid` hooks `tile-carried`, `tile-savings`, `tile-other`, `tile-unassigned`, `row-<envelopeId>`, `goal-select-<envelopeId>`, `target-select-<envelopeId>`.

- [ ] **Step 1: Write the failing E2E**

`tests/e2e/compte-rendu.spec.ts`:
```ts
import { test, expect, type Page } from '@playwright/test'

// ⚠️ A closure is irreversible and this suite runs on the LIVE database. No test here may
// click "Confirmer la clôture" or POST a valid closure. Every interaction stops at the
// confirmation modal and cancels.

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

async function openCompteRendu(page: Page) {
  await page.goto('/compte-rendu')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
  await page.waitForFunction(
    () => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__),
    undefined,
    { timeout: 20_000 },
  )
}

test('the status endpoint and the page agree on the closable month', async ({ page }) => {
  const status = await (await page.request.get('/api/closure/status')).json()
  const closure = await (await page.request.get('/api/closure')).json()
  expect(status.closableMonth?.month ?? null).toBe(closure.closable?.month ?? null)
  expect(status.closableMonth?.year ?? null).toBe(closure.closable?.year ?? null)
})

test('refuses a malformed closure and a month that is not closable, writing nothing', async ({ page }) => {
  const before = await (await page.request.get('/api/closure')).json()

  const malformed = await page.request.post('/api/closure', { data: { year: 2026, month: 13, decisions: [] } })
  expect(malformed.status()).toBe(400)

  // 2099 can never be the closable month, so this is refused before any write.
  const wrongMonth = await page.request.post('/api/closure', { data: { year: 2099, month: 1, decisions: [] } })
  expect(wrongMonth.status()).toBe(409)

  const after = await (await page.request.get('/api/closure')).json()
  expect(after.closable).toEqual(before.closable)
  expect(after.archives).toEqual(before.archives)
})

test('distributes leftovers up to the confirmation, then cancels without writing', async ({ page }) => {
  const before = await (await page.request.get('/api/closure')).json()
  await openCompteRendu(page)

  // Whether a month is closable depends on the real calendar and the real closures. Both
  // states are asserted; neither is skipped.
  if (!before.closable) {
    await expect(page.getByText('Rien à clôturer.')).toBeVisible()
    await expect(page.getByText(`Prochaine clôture possible le ${before.nextOpening.label}.`)).toBeVisible()
    return
  }

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Clôture de ${before.closable.label.toLowerCase()}`)
  const closeButton = page.getByRole('button', { name: `Clôturer et ouvrir ${before.closable.nextMonthName}` })
  const positive = before.envelopes.filter((e: any) => e.leftover > 0)

  if (positive.length > 0) {
    await expect(closeButton).toBeDisabled()
    await expect(page.getByTestId('tile-unassigned')).not.toHaveText('0 €')
    await page.getByRole('button', { name: 'Tout reporter' }).click()
  }
  // toHaveText, not toContainText: "260 €" contains "0 €".
  await expect(page.getByTestId('tile-unassigned')).toHaveText('0 €')
  await expect(closeButton).toBeEnabled()

  await closeButton.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Cette clôture est définitive')
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialog).toBeHidden()

  const after = await (await page.request.get('/api/closure')).json()
  expect(after.closable).toEqual(before.closable)
  expect(after.archives).toEqual(before.archives)
})

test('choosing Épargne reveals the poche selector, pre-filled', async ({ page }) => {
  const before = await (await page.request.get('/api/closure')).json()
  const first = before.closable ? before.envelopes.find((e: any) => e.leftover > 0) : null
  await openCompteRendu(page)
  if (!first) {
    // Nothing to distribute: no row may offer a destination choice.
    await expect(page.getByRole('button', { name: 'Reporter', exact: true })).toHaveCount(0)
    return
  }

  const row = page.getByTestId(`row-${first.id}`)
  await row.getByRole('button', { name: 'Épargne' }).click()
  await expect(page.getByTestId(`goal-select-${first.id}`)).toHaveValue(before.defaultSavingsGoalId)

  await row.getByRole('button', { name: 'Enveloppe' }).click()
  await expect(page.getByTestId(`target-select-${first.id}`)).toBeVisible()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/compte-rendu.spec.ts`
Expected: FAIL — `/compte-rendu` still 404s (no `h1`).

- [ ] **Step 3: Implement the page**

`app/pages/compte-rendu.vue`:
```vue
<script setup lang="ts">
type Destination = 'carry_over' | 'savings' | 'envelope'

interface ClosureEnvelope { id: string, name: string, emoji: string, ceiling: number, netSpent: number, leftover: number }
interface ClosurePagePayload {
  closable: { year: number, month: number, label: string, nextMonthName: string } | null
  nextOpening: { year: number, month: number, label: string } | null
  envelopes: ClosureEnvelope[]
  summary: { income: number, spent: number, saved: number, remaining: number } | null
  rule503020: {
    targets: { besoins: number, envies: number, epargne: number }
    actuals: { besoins: number, envies: number, epargne: number }
  } | null
  savingsGoals: { id: string, name: string, receivesSalaryVariance: boolean }[]
  defaultSavingsGoalId: string | null
  archives: { year: number, month: number, label: string, generatedAt: string }[]
}
interface Choice { destination: Destination | null, savingsGoalId: string | null, targetEnvelopeId: string | null }

const { data: closure, error, refresh } = await useFetch<ClosurePagePayload>('/api/closure', { key: 'closure' })

const isHydrated = ref(false)
onMounted(() => {
  isHydrated.value = true
})

const destinationOptions = [
  { value: 'carry_over', label: 'Reporter' },
  { value: 'savings', label: 'Épargne' },
  { value: 'envelope', label: 'Enveloppe' },
]

// Choices live only in the page: there is deliberately no persisted draft (spec §2).
const choices = ref<Record<string, Choice>>({})
watch(() => closure.value?.envelopes, (envelopes) => {
  choices.value = Object.fromEntries((envelopes ?? [])
    .filter((envelope) => envelope.leftover > 0)
    .map((envelope) => [envelope.id, { destination: null, savingsGoalId: null, targetEnvelopeId: null }]))
}, { immediate: true })

const positive = computed(() => (closure.value?.envelopes ?? []).filter((e) => e.leftover > 0))
const toDistribute = computed(() => positive.value.reduce((total, e) => total + e.leftover, 0))

function isComplete(choice: Choice | undefined) {
  if (!choice?.destination) return false
  if (choice.destination === 'savings') return Boolean(choice.savingsGoalId)
  if (choice.destination === 'envelope') return Boolean(choice.targetEnvelopeId)
  return true
}

function setDestination(envelopeId: string, value: string) {
  const choice = choices.value[envelopeId]
  choice.destination = value as Destination
  if (value === 'savings' && !choice.savingsGoalId) choice.savingsGoalId = closure.value?.defaultSavingsGoalId ?? null
}

function applyToAll(destination: 'carry_over' | 'savings') {
  for (const envelope of positive.value) {
    choices.value[envelope.id] = {
      destination,
      savingsGoalId: destination === 'savings' ? closure.value?.defaultSavingsGoalId ?? null : null,
      targetEnvelopeId: null,
    }
  }
}

const tiles = computed(() => {
  const totals = { carried: 0, savings: 0, other: 0, unassigned: 0 }
  for (const envelope of positive.value) {
    const choice = choices.value[envelope.id]
    if (!isComplete(choice)) totals.unassigned += envelope.leftover
    else if (choice.destination === 'carry_over') totals.carried += envelope.leftover
    else if (choice.destination === 'savings') totals.savings += envelope.leftover
    else totals.other += envelope.leftover
  }
  return totals
})

const isSubmitting = ref(false)
const canClose = computed(() => isHydrated.value && !isSubmitting.value
  && positive.value.every((envelope) => isComplete(choices.value[envelope.id])))

const envelopeName = (id: string | null) => closure.value?.envelopes.find((e) => e.id === id)?.name ?? ''
const goalName = (id: string | null) => closure.value?.savingsGoals.find((g) => g.id === id)?.name ?? ''

const recap = computed(() => positive.value.map((envelope) => {
  const choice = choices.value[envelope.id]
  const destination = choice.destination === 'carry_over'
    ? `reporté sur ${closure.value?.closable?.nextMonthName}`
    : choice.destination === 'savings' ? `vers ${goalName(choice.savingsGoalId)}` : `vers ${envelopeName(choice.targetEnvelopeId)}`
  return { id: envelope.id, label: `${envelope.emoji} ${envelope.name}`, amount: envelope.leftover, destination }
}))
const overspent = computed(() => (closure.value?.envelopes ?? []).filter((e) => e.leftover < 0))

const isConfirmOpen = ref(false)
const submitError = ref('')

async function confirmClosure() {
  const closable = closure.value?.closable
  if (!closable || isSubmitting.value) return
  submitError.value = ''
  isSubmitting.value = true
  try {
    await $fetch('/api/closure', {
      method: 'POST',
      body: {
        year: closable.year,
        month: closable.month,
        decisions: positive.value.map((envelope) => ({ envelopeId: envelope.id, ...choices.value[envelope.id] })),
      },
    })
    isConfirmOpen.value = false
    await refresh()
  }
  catch (e) {
    submitError.value = apiErrorMessage(e) ?? 'Impossible de clôturer ce mois. Réessayez dans un instant.'
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader :title="closure?.closable ? `Clôture de ${closure.closable.label.toLowerCase()}` : 'Compte rendu'">
      <template #context>
        <span v-if="closure?.closable" class="rounded-full bg-app-bg px-3 py-1 text-[12.5px] font-semibold text-ink-muted">
          {{ formatEuroShort(toDistribute) }} de reliquats à répartir
        </span>
      </template>
      <template v-if="closure?.closable" #actions>
        <button type="button" disabled class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink disabled:opacity-50">
          Télécharger le PDF
        </button>
        <button
          type="button"
          :disabled="!canClose"
          class="rounded-[12px] bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-ink disabled:opacity-50"
          @click="isConfirmOpen = true"
        >
          Clôturer et ouvrir {{ closure.closable.nextMonthName }}
        </button>
      </template>
    </PageHeader>

    <p v-if="error" class="rounded-[14px] border border-warn-bg bg-warn-bg p-4 text-[13px] font-semibold text-warn-ink">
      Impossible de charger le compte rendu. Réessayez dans un instant.
    </p>

    <div v-else-if="closure" class="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <div class="flex flex-col gap-4">
        <section v-if="!closure.closable" class="rounded-[18px] border border-divider bg-white p-5">
          <p class="text-[13.5px] font-extrabold text-ink">Rien à clôturer.</p>
          <p v-if="closure.nextOpening" class="pt-1 text-[12.5px] font-semibold text-ink-faint">
            Prochaine clôture possible le {{ closure.nextOpening.label }}.
          </p>
        </section>

        <section v-else class="rounded-[18px] border border-divider bg-white p-5">
          <header class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-[13.5px] font-extrabold text-ink">Répartition des reliquats</h2>
            <div class="flex gap-2">
              <button type="button" :disabled="!isHydrated || positive.length === 0" class="rounded-full bg-app-bg px-3 py-1.5 text-[12px] font-semibold text-ink-muted disabled:opacity-50" @click="applyToAll('carry_over')">
                Tout reporter
              </button>
              <button type="button" :disabled="!isHydrated || positive.length === 0 || !closure.defaultSavingsGoalId" class="rounded-full bg-app-bg px-3 py-1.5 text-[12px] font-semibold text-ink-muted disabled:opacity-50" @click="applyToAll('savings')">
                Tout épargner
              </button>
            </div>
          </header>
          <p class="pt-1 text-[12px] font-semibold text-ink-faint">
            Chaque reliquat positif part vers une destination. Un dépassement est déduit automatiquement du plafond de {{ closure.closable.nextMonthName }}.
          </p>

          <div class="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-4">
            <div class="rounded-[14px] bg-app-bg p-3" data-testid="tile-carried">
              <p class="text-[11px] font-semibold text-ink-faint">Reporté sur {{ closure.closable.nextMonthName }}</p>
              <p class="pt-1 text-[17px] font-extrabold text-ink">{{ formatEuroShort(tiles.carried) }}</p>
            </div>
            <div class="rounded-[14px] bg-app-bg p-3" data-testid="tile-savings">
              <p class="text-[11px] font-semibold text-ink-faint">Vers l'épargne</p>
              <p class="pt-1 text-[17px] font-extrabold text-ink">{{ formatEuroShort(tiles.savings) }}</p>
            </div>
            <div class="rounded-[14px] bg-app-bg p-3" data-testid="tile-other">
              <p class="text-[11px] font-semibold text-ink-faint">Autre enveloppe</p>
              <p class="pt-1 text-[17px] font-extrabold text-ink">{{ formatEuroShort(tiles.other) }}</p>
            </div>
            <div class="rounded-[14px] p-3" :class="tiles.unassigned > 0 ? 'bg-warn-bg' : 'bg-app-bg'">
              <p class="text-[11px] font-semibold text-ink-faint">Non réparti</p>
              <p class="pt-1 text-[17px] font-extrabold" :class="tiles.unassigned > 0 ? 'text-warn-ink' : 'text-ink'" data-testid="tile-unassigned">{{ formatEuroShort(tiles.unassigned) }}</p>
            </div>
          </div>

          <table class="mt-4 w-full text-left">
            <thead>
              <tr class="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
                <th class="py-2">Enveloppe</th>
                <th class="py-2 text-right">Reliquat</th>
                <th class="py-2 pl-4">Destination</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="envelope in closure.envelopes"
                :key="envelope.id"
                :data-testid="`row-${envelope.id}`"
                class="border-t border-divider align-top"
                :class="envelope.leftover < 0 ? 'bg-warn-bg' : ''"
              >
                <td class="py-3 text-[12.5px] font-bold text-ink">{{ envelope.emoji }} {{ envelope.name }}</td>
                <td class="py-3 text-right text-[12.5px] font-extrabold" :class="envelope.leftover < 0 ? 'text-warn-ink' : 'text-ink'">
                  {{ formatEuro(envelope.leftover) }}
                </td>
                <td class="py-3 pl-4">
                  <p v-if="envelope.leftover < 0" class="text-[12px] font-semibold text-warn-ink">
                    {{ formatEuro(envelope.leftover) }} déduits du plafond de {{ closure.closable.nextMonthName }}
                  </p>
                  <p v-else-if="envelope.leftover === 0" class="text-[12px] font-semibold text-ink-faint">Rien à répartir</p>
                  <div v-else class="flex flex-col gap-2">
                    <PillSelector
                      :options="destinationOptions"
                      :model-value="choices[envelope.id]?.destination ?? null"
                      @update:model-value="setDestination(envelope.id, $event)"
                    />
                    <select
                      v-if="choices[envelope.id]?.destination === 'savings'"
                      v-model="choices[envelope.id].savingsGoalId"
                      :data-testid="`goal-select-${envelope.id}`"
                      class="rounded-[10px] bg-app-bg px-3 py-1.5 text-[12px] font-semibold text-ink"
                    >
                      <option v-for="goal in closure.savingsGoals" :key="goal.id" :value="goal.id">{{ goal.name }}</option>
                    </select>
                    <select
                      v-if="choices[envelope.id]?.destination === 'envelope'"
                      v-model="choices[envelope.id].targetEnvelopeId"
                      :data-testid="`target-select-${envelope.id}`"
                      class="rounded-[10px] bg-app-bg px-3 py-1.5 text-[12px] font-semibold text-ink"
                    >
                      <option :value="null" disabled>Choisir une enveloppe</option>
                      <option v-for="target in closure.envelopes.filter((e) => e.id !== envelope.id)" :key="target.id" :value="target.id">
                        {{ target.emoji }} {{ target.name }}
                      </option>
                    </select>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div class="flex flex-col gap-4">
        <section v-if="closure.summary && closure.rule503020" class="rounded-[18px] border border-divider bg-white p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Résumé du mois</h2>
          <dl class="grid grid-cols-2 gap-y-2 pt-3 text-[12.5px]">
            <dt class="font-semibold text-ink-muted">Revenus</dt><dd class="text-right font-extrabold text-ink">{{ formatEuro(closure.summary.income) }}</dd>
            <dt class="font-semibold text-ink-muted">Dépensé</dt><dd class="text-right font-extrabold text-ink">{{ formatEuro(closure.summary.spent) }}</dd>
            <dt class="font-semibold text-ink-muted">Épargné</dt><dd class="text-right font-extrabold text-ink">{{ formatEuro(closure.summary.saved) }}</dd>
          </dl>
          <p class="pt-3 text-[11.5px] font-semibold text-ink-faint">
            50/30/20 : {{ closure.rule503020.actuals.besoins }} / {{ closure.rule503020.actuals.envies }} / {{ closure.rule503020.actuals.epargne }}
            (cible {{ closure.rule503020.targets.besoins }} / {{ closure.rule503020.targets.envies }} / {{ closure.rule503020.targets.epargne }})
          </p>
        </section>

        <section class="rounded-[18px] border border-divider bg-white p-5">
          <h2 class="text-[13.5px] font-extrabold text-ink">Archives</h2>
          <p v-if="closure.archives.length === 0" class="pt-2 text-[12px] font-semibold text-ink-faint">Aucun mois clôturé pour l'instant.</p>
          <ul v-else class="pt-2">
            <li v-for="archive in closure.archives" :key="`${archive.year}-${archive.month}`" class="flex items-center justify-between border-t border-divider py-2 first:border-t-0">
              <span class="text-[12.5px] font-bold text-ink">{{ archive.label }}</span>
              <a :href="`/api/reports/${archive.year}/${archive.month}`" download class="text-[12px] font-bold text-ink underline">PDF</a>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <UModal v-model:open="isConfirmOpen" title="Confirmer la clôture">
      <template #body>
        <ul class="flex flex-col gap-1 text-[12.5px]">
          <li v-for="line in recap" :key="line.id" class="flex justify-between gap-4">
            <span class="font-semibold text-ink">{{ line.label }} — {{ line.destination }}</span>
            <span class="font-extrabold text-ink">{{ formatEuro(line.amount) }}</span>
          </li>
          <li v-for="envelope in overspent" :key="envelope.id" class="flex justify-between gap-4 text-warn-ink">
            <span class="font-semibold">{{ envelope.emoji }} {{ envelope.name }} — déduit en {{ closure?.closable?.nextMonthName }}</span>
            <span class="font-extrabold">{{ formatEuro(envelope.leftover) }}</span>
          </li>
        </ul>
        <p class="pt-4 text-[12.5px] font-semibold text-ink-muted">
          Cette clôture est définitive : {{ closure?.closable?.label.toLowerCase().split(' ')[0] }} ne pourra plus recevoir de mouvements.
        </p>
        <p v-if="submitError" class="mt-3 rounded-[12px] bg-warn-bg p-3 text-[12px] font-semibold text-warn-ink">{{ submitError }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button type="button" class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink" @click="isConfirmOpen = false">
            Annuler
          </button>
          <button type="button" :disabled="isSubmitting" class="rounded-[12px] bg-ink px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" @click="confirmClosure">
            Confirmer la clôture
          </button>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 4: Run the E2E to verify it passes**

Run: `npx playwright test tests/e2e/compte-rendu.spec.ts`
Expected: PASS (4 tests). Then confirm nothing was written: `GET /api/closure` still shows September as closable and `archives` empty.

- [ ] **Step 5: Look at it**

Run `npm run dev`, open `/compte-rendu`, and check against the desktop redesign §4.7: header, four tiles, table, right column, modal. Then click "Tout épargner", open the modal, and **cancel**.

- [ ] **Step 6: Commit**

```bash
git add app/pages/compte-rendu.vue tests/e2e/compte-rendu.spec.ts
git commit -m "feat: build the Compte rendu page"
```

---

### Task 10: Entry points — dashboard button and the Épargne closure row

**Files:**
- Modify: `app/pages/index.vue` (header actions)
- Modify: `server/utils/domain/savings.ts:15-20,105-139`, `server/utils/epargneQuery.ts:21,91-96,123`
- Test: `tests/unit/server/utils/domain/savings.test.ts`, `tests/unit/server/utils/epargneQuery.test.ts`, `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `GET /api/closure/status` (`ClosureStatusPayload`, Task 7); `savings_entries.source` (Task 2).
- Produces: `ContributionRow.kind` gains `'closure'`; `monthContributions` entries accept an optional `source: 'manual' | 'closure'` (absent = manual).

- [ ] **Step 1: Write the failing tests**

Append to the `monthContributions` describe in `tests/unit/server/utils/domain/savings.test.ts`:
```ts
  it('lists closure leftovers as their own row, apart from the manual versement', () => {
    const rows = monthContributions({
      entries: [
        { savingsGoalId: 'a', amount: 345, source: 'manual' },
        { savingsGoalId: 'a', amount: 26, source: 'closure' },
        { savingsGoalId: 'b', amount: 10, source: 'closure' },
      ],
      poches: [],
      salaryVariance: 0,
    })
    expect(rows).toEqual([
      { kind: 'contribution', label: 'Versement du mois', detail: 'réparti sur les poches', amount: 345 },
      { kind: 'closure', label: 'Reliquats de clôture', detail: "reliquats d'enveloppes du mois", amount: 36 },
    ])
  })
```
Append to `tests/unit/server/utils/epargneQuery.test.ts`:
```ts
  it('separates closure entries from manual ones in the month contributions', async () => {
    mocks.responseByTable.savings_entries = {
      data: [
        { savings_goal_id: 'a', year: 2026, month: 10, amount: '100.00', source: 'manual' },
        { savings_goal_id: 'a', year: 2026, month: 10, amount: '26.00', source: 'closure' },
      ],
      error: null,
    }
    const payload = await fetchEpargne(fakeEvent(), 2026, 10, 6)
    expect(payload.contributions.map((row) => [row.kind, row.amount])).toEqual([['contribution', 100], ['closure', 26]])
  })
```
Append to `tests/e2e/dashboard.spec.ts`:
```ts
test('offers the month closure only while a month is closable', async ({ page }) => {
  const status = await (await page.request.get('/api/closure/status')).json()
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })
  const link = page.getByRole('link', { name: /^Clôturer / })
  if (status.closableMonth) {
    await expect(link).toHaveText(`Clôturer ${status.closableMonth.name}`)
    await expect(link).toHaveAttribute('href', '/compte-rendu')
  }
  else {
    await expect(link).toHaveCount(0)
  }
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/server/utils/domain/savings.test.ts tests/unit/server/utils/epargneQuery.test.ts`
Expected: FAIL — closure entries are folded into "Versement du mois".

- [ ] **Step 3: Implement**

`server/utils/domain/savings.ts`: `ContributionRow.kind` becomes `'contribution' | 'variance' | 'closure'`; `monthContributions`'s `entries` type becomes `{ savingsGoalId: string, amount: number, source?: 'manual' | 'closure' }[]`, and its first block becomes:
```ts
  // Closure leftovers are reported apart: they are not a versement the household made.
  const isClosure = (entry: { source?: 'manual' | 'closure' }) => entry.source === 'closure'

  const contributed = input.entries.filter((entry) => !isClosure(entry)).reduce((sum, entry) => sum + entry.amount, 0)
  if (contributed !== 0) {
    rows.push({ kind: 'contribution', label: 'Versement du mois', detail: 'réparti sur les poches', amount: contributed })
  }

  const fromClosure = input.entries.filter(isClosure).reduce((sum, entry) => sum + entry.amount, 0)
  if (fromClosure !== 0) {
    rows.push({ kind: 'closure', label: 'Reliquats de clôture', detail: "reliquats d'enveloppes du mois", amount: fromClosure })
  }
```
(the salary variance block stays after these).

`server/utils/epargneQuery.ts`: `ENTRIES_SELECT = 'savings_goal_id,year,month,amount,source'`, and the `allEntries` mapping adds `source: row.source ?? 'manual'`.

`app/pages/index.vue`, in `<script setup>` after the existing `useFetch` calls:
```ts
// Lazy and client-only: the closure button is secondary and must never hold up the
// dashboard's first render.
const { data: closureStatus } = useLazyFetch<{ closableMonth: { year: number, month: number, label: string, name: string } | null }>(
  '/api/closure/status',
  { key: 'closure-status', server: false },
)
```
and in the header's `#actions` slot, before "+ Nouvelle saisie":
```vue
        <NuxtLink
          v-if="closureStatus?.closableMonth"
          to="/compte-rendu"
          class="rounded-[12px] border border-divider bg-white px-4 py-2 text-[12.5px] font-bold text-ink"
        >
          Clôturer {{ closureStatus.closableMonth.name }}
        </NuxtLink>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npx playwright test tests/e2e/dashboard.spec.ts tests/e2e/epargne.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.vue server/utils/domain/savings.ts server/utils/epargneQuery.ts tests
git commit -m "feat: link the dashboard to the month closure and show closure leftovers on Épargne"
```

---

### Task 11: Release check, first real closure, and handoff

This task involves the human partner at three points. **Do not do any of them without asking.**

**Files:**
- Create: `tests/e2e/compte-rendu-closed.spec.ts`
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: Full verification**

Run: `npm test && npm run build && npm run test:e2e`
Expected: every suite green. Report the counts. If the E2E left `zz-e2e-` rows (from `epargne.spec.ts`), list them for manual cleanup as usual.

- [ ] **Step 2: Deploy — ask first**

Ask the human partner how to deploy: work goes directly onto `main`, so pushing `main` deploys production. Both migrations are already applied (Tasks 2 and 7) and are compatible with the old code, so the order is safe. After deploying, open `/compte-rendu` on the deployed site and check that it loads September.

- [ ] **Step 3: The first real closure — done by the household**

The household closes September 2026 on the deployed site. Afterwards, verify with read-only queries (`npx tsx -e` with postgres, as in Task 7 Step 7):
- `month_closures`: one row `2026/9`, `status = 'closed'`.
- `closure_envelope_decisions`: one row per positive leftover, matching the modal's recap.
- `monthly_envelope_allocations`: September rows for every budget envelope (frozen); October rows with the expected `carried_over_amount` / `overspend_deduction`.
- `savings_entries` with `source = 'closure'`: one per receiving poche, dated September.
- `monthly_reports`: one row, `snapshot->>'version' = '1'`.
Then in the app: `/enveloppes` for October shows the carry-overs and deductions; `/epargne` shows "Reliquats de clôture" if anything went to savings; the PDF downloads from "Archives" and reads correctly; saving an expense dated in September shows "Septembre 2026 est clôturé. Affectez ce mouvement à un mois ouvert."

- [ ] **Step 4: Add the read-only E2E for a closed month**

`tests/e2e/compte-rendu-closed.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

// Read-only checks that need a real closed month. September 2026 was closed by the
// household on the live database; nothing here writes.

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

test('serves the archived September report as a PDF', async ({ page }) => {
  const response = await page.request.get('/api/reports/2026/9')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/pdf')
  expect(response.headers()['content-disposition']).toBe('attachment; filename="budget-2026-09.pdf"')
  const body = await response.body()
  expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-')
})

test('lists September in the archives', async ({ page }) => {
  const closure = await (await page.request.get('/api/closure')).json()
  expect(closure.archives).toContainEqual(expect.objectContaining({ year: 2026, month: 9, label: 'Septembre 2026' }))
})

test('answers 404 for a month that has no report', async ({ page }) => {
  expect((await page.request.get('/api/reports/2026/1')).status()).toBe(404)
})

test('refuses a movement assigned to the closed month', async ({ page }) => {
  // Rejected by the lock before any insert, so this writes nothing.
  const reference = await (await page.request.get('/api/entry-reference-data')).json()
  const response = await page.request.post('/api/incomes', {
    data: {
      incomeTypeId: reference.incomeTypes[0].id,
      label: 'zz-e2e-lock',
      amount: 1,
      dateReceived: '2026-09-15',
      monthAssigned: 9,
      yearAssigned: 2026,
    },
  })
  expect(response.status()).toBe(409)
  expect((await response.json()).data.message).toBe('Septembre 2026 est clôturé. Affectez ce mouvement à un mois ouvert.')
})
```
Check `GET /api/entry-reference-data`'s real shape first and adjust `reference.incomeTypes[0].id` to it.
Run: `npx playwright test tests/e2e/compte-rendu-closed.spec.ts` — Expected: 4 passing.

- [ ] **Step 5: Update the handoff**

In `docs/HANDOFF.md`:
- §3: `/compte-rendu` → **Done**, with the spec and plan paths, and the files worth knowing (`domain/closure.ts`, `domain/reportSnapshot.ts`, `closureQuery.ts`, `closureService.ts`, `reportLayout.ts`/`reportPdf.ts`, `0006_close_month.sql`).
- §4: add **"Closed months are frozen"**: every create endpoint calls `assertMonthOpen`; any new movement endpoint must too. Add **"`close_month` lives outside Drizzle"**: it is in a hand-written migration; changing what a closure writes means a new migration replacing the function.
- §5: the E2E never closes a month; `compte-rendu-closed.spec.ts` depends on September 2026 being closed.
- §6: next steps are the scheduled email (uses `monthly_reports.emailed_at`), then the page-load work and the mock-data cleanup already queued.
- Update the test counts.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/compte-rendu-closed.spec.ts docs/HANDOFF.md
git commit -m "docs: record the Compte rendu milestone and add read-only checks for a closed month"
```

---

## Notes for the executor

- **Nobody closes a month but the household.** Not in E2E, not in a smoke test, not "just to check the RPC". The first real closure is Task 11 Step 3, done by the human partner.
- **Two migrations touch the live database** (Tasks 2 and 7). Both are additive and safe for the code already in production, but each needs explicit confirmation before `npm run db:migrate`.
- **The spike in Task 1 can change the plan.** If `pdfkit` cannot run under the Nitro build, stop: Tasks 1 and 8 switch to `pdfmake`, and the layout module (`reportLayout.ts`) stays as it is.
- **`numeric` arrives as strings from PostgREST**, but as numbers from the domain functions. Keep every `Number()` in `closureQuery.ts`; add none in the page.
- **French in `statusMessage` disappears.** Use `userError()`; read it on the client with `apiErrorMessage()`.
- **Today (2026-10-13) September is closable**, so the page shows real leftovers during development. After the household closes it, `/compte-rendu` shows the empty state until 1 November — expected, not a regression.
