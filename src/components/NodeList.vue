<script setup lang="ts">
import type { Node } from '@/api/types'
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'
import NodePingListCell from '@/components/NodePingListCell.vue'
import TrafficProgress from '@/components/TrafficProgress.vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useNodeFormatters } from '@/composables/useNodeFormatters'
import { useAppStore } from '@/stores/app'
import { formatDateTime, getStatus } from '@/utils/helper'
import { formatOfflineTime, getDiskPercentage, getMemPercentage, getPriceTags, getRemainingTimeTagClass, getTrafficUsed, getTrafficUsedPercentage, showTrafficProgress } from '@/utils/nodeHelpers'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagSrc, getRegionDisplayName, hasCountry } from '@/utils/regionHelper'

interface ColumnConfig {
  key: string
  label: string
  width: string | number
  sortable: boolean
}

const props = defineProps<{
  nodes: Node[]
  transitionKey?: string
}>()

const emit = defineEmits<{
  click: [node: Node]
  pingClick: [node: Node]
}>()

const rowStaggerMs = 35
const rowStaggerLimit = 12

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const { formatBytes, formatBytesPerSecond, formatUptime } = useNodeFormatters()

const columns: ColumnConfig[] = [
  { key: 'status', label: '状态', width: '40px', sortable: true },
  { key: 'os', label: '系统', width: '40px', sortable: true },
  { key: 'name', label: '节点', width: 'minmax(160px, 1fr)', sortable: true },
  { key: 'cpu', label: 'CPU', width: '100px', sortable: true },
  { key: 'mem', label: '内存', width: '100px', sortable: true },
  { key: 'disk', label: '硬盘', width: '100px', sortable: true },
  { key: 'traffic', label: '流量', width: '100px', sortable: true },
  { key: 'rate', label: '速率', width: '80px', sortable: true },
  { key: 'networks', label: '三网', width: '136px', sortable: false },
]

const sortKey = ref<string>('')
const sortDir = ref<1 | -1>(1)

function handleSort(col: ColumnConfig) {
  if (!col.sortable)
    return
  if (sortKey.value === col.key) {
    sortDir.value = sortDir.value === 1 ? -1 : 1
  }
  else {
    sortKey.value = col.key
    sortDir.value = 1
  }
}

const sortedNodes = computed(() => {
  const nodes = [...props.nodes]
  const key = sortKey.value
  const dir = sortDir.value
  if (!key)
    return nodes
  return nodes.sort((a, b) => {
    switch (key) {
      case 'status': return dir * ((a.online ? 1 : 0) - (b.online ? 1 : 0))
      case 'name': {
        const va = (a.name || '').toLowerCase()
        const vb = (b.name || '').toLowerCase()
        return dir * (va < vb ? -1 : va > vb ? 1 : 0)
      }
      case 'os': {
        const va = (a.os || '').toLowerCase()
        const vb = (b.os || '').toLowerCase()
        return dir * (va < vb ? -1 : va > vb ? 1 : 0)
      }
      case 'cpu': return dir * ((a.metrics?.cpu ?? 0) - (b.metrics?.cpu ?? 0))
      case 'mem': return dir * (getMemPercentage(a) - getMemPercentage(b))
      case 'disk': return dir * (getDiskPercentage(a) - getDiskPercentage(b))
      case 'traffic':
        return dir * (getTrafficUsedPercentage(a) - getTrafficUsedPercentage(b))
      case 'rate':
        return dir * (((a.metrics?.net_tx ?? 0) + (a.metrics?.net_rx ?? 0)) - ((b.metrics?.net_tx ?? 0) + (b.metrics?.net_rx ?? 0)))
      default: return 0
    }
  })
})

const columnKeys = computed(() => columns.map(c => c.key))

const gridStyle = computed(() => ({
  gridTemplateColumns: columns.map(c => c.width).join(' '),
}))

const offlineOverlayContentStyle = computed(() => {
  const keys = columnKeys.value
  const statusIndex = keys.indexOf('status')
  const nameIndex = keys.indexOf('name')
  const startColumn = nameIndex !== -1
    ? nameIndex + 1
    : statusIndex === -1 ? 1 : statusIndex + 2
  return { gridColumn: `${startColumn} / -1` }
})

function handleClick(node: Node) {
  emit('click', node)
}

function openPingDialog(node: Node) {
  emit('pingClick', node)
}

function getRowTransitionKey(node: Node): string {
  return props.transitionKey ? `${props.transitionKey}-${node.id}` : String(node.id)
}

function getRowTransitionStyle(index: number): Record<string, string> {
  return {
    '--node-row-delay': `${Math.min(index, rowStaggerLimit) * rowStaggerMs}ms`,
  }
}
</script>

