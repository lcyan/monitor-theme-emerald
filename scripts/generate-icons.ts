import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

/**
 * 从源码里扫描实际用到的 Iconify 图标，从 `@iconify/json` 提取后生成
 * `src/generated/icons.ts`，由 `setupIconify()` 注册为离线集合。
 *
 * 背景：@iconify/vue 默认运行时从 api.iconify.design 按需拉取图标，
 * 自托管页面（尤其访客在国内网络）会因此显示不出图标。只打包用到的
 * 几十个图标，体积可以忽略。
 *
 * 用法：`bun run icons`（新增图标引用后重跑即可）。
 */

const PREFIXES = ['tabler', 'icon-park-outline', 'lucide', 'carbon'] as const
const SCAN_ROOTS = ['src']
const SCAN_EXTS = new Set(['.vue', '.ts', '.tsx'])
const OUT_FILE = resolve(process.cwd(), 'src/generated/icons.ts')

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory())
      yield* walk(path)
    else if (SCAN_EXTS.has(entry.slice(entry.lastIndexOf('.'))))
      yield path
  }
}

/** 匹配 `prefix:name`，prefix 限定在已知集合里，避免误抓 URL / 路径 */
const ICON_RE = new RegExp(`(?:${PREFIXES.join('|')}):[a-z0-9-]+`, 'g')

const used = new Map<string, Set<string>>()
for (const root of SCAN_ROOTS) {
  for (const file of walk(resolve(process.cwd(), root))) {
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(ICON_RE)) {
      const [prefix, name] = match[0].split(':') as [string, string]
      if (!used.has(prefix))
        used.set(prefix, new Set())
      used.get(prefix)!.add(name)
    }
  }
}

interface PrunedCollection {
  prefix: string
  icons: Record<string, unknown>
  aliases?: Record<string, unknown>
  width?: number
  height?: number
}

const collections: PrunedCollection[] = []
let total = 0

for (const prefix of PREFIXES) {
  const names = used.get(prefix)
  if (!names?.size)
    continue
  const data = JSON.parse(readFileSync(resolve(process.cwd(), `node_modules/@iconify/json/json/${prefix}.json`), 'utf8')) as {
    prefix: string
    icons: Record<string, unknown>
    aliases?: Record<string, Record<string, unknown>>
    width?: number
    height?: number
  }

  const out: PrunedCollection = { prefix: data.prefix, icons: {} }
  for (const name of names) {
    if (data.icons[name]) {
      out.icons[name] = data.icons[name]
      continue
    }
    // 别名：连同父图标一起带上，addCollection 才能解析
    const alias = data.aliases?.[name]
    if (!alias) {
      console.warn(`[icons] ${prefix}:${name} not found in @iconify/json — skipped`)
      continue
    }
    out.aliases ??= {}
    out.aliases[name] = alias
    const parent = alias.parent
    if (typeof parent === 'string' && data.icons[parent])
      out.icons[parent] = data.icons[parent]
  }

  // Iconify 渲染 viewBox 依赖 width/height；源集合只有顶层尺寸时必须补到每个图标上，
  // 否则运行时按缺省几何渲染会导致图标变形
  out.width = data.width
  out.height = data.height
  for (const icon of Object.values(out.icons)) {
    const entry = icon as { width?: number, height?: number }
    entry.width ??= data.width
    entry.height ??= data.height
  }

  const count = Object.keys(out.icons).length + Object.keys(out.aliases ?? {}).length
  total += count
  collections.push(out)
  console.log(`[icons] ${prefix}: ${count}`)
}

if (!collections.length) {
  console.error('[icons] no icons found in source scan')
  process.exit(1)
}

const header = `/**
 * 由 \`bun run icons\` 生成：源码中实际用到的 Iconify 图标（离线集合）。
 * 不要手改；新增图标引用后重跑生成脚本即可。
 */
import type { IconifyJSON } from '@iconify/vue'
`

mkdirSync(resolve(process.cwd(), 'src/generated'), { recursive: true })
writeFileSync(OUT_FILE, `${header}export const offlineCollections: IconifyJSON[] = ${JSON.stringify(collections)}\n`)
console.log(`[icons] wrote ${OUT_FILE} (${total} icons)`)
