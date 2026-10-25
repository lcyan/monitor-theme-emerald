import type { MetricRow, MetricsResponse, PingRow } from './types'
import { api, ApiError } from './client'

/**
 * 历史查询的统一入口。hub 全局只放行 4 个并发历史窗口，超出的直接 503——
 * 负载图、延迟图、列表三网延迟若各自请求，几十个节点的页面必然打爆它。
 * 这里串成一条队：客户端同时在飞的请求不超过 3 个；吃到 503 就让出队列位
 * 指数退避；同参数的请求去重并按 TTL 缓存。
 */

export interface HistoryQuery {
  hours: number
  /** 调用方能画的点数，只会让 hub 的步长变粗 */
  points?: number
  series?: 'metrics' | 'ping'
}

const MAX_CONCURRENT = 3
const RETRY_MAX = 4
const BASE_DELAY_MS = 500
const DEFAULT_TTL_MS = 60_000

let active = 0
const waiters: Array<() => void> = []

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active++
      resolve()
    })
  })
}

function release(): void {
  active--
  waiters.shift()?.()
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** 与 live.ts 的 safeNodes 同思路：一行坏数据不能把 NaN 带进图表，丢弃而非修整 */
function safeMetricRows(rows: unknown): MetricRow[] {
  const base = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  const optional = (r: Record<string, unknown>, key: string) => r[key] === undefined || base(r[key])
  if (!Array.isArray(rows))
    return []
  return rows.filter((row): row is MetricRow => {
    if (row === null || typeof row !== 'object')
      return false
    const r = row as Record<string, unknown>
    return base(r.ts) && base(r.cpu) && base(r.mem_used) && base(r.disk_used)
      && base(r.net_rx) && base(r.net_tx)
      && optional(r, 'minutes') && optional(r, 'cpu_max')
      && optional(r, 'net_rx_max') && optional(r, 'net_tx_max')
  })
}

function safePingRows(rows: unknown): PingRow[] {
  const base = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  if (!Array.isArray(rows))
    return []
  return rows.filter((row): row is PingRow => {
    if (row === null || typeof row !== 'object')
      return false
    const r = row as Record<string, unknown>
    return base(r.task_id) && base(r.ts)
      && (r.latency === null || base(r.latency))
      && (r.loss === undefined || base(r.loss))
  })
}

function sanitize(response: MetricsResponse): MetricsResponse {
  return { ...response, metrics: safeMetricRows(response.metrics), ping: safePingRows(response.ping) }
}

async function requestOnce(nodeId: number, query: HistoryQuery): Promise<MetricsResponse> {
  // 退避等待发生在队列之外：吃 503 的请求不该占着两个名额之一
  for (let attempt = 0; ; attempt++) {
    await acquire()
    try {
      const params = new URLSearchParams({ hours: String(query.hours) })
      if (query.points !== undefined)
        params.set('points', String(query.points))
      if (query.series !== undefined)
        params.set('series', query.series)
      return sanitize(await api<MetricsResponse>(`/nodes/${nodeId}/metrics?${params}`))
    }
    catch (e) {
      if (e instanceof ApiError && e.status === 503 && attempt < RETRY_MAX - 1) {
        await sleep(BASE_DELAY_MS * 2 ** attempt)
        continue
      }
      throw e
    }
    finally {
      release()
    }
  }
}

interface CacheEntry { at: number, promise: Promise<MetricsResponse> }

const cache = new Map<string, CacheEntry>()

/**
 * 按节点与查询参数取历史。TTL 内的重复调用复用在飞的或已完成的结果；
 * 失败不缓存。ttlMs 传 0 表示永远复用进行中的请求但不复用已完成的。
 */
export function fetchHistory(nodeId: number, query: HistoryQuery, ttlMs = DEFAULT_TTL_MS): Promise<MetricsResponse> {
  const key = `${nodeId}|${query.hours}|${query.points ?? ''}|${query.series ?? ''}`
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < ttlMs)
    return hit.promise
  const entry: CacheEntry = {
    at: now,
    promise: requestOnce(nodeId, query).catch((e: unknown) => {
      cache.delete(key)
      throw e
    }),
  }
  cache.set(key, entry)
  return entry.promise
}
