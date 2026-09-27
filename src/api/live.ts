import type { Node, NodesFrame } from './types'
import { api, ApiError } from './client'

/** 一帧坏掉的 metrics 不能把其他节点都从页面上带走 */
export function safeNodes(nodes: Node[]): Node[] {
  const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  const fields = [
    'uptime',
    'cpu',
    'mem_total',
    'mem_used',
    'swap_total',
    'swap_used',
    'disk_total',
    'disk_used',
    'net_rx',
    'net_tx',
    'total_rx',
    'total_tx',
    'month_rx',
    'month_tx',
    'tcp',
    'udp',
    'procs',
  ] as const
  return nodes.map((node) => {
    const m = node.metrics
    return !m || (fields.every(key => number(m[key])) && Array.isArray(m.load) && m.load.length === 3 && m.load.every(number))
      ? node
      : { ...node, metrics: null }
  })
}

export interface LiveHandlers {
  /** 每一帧安全校验后的节点列表（WS 推送或轮询应答） */
  onNodes: (nodes: Node[]) => void
  /** hub 以 401 应答：自本页加载后公开页已被关闭 */
  onClosed: () => void
  /** 轮询/首取失败时的错误消息；恢复后以 null 调用 */
  onError: (message: string | null) => void
}

export interface LiveHandle {
  /** 停止流与轮询，取消未决的重连 */
  stop: () => void
}

const POLL_MS = 5_000
const RECONNECT_MS = 5_000

export interface LiveOptions {
  /** 测试用：覆盖轮询与重连间隔 */
  pollMs?: number
  reconnectMs?: number
}

/**
 * 实时节点的唯一来源：先取一次 /api/nodes 让页面尽快有数据，随后连 /api/ws
 * （hub 每 2s 推一帧）。流断开后轮询接管，并持续尝试重连——hub 重启会断开
 * 每一条流，不重连的话，比部署活得久的页面会以 1/5 的速率默默轮询到永远；
 * WS 收到帧即停轮询。所有定时器只在这里持有，返回的 stop() 负责清场。
 */
export function startLive(handlers: LiveHandlers, options: LiveOptions = {}): LiveHandle {
  const pollMs = options.pollMs ?? POLL_MS
  const reconnectMs = options.reconnectMs ?? RECONNECT_MS
  let socket: WebSocket | null = null
  let poll: ReturnType<typeof setInterval> | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let openTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const receive = (list: unknown) => {
    if (stopped || !Array.isArray(list))
      return
    handlers.onNodes(safeNodes(list as Node[]))
    handlers.onError(null)
  }

  const fetchOnce = () =>
    api<NodesFrame>('/nodes')
      .then((frame) => {
        receive(frame.nodes)
      })
      .catch((e: unknown) => {
        if (stopped)
          return
        if (e instanceof ApiError && e.status === 401) {
          handlers.onClosed()
          return
        }
        handlers.onError(e instanceof Error ? e.message : String(e))
      })

  const startPolling = () => {
    poll ??= setInterval(fetchOnce, pollMs)
  }

  const connect = () => {
    if (stopped || socket)
      return
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`
    try {
      socket = new WebSocket(url)
    }
    catch {
      socket = null
      startPolling()
      retry = setTimeout(connect, reconnectMs)
      return
    }
    socket.onmessage = (event) => {
      try {
        receive((JSON.parse(event.data as string) as NodesFrame).nodes)
      }
      catch {
        socket?.close()
        return
      }
      // 流回来了，轮询只是替班
      if (poll) {
        clearInterval(poll)
        poll = null
      }
      if (retry) {
        clearTimeout(retry)
        retry = null
      }
    }
    socket.onerror = () => socket?.close()
    // 连接建立即撤销看门狗；看门狗只负责 CONNECTING 卡死的情况
    socket.onopen = () => {
      if (openTimer) {
        clearTimeout(openTimer)
        openTimer = null
      }
    }
    // 卡在 CONNECTING 的连接既不 open 也不 close，轮询永远等不到接管的机会；
    // 限时关闭，交给 onclose 走统一的轮询 + 重连路径
    if (openTimer)
      clearTimeout(openTimer)
    openTimer = setTimeout(() => socket?.close(), reconnectMs)
    socket.onclose = () => {
      socket = null
      if (openTimer) {
        clearTimeout(openTimer)
        openTimer = null
      }
      if (stopped)
        return
      startPolling()
      retry = setTimeout(connect, reconnectMs)
    }
  }

  fetchOnce()
  connect()

  return {
    stop() {
      stopped = true
      socket?.close()
      socket = null
      if (poll) {
        clearInterval(poll)
        poll = null
      }
      if (retry) {
        clearTimeout(retry)
        retry = null
      }
      if (openTimer) {
        clearTimeout(openTimer)
        openTimer = null
      }
    },
  }
}
