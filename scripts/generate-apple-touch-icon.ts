/**
 * 生成 public/apple-touch-icon.png（180×180 不透明 PNG，iOS 主屏图标要求）。
 *
 * 图形沿用 public/favicon.svg 的三条圆角柱，按 iOS 图标惯例铺在翡翠色
 * 不透明底上、内容约占 56%。无第三方依赖：4× 超采样后用 node:zlib 手工
 * 编码 PNG。重新生成：bun scripts/generate-apple-touch-icon.ts
 */
import { Buffer } from 'node:buffer'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const SIZE = 180
const SUPER_SAMPLE = 4

// favicon.svg 的三条柱：x, y, w, h（16 单位网格），圆角半径 1
const BARS: Array<[number, number, number, number]> = [
  [2, 9, 3, 5],
  [6.5, 5, 3, 9],
  [11, 2, 3, 12],
]
const MARK_RADIUS = 1

// 内容盒：边长 16 的网格居中映射到 SIZE 的 56%
const BOX = Math.round(SIZE * 0.56)
const SCALE = BOX / 16
const OFFSET = Math.round((SIZE - BOX) / 2)

// 翡翠色不透明底（emerald-700，比 emerald-600 在 iOS 主屏上更稳）+ 白色柱体
const BG: [number, number, number] = [4, 120, 87]
const FG: [number, number, number] = [255, 255, 255]

function insideRoundedRect(px: number, py: number, rect: [number, number, number, number]): boolean {
  const [x, y, w, h] = rect
  const r = MARK_RADIUS
  const qx = Math.min(Math.max(px, x + r), x + w - r)
  const qy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - qx
  const dy = py - qy
  return dx * dx + dy * dy <= r * r
}

function markAlpha(ssX: number, ssY: number): number {
  const mx = (ssX / SUPER_SAMPLE - OFFSET) / SCALE
  const my = (ssY / SUPER_SAMPLE - OFFSET) / SCALE
  return BARS.some(rect => insideRoundedRect(mx, my, rect)) ? 1 : 0
}

// 超采样画布 → 4×4 块均值下采样
const pixels = new Uint8Array(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let coverage = 0
    for (let sy = 0; sy < SUPER_SAMPLE; sy++) {
      for (let sx = 0; sx < SUPER_SAMPLE; sx++) {
        coverage += markAlpha(x * SUPER_SAMPLE + sx, y * SUPER_SAMPLE + sy)
      }
    }
    const ratio = coverage / (SUPER_SAMPLE * SUPER_SAMPLE)
    const index = (y * SIZE + x) * 4
    pixels[index] = Math.round(BG[0] * (1 - ratio) + FG[0] * ratio)
    pixels[index + 1] = Math.round(BG[1] * (1 - ratio) + FG[1] * ratio)
    pixels[index + 2] = Math.round(BG[2] * (1 - ratio) + FG[2] * ratio)
    pixels[index + 3] = 255
  }
}

// ---- PNG 编码（RGBA 8bit，filter 0） ----
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++)
    c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer: Buffer): number {
  let crc = 0xFFFFFFFF
  for (const byte of buffer)
    crc = CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0 // filter: none
  Buffer.from(pixels.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const output = resolve(import.meta.dir, '../public/apple-touch-icon.png')
writeFileSync(output, png)
console.log(`apple-touch-icon.png written: ${output} (${png.length} bytes)`)
