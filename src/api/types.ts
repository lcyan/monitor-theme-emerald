/**
 * monitor hub 的原生数据结构。
 *
 * 契约来源：hub 的 `src/api.rs`（node_view / metrics / me）与 `src/db.rs`
 * （Traffic / 历史行）。字段含义与缺省行为以 hub 注释为准，这里只做
 * 主题侧的 TypeScript 表达，不做与 Komari 的兼容层。
 */

/** 计费周期；`once` 为一次性（买断），不参与剩余价值计算 */
export type BillingCycle = 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'biennial' | 'triennial' | 'once'

/** 流量计量方式：仅上行 / 仅下行 / 取双向较大者 / 双向求和（hub 默认） */
export type TrafficMode = 'up' | 'down' | 'max' | 'sum'

/** 一次上报的实时指标。net 单位 B/s，流量累计单位 B，cpu 为百分比 */
export interface Metrics {
  uptime: number
  cpu: number
  load: [number, number, number]
  mem_total: number
  mem_used: number
  swap_total: number
  swap_used: number
  disk_total: number
  disk_used: number
  net_rx: number
  net_tx: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  tcp: number
  udp: number
  procs: number
}

export interface Node {
  id: number
  name: string
  /** hub 已按 sort, id 排序返回 */
  sort: number
  public: boolean
  online: boolean
  /** ISO 3166-1 alpha-2，hub 无法定位国家时为空串 */
  country: string
  /** 站长设置的分组名，空串为未分组；旧版 hub 可能缺省 */
  group?: string
  /** Unix 秒。在线时为最近一次上报，离线时为最后可见时间 */
  last_seen: number
  /** 离线或尚未上报时为 null；坏帧经 safeNodes 置 null */
  metrics: Metrics | null
  os: string
  kernel: string
  arch: string
  virt: string
  cpu_name: string
  cpu_cores: number
  mem_total: number
  swap_total: number
  disk_total: number
  agent_version: string
  price: number
  currency: string
  billing_cycle: BillingCycle
  /** YYYY-MM-DD，未设置到期日为 null */
  expires_at: string | null
  /** hub 日历上的剩余天数，过期后为负，无日期为 null；旧版 hub 缺省 */
  expires_in?: number | null
  traffic_limit: number
  traffic_mode: TrafficMode
  traffic_reset_day: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  /** 本账期用量（按 traffic_mode 计量），旧版 hub 缺省 */
  month_used?: number
  /** 账期起始日 YYYY-MM-DD */
  month_start: string
  day_rx: number
  day_tx: number
}

/** /api/nodes 与 /api/ws 帧的共同形状；admin 表示该浏览器已登录 */
export interface NodesFrame {
  nodes: Node[]
  admin: boolean
}

/** metrics 历史行：cpu 为百分比，其余单位 B（net 为该桶均速 B/s） */
export interface MetricRow {
  ts: number
  cpu: number
  mem_used: number
  disk_used: number
  net_rx: number
  net_tx: number
}

/**
 * ping 历史行：已按后台探测顺序、每探测内按时间排好。
 * latency 为桶内中位数（ms），超时桶为 null；band 仅在桶内有波动时出现，
 * 行内 loss 为整数百分比（向上取整），仅丢失时出现。
 */
export interface PingRow {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}

/** GET /api/nodes/{id}/metrics 的响应 */
export interface MetricsResponse {
  metrics: MetricRow[]
  ping: PingRow[]
  /** task_id → 探测名 */
  probes: Record<string, string>
  /** 整个窗口内各探测的丢包率（未取整浮点，仅丢失 >0 的探测出现） */
  loss: Record<string, number>
}

/** GET /api/me */
export interface Me {
  authed: boolean
  github: boolean
  site_name: string
  public_page: boolean
  site: string
}
