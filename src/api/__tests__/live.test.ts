import type { Node } from '../types'
import { describe, expect, it } from 'bun:test'
import { safeNodes } from '../live'

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 1,
    name: 'node-1',
    sort: 0,
    public: true,
    online: true,
    country: 'JP',
    last_seen: 1_700_000_000,
    metrics: {
      uptime: 100,
      cpu: 12.5,
      load: [0.1, 0.2, 0.3],
      mem_total: 1000,
      mem_used: 500,
      swap_total: 100,
      swap_used: 10,
      disk_total: 2000,
      disk_used: 800,
      net_rx: 1024,
      net_tx: 2048,
      total_rx: 1,
      total_tx: 1,
      month_rx: 1,
      month_tx: 1,
      tcp: 5,
      udp: 2,
      procs: 80,
    },
    os: 'linux',
    kernel: '6.1',
    arch: 'amd64',
    virt: 'kvm',
    cpu_name: 'x86',
    cpu_cores: 4,
    mem_total: 1000,
    swap_total: 100,
    disk_total: 2000,
    agent_version: '1.0.0',
    price: 0,
    currency: 'CNY',
    billing_cycle: 'monthly',
    expires_at: null,
    traffic_limit: 0,
    traffic_mode: 'sum',
    traffic_reset_day: 1,
    total_rx: 1,
    total_tx: 1,
    month_rx: 1,
    month_tx: 1,
    month_start: '2026-09-01',
    day_rx: 0,
    day_tx: 0,
    ...overrides,
  } as Node
}

describe('safeNodes', () => {
  it('合法 metrics 原样通过', () => {
    const node = makeNode()
    expect(safeNodes([node])[0]).toBe(node)
  })

  it('metrics 为 null 的节点保持 null', () => {
    const node = makeNode({ metrics: null })
    expect(safeNodes([node])[0]!.metrics).toBeNull()
  })

  it('数值字段非法时整份 metrics 置 null，不影响其他节点', () => {
    const broken = makeNode({ id: 2, name: 'bad' })
    broken.metrics!.cpu = Number.NaN
    const negative = makeNode({ id: 3, name: 'neg' })
    negative.metrics!.mem_used = -5
    const good = makeNode({ id: 4, name: 'good' })

    const result = safeNodes([broken, negative, good])
    expect(result[0]!.metrics).toBeNull()
    expect(result[1]!.metrics).toBeNull()
    expect(result[2]!.metrics).toBe(good.metrics)
  })

  it('load 不是三元数组时置 null', () => {
    const node = makeNode()
    node.metrics!.load = [0.1, 0.2] as unknown as [number, number, number]
    expect(safeNodes([node])[0]!.metrics).toBeNull()
  })
})
