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
