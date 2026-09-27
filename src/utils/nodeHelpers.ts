import type { BillingCycle, Node } from '@/api/types'
import { CURRENCY_SYMBOLS, normalizeCurrency } from '@/utils/financeHelper'
import { daysUntilDate, formatDateTime } from '@/utils/helper'

/** 过期状态阈值配置（天） */
const EXPIRE_THRESHOLDS = {
  critical: 7, // 7天内过期显示红色
  warning: 15, // 15天内过期显示橙色
  long_term: 36_500, // 约100年视为长期
} as const

export type ExpireStatus = 'expired' | 'critical' | 'warning' | 'normal' | 'long_term'

export interface PriceTagItem {
  text: string
  highlight?: boolean
}

/** 剩余天数：hub 的 expires_in（按 hub 日历折算）优先，旧版 hub 回落解析 expires_at */
export function getDaysUntilExpiry(node: Node): number | null {
  if (typeof node.expires_in === 'number')
    return node.expires_in
  return daysUntilDate(node.expires_at)
}

export function getExpireStatus(node: Node): ExpireStatus | null {
  const days = getDaysUntilExpiry(node)
  if (days === null)
    return null
  if (days <= 0)
    return 'expired'
  if (days < EXPIRE_THRESHOLDS.critical)
    return 'critical'
  if (days < EXPIRE_THRESHOLDS.warning)
    return 'warning'
  if (days > EXPIRE_THRESHOLDS.long_term)
    return 'long_term'
  return 'normal'
}

export function getExpireTextClass(node: Node): string {
  const status = getExpireStatus(node)
  if (status === 'expired' || status === 'critical')
    return 'text-destructive'
  if (status === 'warning')
    return 'text-yellow-600 dark:text-yellow-400'
  if (status === 'long_term')
    return 'text-muted-foreground'
  return '' // 正常期内用主题强调色
}

const BILLING_CYCLE_TEXTS: Record<string, Record<'zh-CN' | 'en-US', string>> = {
  monthly: { 'zh-CN': '月', 'en-US': 'Month' },
  quarterly: { 'zh-CN': '季', 'en-US': 'Quarter' },
  semiannual: { 'zh-CN': '半年', 'en-US': 'Semi-Annual' },
  yearly: { 'zh-CN': '年', 'en-US': 'Year' },
  biennial: { 'zh-CN': '两年', 'en-US': 'Biennial' },
  triennial: { 'zh-CN': '三年', 'en-US': 'Triennial' },
  once: { 'zh-CN': '一次性', 'en-US': 'Once' },
}

export function getBillingCycleText(billingCycle: BillingCycle | string, lang: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  return BILLING_CYCLE_TEXTS[billingCycle]?.[lang] ?? String(billingCycle)
}

export function formatPrice(price: number, currency: string = 'CNY', lang: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  if (price <= 0)
    return lang === 'zh-CN' ? '免费' : 'Free'
  const code = normalizeCurrency(currency)
  const symbol = CURRENCY_SYMBOLS[code]
  return `${symbol}${price}`
}

export function formatPriceWithCycle(
  price: number,
  billingCycle: BillingCycle | string,
  currency: string = 'CNY',
  lang: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  const priceText = formatPrice(price, currency, lang)
  return price > 0 ? `${priceText}/${getBillingCycleText(billingCycle, lang)}` : priceText
}

export function getPriceTags(node: Node, lang: 'zh-CN' | 'en-US'): PriceTagItem[] {
  const tags: PriceTagItem[] = []
  if (node.price !== 0)
    tags.push({ text: formatPriceWithCycle(node.price, node.billing_cycle, node.currency, lang) })
  const days = getDaysUntilExpiry(node)
  if (days === null)
    return tags
  const status = getExpireStatus(node)
  if (status === 'long_term')
    tags.push({ text: lang === 'zh-CN' ? '长期' : 'Long-term' })
  else if (lang === 'zh-CN')
    tags.push({ text: `${days >= 0 ? '+' : ''}${days}天`, highlight: true })
  else
    tags.push({ text: `${days >= 0 ? '+' : ''}${days}d`, highlight: true })
  return tags
}

export function getRemainingTimeTagClass(node: Node): string {
  if (node.price === 0)
    return ''
  return getExpireTextClass(node)
}

/** 本账期已用流量：hub 按 traffic_mode 折算好的 month_used 优先 */
export function getTrafficUsed(node: Node): number {
  return node.month_used ?? (node.month_rx + node.month_tx)
}

export function showTrafficProgress(node: Node): boolean {
  return node.traffic_limit > 0
}

export function getTrafficUsedPercentage(node: Node): number {
  if (node.traffic_limit <= 0)
    return 0
  return Math.min((getTrafficUsed(node) / node.traffic_limit) * 100, 100)
}

/** 离线时间：last_seen 为 Unix 秒 */
export function formatOfflineTime(node: Node): string {
  return formatDateTime(new Date(node.last_seen * 1000))
}

export function getMemPercentage(node: Node): number {
  const m = node.metrics
  if (!m)
    return 0
  return (m.mem_used) / (m.mem_total || node.mem_total || 1) * 100
}

export function getDiskPercentage(node: Node): number {
  const m = node.metrics
  if (!m)
    return 0
  return (m.disk_used) / (m.disk_total || node.disk_total || 1) * 100
}
