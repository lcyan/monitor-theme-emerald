import manifest from '../../theme.json'
import { api } from './client'

/**
 * 主题设置：默认值来自构建时打进包里的 `theme.json`，站长保存的覆盖项来自
 * `GET /api/themes/{short}/config`（只含有别于默认值的项）。hub 不校验保存的
 * 值是否符合 manifest 声明——一个值可能在旧版本下保存、被新版本读到——所以
 * 每项按类型 / options / min / max 校验，不合法一律回落默认值。
 */

export interface ThemeSettings {
  /** 允许按 manifest 字段名动态写入；已知字段仍保持各自的类型 */
  [key: string]: unknown
  defaultViewMode: 'card' | 'list'
  listPingEnabled: boolean
  pingNetworkOrder: string
  offlineNodesLast: boolean
  alertEnabled: boolean
  alertTitle: string
  alertContent: string
  earthViewMode: 'earth' | 'earth-stop' | 'maps' | 'cards' | 'hide'
  visitorInfoCardEnabled: boolean
  hideAdminEntryWhenLoggedOut: boolean
  disablePageAnimation: boolean
  icpEnabled: boolean
  icpNumber: string
  icpUrl: string
  policeEnabled: boolean
  policeNumber: string
  policeUrl: string
  backgroundEnabled: boolean
  backgroundType: 'image' | 'video'
  lightBackgroundUrl: string
  darkBackgroundUrl: string
  backgroundBlur: number
  backgroundOverlay: number
}

type FieldKind = 'string' | 'text' | 'number' | 'boolean' | 'select'

interface ConfigField {
  key: string
  type: FieldKind
  default: unknown
  options?: { value: string, label: string }[]
  min?: number
  max?: number
}

/** 从 manifest.config 里取出带 key 的字段项；title 等纯排版项跳过 */
function fieldsOf(config: unknown): ConfigField[] {
  if (!Array.isArray(config))
    return []
  const fields: ConfigField[] = []
  for (const entry of config) {
    if (!entry || typeof entry !== 'object')
      continue
    const item = entry as Record<string, unknown>
    if (typeof item.key !== 'string' || !item.key)
      continue
    const type = item.type
    if (type !== 'string' && type !== 'text' && type !== 'number' && type !== 'boolean' && type !== 'select')
      continue
    fields.push({
      key: item.key,
      type,
      default: item.default,
      options: Array.isArray(item.options)
        ? item.options.filter((o): o is { value: string, label: string } =>
            !!o && typeof o === 'object' && typeof (o as Record<string, unknown>).value === 'string')
        : undefined,
      min: typeof item.min === 'number' ? item.min : undefined,
      max: typeof item.max === 'number' ? item.max : undefined,
    })
  }
  return fields
}

const FIELDS = fieldsOf(manifest.config)

/** 默认设置（theme.json 的 default），manifest 缺字段时回落内置字面量 */
export function defaultSettings(): ThemeSettings {
  const settings = {
    defaultViewMode: 'card',
    listPingEnabled: true,
    pingNetworkOrder: '',
    offlineNodesLast: false,
    alertEnabled: false,
    alertTitle: '',
    alertContent: '',
    earthViewMode: 'earth',
    visitorInfoCardEnabled: true,
    hideAdminEntryWhenLoggedOut: false,
    disablePageAnimation: false,
    icpEnabled: false,
    icpNumber: '',
    icpUrl: 'https://beian.miit.gov.cn/',
    policeEnabled: false,
    policeNumber: '',
    policeUrl: '',
    backgroundEnabled: false,
    backgroundType: 'image',
    lightBackgroundUrl: '',
    darkBackgroundUrl: '',
    backgroundBlur: 0,
    backgroundOverlay: 0,
  } as ThemeSettings
  for (const field of FIELDS) {
    if (isValid(field, field.default))
      settings[field.key] = field.default
  }
  return settings
}

/** 单项校验：不合法的覆盖值不能上页面 */
export function isValid(field: ConfigField, value: unknown): boolean {
  switch (field.type) {
    case 'boolean':
      return typeof value === 'boolean'
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value))
        return false
      if (field.min !== undefined && value < field.min)
        return false
      if (field.max !== undefined && value > field.max)
        return false
      return true
    case 'select':
      return typeof value === 'string' && !!field.options?.some(option => option.value === value)
    default:
      // string 与 text 同为自由文本，仅要求是字符串
      return typeof value === 'string'
  }
}

/** 用保存的覆盖项补齐默认设置，逐项校验 */
export function mergeSettings(saved: Record<string, unknown>): ThemeSettings {
  const settings = defaultSettings()
  for (const field of FIELDS) {
    if (field.key in saved && isValid(field, saved[field.key]))
      settings[field.key] = saved[field.key]
  }
  return settings
}

/**
 * 拉取站长设置并与默认值合并。公开页关闭（401）或 hub 不可达时页面仍要以
 * 默认设置渲染，所以失败不抛出，回落默认值。
 */
export async function loadThemeSettings(): Promise<ThemeSettings> {
  try {
    const saved = await api<Record<string, unknown>>(`/themes/${manifest.short}/config`)
    return mergeSettings(saved && typeof saved === 'object' ? saved : {})
  }
  catch {
    return defaultSettings()
  }
}
