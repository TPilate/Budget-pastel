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
