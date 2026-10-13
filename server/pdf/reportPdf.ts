import { createPdfDocument, pdfToBuffer } from './pdfDocument'
import type { ReportFonts } from './pdfDocument'
import { buildReportLayout } from '../utils/reportLayout'
import type { LayoutBlock } from '../utils/reportLayout'
import type { ReportSnapshotV1 } from '../utils/domain/reportSnapshot'

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
