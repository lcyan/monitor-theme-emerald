import type { LiveHandle } from '@/api/live'
import type { Node } from '@/api/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { startLive } from '@/api/live'

const EARTH_SNAPSHOT_INTERVAL_MS = 60_000

const useNodesStore = defineStore('nodes', () => {
  /** hub 已按 sort, id 排序，保持原序即可 */
  const nodes = ref<Node[]>([])
  /** 首帧已到达（来自 WS 或轮询） */
  const loaded = ref(false)
  /** hub 以 401 应答：本页加载后公开页已被关闭 */
  const closed = ref(false)
  const error = ref<string | null>(null)

  /** Earth 视图共享采样快照，避免 globe / maps 各自维护定时器 */
  const earthNodes = ref<Node[]>([])
  let lastEarthSnapshotAt = 0
  let handle: LiveHandle | null = null

  const totalCount = computed(() => nodes.value.length)
  const onlineCount = computed(() => nodes.value.filter(n => n.online).length)

  /** 分组按节点首次出现顺序去重，即站长的节点排序决定分组顺序 */
  const groups = computed(() => [...new Set(nodes.value.map(n => n.group ?? '').filter(Boolean))])

  const nodesById = computed(() => {
    const map = new Map<number, Node>()
    for (const node of nodes.value)
      map.set(node.id, node)
    return map
  })

  function nodeById(id: number): Node | undefined {
    return nodesById.value.get(id)
  }

  function refreshEarthNodes(force = false): void {
    const now = Date.now()
    if (!force && now - lastEarthSnapshotAt < EARTH_SNAPSHOT_INTERVAL_MS)
      return
    earthNodes.value = [...nodes.value]
    lastEarthSnapshotAt = now
  }

  function applyNodes(list: Node[]): void {
    nodes.value = list
    loaded.value = true
    error.value = null
    closed.value = false
    refreshEarthNodes()
  }

  /** 启动实时流（WS 推送，断开时 5s 轮询接管）。重复调用是幂等的 */
  function start(): void {
    if (handle)
      return
    handle = startLive({
      onNodes: applyNodes,
      onClosed: () => {
        closed.value = true
        error.value = null
      },
      onError: (message) => {
        error.value = message
      },
    })
  }

  function stop(): void {
    handle?.stop()
    handle = null
  }

  function clearNodes(): void {
    nodes.value = []
    loaded.value = false
    closed.value = false
    error.value = null
    refreshEarthNodes(true)
  }

  return {
    nodes,
    earthNodes,
    loaded,
    closed,
    error,
    totalCount,
    onlineCount,
    groups,
    nodesById,
    nodeById,
    start,
    stop,
    clearNodes,
  }
})

export { useNodesStore }