<template>
  <div class="overflow-x-auto overflow-y-hidden min-w-0 p-1 -m-1">
    <div class="min-w-fit w-full flex flex-col gap-1">
      <!-- 表头 -->
      <div
        class="grid gap-2 rounded-lg p-2"
        :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/60 backdrop-blur-sm')"
        :style="gridStyle"
      >
        <div
          v-for="col in columns" :key="col.key"
          :class="[col.sortable ? 'cursor-pointer' : '', ['status', 'os'].includes(col.key) ? 'text-center' : 'text-left']"
          @click="handleSort(col)"
        >
          <span class="text-xs text-muted-foreground">
            {{ col.label }}{{ col.sortable && sortKey === col.key ? (sortDir === 1 ? ' ↑' : ' ↓') : '' }}
          </span>
        </div>
      </div>

      <TransitionGroup
        :appear="!appStore.disablePageAnimation"
        :css="!appStore.disablePageAnimation"
        name="node-row-switch"
        tag="div"
        class="flex flex-col gap-1"
      >
        <div
          v-for="(node, index) in sortedNodes"
          :key="getRowTransitionKey(node)"
          class="relative flex h-16 cursor-pointer flex-col justify-center rounded-lg px-2 shadow-[0_0_4px,0_0_0_1px] shadow-transparent transition-all bg-background/60 hover:bg-background hover:shadow-emerald-600/10"
          :class="[pickSurfaceClass('', 'backdrop-blur-sm'), !node.online && '!shadow-red-600/10']"
          :style="getRowTransitionStyle(index)"
          @click="handleClick(node)"
        >
          <div class="grid gap-2 items-center" :style="gridStyle">
            <template v-for="col in columns" :key="col.key">
              <!-- 在线状态指示器 -->
              <div v-if="col.key === 'status'" class="flex justify-center">
                <div class="size-2 rounded-full relative" :class="[node.online ? 'bg-emerald-600' : 'bg-red-600']">
                  <div
                    class="animate-ping absolute inset-0 rounded-full opacity-50"
                    :class="[node.online ? 'bg-emerald-600' : 'bg-red-600']"
                  />
                </div>
              </div>

              <!-- 节点名称 -->
              <div v-else-if="col.key === 'name'" class="space-y-0.5" :class="[!node.online && 'blur-sm opacity-30']">
                <div class="flex gap-1 items-center text-xs font-semibold">
                  <img
                    v-if="hasCountry(node.country)" :src="getFlagSrc(node.country)"
                    :alt="getRegionDisplayName(node.country)" class="size-5 rounded-sm"
                  >
                  <span class="truncate">{{ node.name }}</span>
                </div>
                <div class="flex flex-row text-[11px] text-muted-foreground/70">
                  <DataTooltip
                    v-if="node.online && node.metrics" :content="formatUptime(node.metrics.uptime)" class="shrink-0" placement="right"
                    content-class="whitespace-pre-wrap left-0 ml-0 w-max"
                  >
                    <span>
                      {{ formatUptime(node.metrics.uptime, 'day') }}
                    </span>
                  </DataTooltip>
                  <DataTooltip
                    v-if="getPriceTags(node, appStore.lang).length > 0" placement="left"
                    :content="node.expires_at ? formatDateTime(node.expires_at, 'YYYY-MM-DD') : ''"
                    content-class="whitespace-nowrap right-0 mr-0"
                  >
                    <div class="truncate">
                      <template v-for="(tag, tagIndex) in getPriceTags(node, appStore.lang)" :key="tagIndex">
                        <span class="mx-1">·</span>
                        <span :class="tag.highlight ? getRemainingTimeTagClass(node) : ''">
                          {{ tag.text }}
                        </span>
                      </template>
                    </div>
                  </DataTooltip>
                </div>
              </div>

              <!-- 三网 -->
              <div v-else-if="col.key === 'networks'" class="flex flex-col gap-0.5">
                <NodePingListCell
                  :node-id="node.id"
                  :online="node.online"
                  role="button"
                  tabindex="0"
                  class="outline-none"
                  :aria-label="`${node.name} 延迟 / 丢包`"
                  @click.stop="openPingDialog(node)"
                  @keydown.enter.stop.prevent="openPingDialog(node)"
                  @keydown.space.stop.prevent="openPingDialog(node)"
                />
              </div>

              <!-- 操作系统 -->
              <div v-else-if="col.key === 'os'" class="flex justify-center">
                <img :src="getOSImage(node.os)" :alt="getOSName(node.os)" class="size-4">
              </div>

              <!-- CPU -->
              <div v-else-if="col.key === 'cpu'" class="group">
                <div class="space-y-1">
                  <div class="text-[10px] text-muted-foreground truncate">
                    <span class="inline group-hover:hidden">
                      {{ (node.metrics?.cpu ?? 0).toFixed(1) }}%
                    </span>
                    <span class="hidden group-hover:inline">
                      {{ node.metrics?.load?.[0]?.toFixed(2) ?? '0.00' }}, {{ node.metrics?.load?.[1]?.toFixed(2) ?? '0.00' }}, {{ node.metrics?.load?.[2]?.toFixed(2) ?? '0.00' }}
                    </span>
                  </div>
                  <ProgressThin :percentage="node.metrics?.cpu ?? 0" :status="getStatus(node.metrics?.cpu ?? 0)" :height="4" />
                </div>
              </div>

              <!-- 内存 -->
              <div v-else-if="col.key === 'mem'" class="group">
                <DataTooltip placement="top" class="block" :content-class="[!node.metrics?.swap_used && '!hidden']">
                  <div class="space-y-1">
                    <div class="text-[10px] text-muted-foreground truncate">
                      <span class="inline group-hover:hidden">
                        {{ getMemPercentage(node).toFixed(1) }}%
                      </span>
                      <span class="hidden group-hover:inline">
                        {{ formatBytes(node.metrics?.mem_used ?? 0) }} / {{ formatBytes(node.metrics?.mem_total ?? node.mem_total ?? 0) }}
                      </span>
                    </div>
                    <ProgressThin
                      :percentage="getMemPercentage(node)"
                      :status="getStatus(getMemPercentage(node))" :height="4"
                    />
                  </div>
                  <template #content>
                    <div class="flex items-center justify-between gap-3 whitespace-nowrap">
                      <span class="text-background/70">Swap</span>
                      <span>{{ formatBytes(node.metrics?.swap_used ?? 0) }}</span>
                    </div>
                  </template>
                </DataTooltip>
              </div>

              <!-- 硬盘 -->
              <div v-else-if="col.key === 'disk'" class="group">
                <div class="space-y-1">
                  <div class="text-[10px] text-muted-foreground truncate">
                    <span class="inline group-hover:hidden">
                      {{ getDiskPercentage(node).toFixed(1) }}%
                    </span>
                    <span class="hidden group-hover:inline">
                      {{ formatBytes(node.metrics?.disk_used ?? 0) }} / {{ formatBytes(node.metrics?.disk_total ?? node.disk_total ?? 0) }}
                    </span>
                  </div>
                  <ProgressThin
                    :percentage="getDiskPercentage(node)"
                    :status="getStatus(getDiskPercentage(node))" :height="4"
                  />
                </div>
              </div>

              <!-- 流量 -->
              <div v-else-if="col.key === 'traffic'" class="group">
                <DataTooltip placement="top" class="flex items-center gap-2" content-class="mb-1.5">
                  <div class="space-y-1 w-full">
                    <div class="text-[10px] text-muted-foreground truncate">
                      <span class="inline group-hover:hidden">
                        {{ getTrafficUsedPercentage(node).toFixed(1) }}%
                      </span>
                      <span class="hidden group-hover:inline">
                        {{ formatBytes(getTrafficUsed(node)) }} /
                        <template v-if="showTrafficProgress(node)">{{ formatBytes(node.traffic_limit) }}</template>
                        <template v-else>∞</template>
                      </span>
                    </div>
                    <TrafficProgress :node="node" height="4px" />
                  </div>
                  <template #content>
                    <span class="flex flex-row gap-0.5 items-center whitespace-nowrap">
                      <Icon icon="tabler:chevron-up" width="12" height="12" />
                      {{ formatBytes(node.month_tx) }}
                    </span>
                    <span class="flex flex-row gap-0.5 items-center whitespace-nowrap">
                      <Icon icon="tabler:chevron-down" width="12" height="12" />
                      {{ formatBytes(node.month_rx) }}
                    </span>
                  </template>
                </DataTooltip>
              </div>

              <!-- 速率 -->
              <div v-else-if="col.key === 'rate'">
                <div class="text-[10px] flex flex-col ">
                  <span class="text-emerald-600 flex flex-row gap-1 items-center">
                    <Icon icon="tabler:chevron-up" width="12" height="12" />
                    {{ formatBytesPerSecond(node.metrics?.net_tx ?? 0) }}
                  </span>
                  <span class="text-blue-600 flex flex-row gap-1 items-center">
                    <Icon icon="tabler:chevron-down" width="12" height="12" />
                    {{ formatBytesPerSecond(node.metrics?.net_rx ?? 0) }}
                  </span>
                </div>
              </div>
            </template>
          </div>

          <div
            v-if="!node.online" class="absolute inset-0 z-2 p-2 bg-background/10 rounded-lg flex items-center"
            aria-hidden="true"
          >
            <div class="grid gap-2 items-center justify-center" :style="gridStyle">
              <div class="h-full space-y-1" :style="offlineOverlayContentStyle">
                <div class="text-sm font-semibold truncate">
                  <span class="text-red-500">离线</span> {{ node.name }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ formatOfflineTime(node) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.node-row-switch-enter-active,
.node-row-switch-leave-active {
  transition:
    opacity 170ms ease,
    transform 210ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 170ms ease;
}

.node-row-switch-enter-active {
  transition-delay: var(--node-row-delay, 0ms);
}

.node-row-switch-move {
  transition: transform 210ms cubic-bezier(0.22, 1, 0.36, 1);
}

.node-row-switch-enter-from {
  opacity: 0;
  transform: translateY(8px);
  filter: blur(3px);
}

.node-row-switch-leave-to {
  opacity: 0;
  transform: translateY(-5px);
  filter: blur(2px);
}

@media (prefers-reduced-motion: reduce) {
  .node-row-switch-enter-active,
  .node-row-switch-leave-active,
  .node-row-switch-move {
    transition: none;
    transition-delay: 0ms;
  }

  .node-row-switch-enter-from,
  .node-row-switch-leave-to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}
</style>
