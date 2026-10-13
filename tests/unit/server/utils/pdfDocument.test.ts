import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createPdfDocument, pdfToBuffer } from '../../../../server/pdf/pdfDocument'

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
