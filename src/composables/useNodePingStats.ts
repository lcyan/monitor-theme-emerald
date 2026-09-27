import type { MaybeRefOrGetter } from 'vue'
import type { PingRow } from '@/api/types'
import { computed, ref, toValue, watch } from 'vue'
import { fetchHistory } from '@/api/history'

/**
 * 单节点近一小时 ping 概览，供列表 / 卡片的三网延迟条使用。
 *
 * 数据经 `fetchHistory` 的并发队列（客户端上限 2）与 60s TTL 缓存：同一节点
 * 的重复调用、多节点同时进视口的爆发请求，都会在队列与缓存处收敛。
 * 是否发起请求由调用方的 enabled 控制——列表用 IntersectionObserver 只对
 * 视口内节点取数。
 */

export interface NodePingHistoryPoint {
  /** ISO 时间串，仅作 tooltip 与 key 使用 */
  time: string
  latency: number | null
  loss: number | null
}

export interface NodePingPerTaskStat {
  taskId: number
  name: string
  avgLatency: number
  loss: number
}

export interface NodePingStatsState {
  avgLatency: number
  avgLoss: number
  avgVolatility: number
  history: NodePingHistoryPoint[]
  hasData: boolean
  perTaskStats: NodePingPerTaskStat[]
}

export const NODE_PING_BAR_COUNT = 10
const QUERY_HOURS = 1
const FULL_LOSS_EPSILON = 1e-6

function createEmptyStats(): NodePingStatsState {
  return {
    avgLatency: 0,
    avgLoss: 0,
    avgVolatility: 0,
    history: [],
    hasData: false,
    perTaskStats: [],
  }
}

function average(values: number[]): number {
  if (!values.length)
    return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getPercentile(values: number[], percentile: number): number | null {
  if (!values.length)
    return null

  const sorted = [...values].sort((left, right) => left - right)
  const position = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * percentile))
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lowerValue = sorted[lowerIndex]
  const upperValue = sorted[upperIndex]

  if (lowerValue === undefined || upperValue === undefined)
    return null
  if (lowerIndex === upperIndex)
    return lowerValue

  return lowerValue + (upperValue - lowerValue) * (position - lowerIndex)
}

/**
 * hub 返回的行已按探测顺序、探测内按时间排好。把所有探测的行并成时间有序
 * 后切成 N 个桶，每个桶取有效延迟的均值与行内丢包的均值。
 */
function buildHistory(rows: PingRow[]): NodePingHistoryPoint[] {
  const sorted = [...rows].sort((a, b) => a.ts - b.ts)
  if (!sorted.length)
    return []

  const bucketCount = Math.min(NODE_PING_BAR_COUNT, sorted.length)
  const firstTs = sorted[0]!.ts
  const lastTs = sorted.at(-1)!.ts
  const bucketSize = Math.max(1, (lastTs - firstTs + 1) / bucketCount)

  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    time: new Date((firstTs + index * bucketSize) * 1000).toISOString(),
    latencySum: 0,
    latencyCount: 0,
    lossSum: 0,
    lossCount: 0,
  }))

  for (const row of sorted) {
    const index = Math.min(bucketCount - 1, Math.floor((row.ts - firstTs) / bucketSize))
    const bucket = buckets[index]
    if (!bucket)
      continue
    if (row.latency !== null) {
      bucket.latencySum += row.latency
      bucket.latencyCount++
    }
    bucket.lossSum += row.loss ?? 0
    bucket.lossCount++
  }

  return buckets.map(({ time, latencySum, latencyCount, lossSum, lossCount }) => ({
    time,
    latency: latencyCount ? latencySum / latencyCount : null,
    loss: lossCount ? lossSum / lossCount : null,
  }))
}

function buildStats(rows: PingRow[], probes: Record<string, string>, windowLoss: Record<string, number>): NodePingStatsState {
  if (!rows.length)
    return createEmptyStats()

  // 探测按行首次出现顺序（即后台顺序）；窗口丢包率只用响应的 loss，不平均行内值
  const byTask = new Map<number, PingRow[]>()
  for (const row of rows) {
    const list = byTask.get(row.task_id) ?? []
    list.push(row)
    byTask.set(row.task_id, list)
  }

  const latencyValues: number[] = []
  const taskLossValues: number[] = []
  const volatilityValues: number[] = []
  const perTaskStats: NodePingPerTaskStat[] = []

  for (const [taskId, taskRows] of byTask) {
    const validValues = taskRows.map(row => row.latency).filter((v): v is number => v !== null)

    const avgLatency = validValues.length ? average(validValues) : -1
    const loss = windowLoss[String(taskId)] ?? 0
    const name = probes[String(taskId)] ?? `Ping ${taskId}`
    perTaskStats.push({ taskId, name, avgLatency, loss })

    if (validValues.length) {
      latencyValues.push(avgLatency)
      taskLossValues.push(loss)
      if (validValues.length > 1) {
        const p50 = getPercentile(validValues, 0.5)
        const p99 = getPercentile(validValues, 0.99)
        if (p50 !== null && p99 !== null && p50 > FULL_LOSS_EPSILON)
          volatilityValues.push(p99 / p50)
      }
    }
  }

  const history = buildHistory(rows)
  const historyLatency = history.map(p => p.latency).filter((v): v is number => v !== null)

  return {
    avgLatency: latencyValues.length ? average(latencyValues) : average(historyLatency),
    avgLoss: average(taskLossValues),
    avgVolatility: average(volatilityValues),
    history,
    hasData: history.length > 0,
    perTaskStats,
  }
}

export function useNodePingStats(
  nodeId: MaybeRefOrGetter<number | null | undefined>,
  options?: { enabled?: MaybeRefOrGetter<boolean> },
) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const stats = ref<NodePingStatsState>(createEmptyStats())

  const resolved = computed(() => ({
    nodeId: toValue(nodeId) ?? null,
    enabled: toValue(options?.enabled) ?? true,
  }))

  let requestSeq = 0

  watch(resolved, async ({ nodeId: id, enabled }) => {
    const seq = ++requestSeq
    if (!enabled || id === null) {
      loading.value = false
      error.value = null
      return
    }

    loading.value = !stats.value.hasData
    error.value = null
    try {
      // 60s TTL 缓存在 fetchHistory 内部：可见性反复变化不会重复打 hub
      const response = await fetchHistory(id, { hours: QUERY_HOURS, points: NODE_PING_BAR_COUNT, series: 'ping' })
      if (seq !== requestSeq)
        return
      stats.value = buildStats(response.ping, response.probes, response.loss)
    }
    catch (e) {
      if (seq !== requestSeq)
        return
      error.value = e instanceof Error ? e.message : '获取 Ping 历史失败'
    }
    finally {
      if (seq === requestSeq)
        loading.value = false
    }
  }, { immediate: true })

  return {
    stats,
    loading,
    error,
    history: computed(() => stats.value.history),
    avgLatency: computed(() => stats.value.avgLatency),
    avgLoss: computed(() => stats.value.avgLoss),
    avgVolatility: computed(() => stats.value.avgVolatility),
    hasData: computed(() => stats.value.hasData),
    perTaskStats: computed(() => stats.value.perTaskStats),
  }
}
