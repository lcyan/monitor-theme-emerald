import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

/**
 * 校验 `package.json` 与 `theme.json` 的 version 一致（hub 安装目录与更新
 * 提示都按 theme.json 的 version 判断）。CI 里可选 `--tag v1.2.3` 额外校验
 * 发布 tag 与之匹配。
 */

function versionOf(file: string): string {
  const json = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8')) as { version?: unknown }
  if (typeof json.version !== 'string' || !json.version)
    throw new Error(`${file} does not contain a string version`)
  return json.version
}

const packageVersion = versionOf('package.json')
const themeVersion = versionOf('theme.json')

if (packageVersion !== themeVersion) {
  console.error(`version mismatch: package.json ${packageVersion} != theme.json ${themeVersion}`)
  process.exit(1)
}

const tagIndex = process.argv.indexOf('--tag')
if (tagIndex !== -1) {
  const tag = process.argv[tagIndex + 1]
  const expected = `v${themeVersion}`
  if (tag !== expected) {
    console.error(`tag mismatch: ${tag} != ${expected} (theme.json version)`)
    process.exit(1)
  }
}

console.log(`version ok: ${themeVersion}`)
