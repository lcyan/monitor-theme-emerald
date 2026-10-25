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

/** ?gzip 的解压依赖 DecompressionStream；没有它的环境退回纯文本帧 */
const canGzip = () => typeof DecompressionStream !== 'undefined'

/**
 * 一帧可能是文本，也可能是 gzip 压缩的二进制（浏览器 WS 默认给 Blob，
 * 也可能是 ArrayBuffer；非浏览器运行时会给 Uint8Array）。解不开或解出的
 * 不是 JSON 都交给调用方按坏帧处理。
 */
async function decodeFrame(data: unknown): Promise<string> {
  if (typeof data === 'string')
    return data
  const buffer = data instanceof ArrayBuffer
    ? data
    : data instanceof Uint8Array
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      : await (data as Blob).arrayBuffer()
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

/**
 * 实时节点的唯一来源：先取一次 /api/nodes 让页面尽快有数据，随后连
 * /api/ws?gzip（hub 每 2s 推一帧压缩快照）。流断开后轮询接管，并持续尝试
 * 重连——hub 重启会断开每一条流，不重连的话，比部署活得久的页面会以 1/5
 * 的速率默默轮询到永远；WS 收到帧即停轮询。标签页隐藏时断流停轮询，回
 * 前台立即拉一次 /api/nodes 并重连。所有定时器只在这里持有，返回的
 * stop() 负责清场。
 */
export function startLive(handlers: LiveHandlers, options: LiveOptions = {}): LiveHandle {
  const pollMs = options.pollMs ?? POLL_MS
  const reconnectMs = options.reconnectMs ?? RECONNECT_MS
  let socket: WebSocket | null = null
  let poll: ReturnType<typeof setInterval> | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let openTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let hidden = false

  function receive(list: unknown): void {
    if (stopped || !Array.isArray(list))
      return
    handlers.onNodes(safeNodes(list as Node[]))
    handlers.onError(null)
  }

  /** 撤销 socket 上的回调再关闭，避免 onclose 把轮询/重连又拉起来 */
  function dropSocket(): void {
    if (!socket)
      return
    const s = socket
    socket = null
    s.onclose = null
    s.onerror = null
    s.onmessage = null
    s.onopen = null
    s.close()
  }

  function clearTimers(): void {
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
  }

  function stop(): void {
    stopped = true
    dropSocket()
    clearTimers()
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onVisibility)
  }

  function fetchOnce(): void {
    api<NodesFrame>('/nodes')
      .then((frame) => {
        receive(frame.nodes)
      })
      .catch((e: unknown) => {
        if (stopped)
          return
        if (e instanceof ApiError && e.status === 401) {
          handlers.onClosed()
          // 公开页已关：继续轮询与重连只会一遍遍吃 401
          stop()
          return
        }
        handlers.onError(e instanceof Error ? e.message : String(e))
      })
  }

  function startPolling(): void {
    poll ??= setInterval(fetchOnce, pollMs)
  }

  // 流回来了，轮询只是替班
  function frameReceived(): void {
    if (poll) {
      clearInterval(poll)
      poll = null
    }
    if (retry) {
      clearTimeout(retry)
      retry = null
    }
  }

  function connect(): void {
    if (stopped || hidden || socket)
      return
    const gzip = canGzip() ? '?gzip' : ''
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws${gzip}`
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
      const sender = socket
      void decodeFrame(event.data)
        .then((raw) => {
          // 解压是异步的：等帧落地时连接可能已换人，旧连接的帧不算「流回来了」
          if (socket !== sender)
            return
          receive((JSON.parse(raw) as NodesFrame).nodes)
          frameReceived()
        })
        .catch(() => {
          if (socket === sender)
            sender?.close()
        })
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
      if (stopped || hidden)
        return
      startPolling()
      retry = setTimeout(connect, reconnectMs)
    }
  }

  function onVisibility(): void {
    if (stopped)
      return
    if (document.hidden) {
      hidden = true
      dropSocket()
      clearTimers()
    }
    else if (hidden) {
      hidden = false
      fetchOnce()
      connect()
    }
  }

  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', onVisibility)

  fetchOnce()
  connect()

  return { stop }
}
