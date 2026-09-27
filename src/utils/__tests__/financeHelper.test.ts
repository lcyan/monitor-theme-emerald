import type { Node } from '@/api/types'
import { describe, expect, it } from 'bun:test'
import { BILLING_CYCLE_DAYS, calculateMonthlyAverageCostCNY, calculateRemainingValueCNY, DEFAULT_EXCHANGE_RATES } from '../financeHelper'

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 1,
    name: 'node',
    sort: 0,
    public: true,
    online: true,
    country: '',
    last_seen: 0,
    metrics: null,
    os: '',
    kernel: '',
    arch: '',
    virt: '',
    cpu_name: '',
    cpu_cores: 1,
    mem_total: 0,
    swap_total: 0,
    disk_total: 0,
    agent_version: '',
    price: 100,
    currency: 'CNY',
    billing_cycle: 'monthly',
    expires_at: null,
    traffic_limit: 0,
    traffic_mode: 'sum',
    traffic_reset_day: 1,
    total_rx: 0,
    total_tx: 0,
    month_rx: 0,
    month_tx: 0,
    month_start: '2026-09-01',
    day_rx: 0,
    day_tx: 0,
    ...overrides,
  } as Node
}

describe('BILLING_CYCLE_DAYS', () => {
  it('枚举映射到计划规定的天数', () => {
    expect(BILLING_CYCLE_DAYS.monthly).toBe(30)
    expect(BILLING_CYCLE_DAYS.quarterly).toBe(90)
    expect(BILLING_CYCLE_DAYS.semiannual).toBe(180)
    expect(BILLING_CYCLE_DAYS.yearly).toBe(365)
    expect(BILLING_CYCLE_DAYS.biennial).toBe(730)
    expect(BILLING_CYCLE_DAYS.triennial).toBe(1095)
    expect(BILLING_CYCLE_DAYS.once).toBe(0)
  })
})

describe('calculateMonthlyAverageCostCNY', () => {
  it('月付节点月均即价格', () => {
    expect(calculateMonthlyAverageCostCNY(makeNode(), DEFAULT_EXCHANGE_RATES)).toBeCloseTo(100)
  })

  it('季付节点月均为价格的三分之一', () => {
    expect(calculateMonthlyAverageCostCNY(makeNode({ billing_cycle: 'quarterly' }), DEFAULT_EXCHANGE_RATES)).toBeCloseTo(100 / 3)
  })

  it('买断不计月均', () => {
    expect(calculateMonthlyAverageCostCNY(makeNode({ billing_cycle: 'once' }), DEFAULT_EXCHANGE_RATES)).toBe(0)
  })

  it('未知周期回落 0', () => {
    expect(calculateMonthlyAverageCostCNY(makeNode({ billing_cycle: 'daily' as never }), DEFAULT_EXCHANGE_RATES)).toBe(0)
  })
})

describe('calculateRemainingValueCNY', () => {
  it('按 expires_in 折算剩余价值', () => {
    const node = makeNode({ expires_in: 15 })
    // 15 / 30 天
    expect(calculateRemainingValueCNY(node, DEFAULT_EXCHANGE_RATES)).toBeCloseTo(50)
  })

  it('剩余天数超过周期封顶为全价', () => {
    const node = makeNode({ expires_in: 90 })
    expect(calculateRemainingValueCNY(node, DEFAULT_EXCHANGE_RATES)).toBeCloseTo(100)
  })

  it('已过期价值为 0', () => {
    expect(calculateRemainingValueCNY(makeNode({ expires_in: -3 }), DEFAULT_EXCHANGE_RATES)).toBe(0)
  })

  it('买断没有剩余价值', () => {
    expect(calculateRemainingValueCNY(makeNode({ billing_cycle: 'once', expires_in: 100 }), DEFAULT_EXCHANGE_RATES)).toBe(0)
  })

  it('无到期日价值为 0', () => {
    expect(calculateRemainingValueCNY(makeNode(), DEFAULT_EXCHANGE_RATES)).toBe(0)
  })

  it('旧版 hub 缺省 expires_in 时按 expires_at 日历折算', () => {
    const now = new Date('2026-09-16T00:00:00Z')
    const node = makeNode({ expires_at: '2026-10-01', expires_in: undefined })
    // 2026-09-16 → 2026-10-01 剩 15 天
    expect(calculateRemainingValueCNY(node, DEFAULT_EXCHANGE_RATES, now)).toBeCloseTo(50)
  })
})
