import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderReportPdf } from '../../../../server/pdf/reportPdf'
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
