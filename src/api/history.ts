import type { MetricsResponse } from './types'
import { api, ApiError } from './client'

/**
 * 历史查询的统一入口。hub 全局只放行 4 个并发历史窗口，超出的直接 503——
 * 负载图、延迟图、列表三网延迟若各自请求，几十个节点的页面必然打爆它。
 * 这里串成一条队：客户端同时在飞的请求不超过 2 个；吃到 503 就让出队列位
 * 指数退避；同参数的请求去重并按 TTL 缓存。
 */

export interface HistoryQuery {
  hours: number
  /** 调用方能画的点数，只会让 hub 的步长变粗 */
  points?: number
  series?: 'metrics' | 'ping'
}

const MAX_CONCURRENT = 2
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
      return await api<MetricsResponse>(`/nodes/${nodeId}/metrics?${params}`)
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

/** 测试与登出等场景下清空缓存 */
export function clearHistoryCache(): void {
  cache.clear()
}
