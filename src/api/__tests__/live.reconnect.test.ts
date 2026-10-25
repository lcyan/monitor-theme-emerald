import type { Node } from '../types'
import { describe, expect, it } from 'bun:test'
import { startLive } from '../live'

/**
 * live.ts 重连状态机的回归测试。
 *
 * 背景：看门狗定时器曾漏掉在 open 时撤销，导致健康的连接每 5s 被自己关掉。
 * 这组测试用可控制的假 WebSocket 与短间隔真实计时器锁住四个行为：
 * open 不被看门狗关闭、断线后轮询接管并重连、WS 恢复后继续收帧、
 * gzip/文本双帧与可见性切换。
 */

const FRAME: { nodes: Partial<Node>[], admin: boolean } = { nodes: [], admin: false }

class FakeSocket {
  static instances: FakeSocket[] = []
  static reset() {
    FakeSocket.instances = []
  }

  readyState = 0 // CONNECTING
  closed = false
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null

  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }

  // api 层不会调用 send；只实现 close
  close(): void {
    if (this.closed)
      return
    this.closed = true
    this.readyState = 3
    this.onclose?.()
  }

  open(): void {
    this.readyState = 1
    this.onopen?.()
  }

  message(nodes: unknown): void {
    this.onmessage?.({ data: JSON.stringify({ nodes, admin: false }) })
  }

  /** 模拟 /api/ws?gzip 推送的 gzip 二进制帧 */
  binaryMessage(nodes: unknown): void {
    this.onmessage?.({ data: new Blob([Bun.gzipSync(JSON.stringify({ nodes, admin: false }))]) })
  }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function installFakeGlobals(options: { status?: number } = {}) {
  const previousWebSocket = globalThis.WebSocket
  const previousFetch = globalThis.fetch
  const previousLocation = (globalThis as { location?: unknown }).location
  let fetchCount = 0

  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket
  globalThis.fetch = (async () => {
    fetchCount++
    if (options.status === 401) {
      return {
        ok: false,
        status: 401,
        headers: { get: () => 'text/plain' },
        text: async () => '公开页已关闭',
      }
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => FRAME,
    }
  }) as unknown as typeof fetch
  ;(globalThis as { location?: unknown }).location = { protocol: 'http:', host: 'hub.test' }

  return {
    fetchCount: () => fetchCount,
    restore() {
      globalThis.WebSocket = previousWebSocket
      globalThis.fetch = previousFetch
      ;(globalThis as { location?: unknown }).location = previousLocation
    },
  }
}

function installFakeDocument() {
  const listeners = new Map<string, () => void>()
  const fakeDocument = {
    hidden: false,
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  }
  const previous = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = fakeDocument
  return {
    hide: () => {
      fakeDocument.hidden = true
      listeners.get('visibilitychange')?.()
    },
    show: () => {
      fakeDocument.hidden = false
      listeners.get('visibilitychange')?.()
    },
    restore: () => {
      (globalThis as { document?: unknown }).document = previous
    },
  }
}

const noopHandlers = { onNodes: () => {}, onClosed: () => {}, onError: () => {} }

