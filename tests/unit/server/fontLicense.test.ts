import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const FONTS = new URL('../../../server/assets/fonts/', import.meta.url)

describe('bundled report fonts', () => {
  it('ship with their SIL Open Font License', () => {
    // The OFL requires the license to travel with the font files.
    expect(readdirSync(FONTS).some((file) => file.startsWith('PlusJakartaSans-'))).toBe(true)
    const license = new URL('OFL.txt', FONTS)
    expect(existsSync(license)).toBe(true)
    const text = readFileSync(license, 'utf-8')
    expect(text).toContain('Plus Jakarta Sans Project Authors')
    expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1')
  })
})
