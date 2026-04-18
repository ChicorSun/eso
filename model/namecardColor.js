import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

export const DEFAULT_PAGE_BG = '#f5f6fb'
const NAMECARD_DIR = path.join(process.cwd(), 'plugins', 'eso', 'resources', 'img', 'namecard')

function parseHexRgb (hex) {
  if (!hex || typeof hex !== 'string') return null
  let h = hex.trim()
  if (h.startsWith('#')) h = h.slice(1)
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16)
    }
  }
  if (h.length !== 6) return null
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function mixTowardWhite (r, g, b, t) {
  const rr = Math.round(r + (255 - r) * t)
  const gg = Math.round(g + (255 - g) * t)
  const bb = Math.round(b + (255 - b) * t)
  return { r: rr, g: gg, b: bb }
}

function rgbToHex ({ r, g, b }) {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * 由页面基准色派生 data_box 背景（更亮）
 */
export function deriveThemeFromPageBg (baseHex) {
  const rgb = parseHexRgb(baseHex) || parseHexRgb(DEFAULT_PAGE_BG)
  const { r, g, b } = rgb
  const dataRgb = mixTowardWhite(r, g, b, 0.42)
  return {
    pageBgColor: baseHex && parseHexRgb(baseHex) ? baseHex : DEFAULT_PAGE_BG,
    dataBoxBgColor: rgbToHex(dataRgb)
  }
}

function paeth (a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function unfilterRow (filterType, row, prev, bpp, length) {
  switch (filterType) {
    case 0:
      break
    case 1:
      for (let i = bpp; i < length; i++) row[i] = (row[i] + row[i - bpp]) & 255
      break
    case 2:
      for (let i = 0; i < length; i++) row[i] = (row[i] + prev[i]) & 255
      break
    case 3:
      for (let i = 0; i < length; i++) {
        const left = i < bpp ? 0 : row[i - bpp]
        const up = prev[i]
        row[i] = (row[i] + ((left + up) >> 1)) & 255
      }
      break
    case 4:
      for (let i = 0; i < length; i++) {
        const left = i < bpp ? 0 : row[i - bpp]
        const up = prev[i]
        const ul = i < bpp ? 0 : prev[i - bpp]
        row[i] = (row[i] + paeth(left, up, ul)) & 255
      }
      break
    default:
      return false
  }
  return true
}

export function getNamecardThemeByPic (picBasename) {
  const base = getNamecardPageBgColorByPic(picBasename)
  return deriveThemeFromPageBg(base)
}

/**
 * 从头图 PNG 提取基准色（不透明像素的 RGB 算术平均），失败返回默认页背景色
 * 支持 8 位 truecolor / truecolor+alpha（常见导出的 PNG）
 */
export function getNamecardPageBgColorByPic (picBasename) {
  if (!picBasename) return DEFAULT_PAGE_BG
  const filePath = path.join(NAMECARD_DIR, `${picBasename}.png`)
  try {
    if (!fs.existsSync(filePath)) return DEFAULT_PAGE_BG
    const buf = fs.readFileSync(filePath)
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return DEFAULT_PAGE_BG

    let pos = 8
    let width = 0
    let height = 0
    let bitDepth = 0
    let colorType = 0
    const idat = []

    while (pos + 8 <= buf.length) {
      const len = buf.readUInt32BE(pos)
      const type = buf.toString('ascii', pos + 4, pos + 8)
      const data = buf.subarray(pos + 8, pos + 8 + len)
      pos += 12 + len
      if (type === 'IHDR') {
        width = data.readUInt32BE(0)
        height = data.readUInt32BE(4)
        bitDepth = data[8]
        colorType = data[9]
      } else if (type === 'IDAT') {
        idat.push(data)
      } else if (type === 'IEND') {
        break
      }
    }

    if (!width || !height || bitDepth !== 8) return DEFAULT_PAGE_BG
    if (colorType !== 2 && colorType !== 6) return DEFAULT_PAGE_BG

    const bpp = colorType === 6 ? 4 : 3
    const stride = width * bpp
    const raw = zlib.inflateSync(Buffer.concat(idat))
    const expected = height * (1 + stride)
    if (raw.length < expected) return DEFAULT_PAGE_BG

    const prev = Buffer.alloc(stride)
    const row = Buffer.alloc(stride)
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let n = 0

    const stepY = height > 400 ? Math.ceil(height / 400) : 1
    const stepX = width > 400 ? Math.ceil(width / 400) : 1

    let offset = 0
    for (let y = 0; y < height; y++) {
      const filterType = raw[offset++]
      raw.copy(row, 0, offset, offset + stride)
      offset += stride
      if (!unfilterRow(filterType, row, prev, bpp, stride)) return DEFAULT_PAGE_BG
      prev.set(row)

      if (y % stepY !== 0) continue
      for (let x = 0; x < width; x += stepX) {
        const i = x * bpp
        const r = row[i]
        const g = row[i + 1]
        const b = row[i + 2]
        const a = colorType === 6 ? row[i + 3] : 255
        if (a < 16) continue
        sumR += r
        sumG += g
        sumB += b
        n++
      }
    }

    if (!n) return DEFAULT_PAGE_BG
    const r = Math.round(sumR / n)
    const g = Math.round(sumG / n)
    const b = Math.round(sumB / n)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  } catch {
    return DEFAULT_PAGE_BG
  }
}