describe('startLive', () => {
  it('连接打开后不被看门狗关闭（回归：openTimer 漏撤销）', async () => {
    const env = installFakeGlobals()
    try {
      FakeSocket.reset()
      const handle = startLive(noopHandlers, { pollMs: 10, reconnectMs: 40 })
      const socket = FakeSocket.instances.at(-1)!
      socket.open()
      // 原始 bug：open 5s（此处 40ms）后看门狗会关掉健康连接
      await sleep(120)
      expect(socket.closed).toBe(false)
      expect(FakeSocket.instances.length).toBe(1)
      handle.stop()
    }
    finally {
      env.restore()
    }
  })

  it('断线后轮询接管并持续重连', async () => {
    const env = installFakeGlobals()
    try {
      FakeSocket.reset()
      const received: unknown[][] = []
      const handle = startLive({
        onNodes: nodes => received.push(nodes),
        onClosed: () => {},
        onError: () => {},
      }, { pollMs: 15, reconnectMs: 60 })
      const socket = FakeSocket.instances.at(-1)!
      // 先正常收一帧，随后断线
      socket.open()
      socket.message([makeNode(1)])
      socket.close()
      const socketsAfterClose = FakeSocket.instances.length
      await sleep(80)
      // 轮询在跑（fetch 计数增长），且重连出了新 socket
      expect(env.fetchCount()).toBeGreaterThan(1)
      expect(FakeSocket.instances.length).toBeGreaterThan(socketsAfterClose)
      handle.stop()
    }
    finally {
      env.restore()
    }
  })

  it('重连后的 socket 继续收帧并上抛 onNodes', async () => {
    const env = installFakeGlobals()
    try {
      FakeSocket.reset()
      const received: number[] = []
      const handle = startLive({
        onNodes: nodes => received.push(nodes.length),
        onClosed: () => {},
        onError: () => {},
      }, { pollMs: 15, reconnectMs: 60 })
      const first = FakeSocket.instances.at(-1)!
      first.open()
      first.message([makeNode(1)])
      first.close()
      await sleep(80)
      const second = FakeSocket.instances.filter(s => !s.closed).at(-1) ?? FakeSocket.instances.at(-1)!
      expect(second).not.toBe(first)
      second.open()
      second.message([makeNode(1), makeNode(2)])
      // 帧解析是异步的，等微任务落地
      await sleep(10)
      // 轮询会夹入空帧，只断言两节点帧确实上抛过
      expect(received).toContain(2)
      handle.stop()
    }
    finally {
      env.restore()
    }
  })

  it('带 ?gzip 连接，文本帧与 gzip 二进制帧都能上抛', async () => {
    const env = installFakeGlobals()
    try {
      FakeSocket.reset()
      const received: number[] = []
      const handle = startLive({
        onNodes: nodes => received.push(nodes.length),
        onClosed: () => {},
        onError: () => {},
      }, { pollMs: 50, reconnectMs: 50 })
      const socket = FakeSocket.instances.at(-1)!
      expect(socket.url).toContain('/api/ws?gzip')
      socket.open()
      socket.message([makeNode(1)])
      await sleep(10)
      socket.binaryMessage([makeNode(1), makeNode(2)])
      await sleep(20)
      expect(received).toContain(1)
      expect(received).toContain(2)
      handle.stop()
    }
    finally {
      env.restore()
    }
  })

  it('没有 DecompressionStream 时退回纯文本 /api/ws', async () => {
    const env = installFakeGlobals()
    const previousDecompressionStream = (globalThis as { DecompressionStream?: unknown }).DecompressionStream
    ;(globalThis as { DecompressionStream?: unknown }).DecompressionStream = undefined
    try {
      FakeSocket.reset()
      const handle = startLive(noopHandlers)
      expect(FakeSocket.instances.at(-1)!.url).not.toContain('gzip')
      handle.stop()
    }
    finally {
      ;(globalThis as { DecompressionStream?: unknown }).DecompressionStream = previousDecompressionStream
      env.restore()
    }
  })

  it('/api/nodes 401（公开页已关）后停止轮询与重连', async () => {
    const env = installFakeGlobals({ status: 401 })
    try {
      FakeSocket.reset()
      let closed = false
      const handle = startLive({
        onNodes: () => {},
        onClosed: () => {
          closed = true
        },
        onError: () => {},
      }, { pollMs: 15, reconnectMs: 30 })
      const socket = FakeSocket.instances.at(-1)!
      await sleep(80)
      expect(closed).toBe(true)
      // socket 被主动撤销，且不再轮询、不再重连
      expect(socket.closed).toBe(true)
      const fetches = env.fetchCount()
      const sockets = FakeSocket.instances.length
      await sleep(80)
      expect(env.fetchCount()).toBe(fetches)
      expect(FakeSocket.instances.length).toBe(sockets)
      handle.stop()
    }
    finally {
      env.restore()
    }
  })

  it('隐藏标签页断流停轮询，回前台立即拉取并重连', async () => {
    const env = installFakeGlobals()
    const doc = installFakeDocument()
    try {
      FakeSocket.reset()
      const handle = startLive(noopHandlers, { pollMs: 15, reconnectMs: 40 })
      const socket = FakeSocket.instances.at(-1)!
      socket.open()
      socket.message([makeNode(1)])
      doc.hide()
      expect(socket.closed).toBe(true)
      const fetches = env.fetchCount()
      const sockets = FakeSocket.instances.length
      // 隐藏期间（长于 reconnectMs）既不轮询也不重连
      await sleep(90)
      expect(env.fetchCount()).toBe(fetches)
      expect(FakeSocket.instances.length).toBe(sockets)
      doc.show()
      // 回前台：立即拉一次 /api/nodes 并重连 WS
      expect(env.fetchCount()).toBe(fetches + 1)
      expect(FakeSocket.instances.length).toBe(sockets + 1)
      handle.stop()
    }
    finally {
      doc.restore()
      env.restore()
    }
  })
})

function makeNode(id: number): Node {
  return {
    id,
    name: `node-${id}`,
    sort: 0,
    public: true,
    online: true,
    country: '',
    last_seen: 1_700_000_000,
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
    price: 0,
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
  }
}
