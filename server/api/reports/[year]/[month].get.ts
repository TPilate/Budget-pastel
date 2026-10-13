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
