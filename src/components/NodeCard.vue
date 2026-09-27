<script setup lang="ts">
import type { Node } from '@/api/types'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useNodeFormatters } from '@/composables/useNodeFormatters'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'
import { useAppStore } from '@/stores/app'
import { formatDateTime, getStatus } from '@/utils/helper'
import { getDiskPercentage, getExpireTextClass, getMemPercentage, getPriceTags, getTrafficUsed, getTrafficUsedPercentage, showTrafficProgress } from '@/utils/nodeHelpers'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagSrc, getRegionDisplayName, hasCountry } from '@/utils/regionHelper'

const props = defineProps<{ node: Node }>()

const emit = defineEmits<{
  click: []
  pingClick: [node: Node]
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const { formatBytes, formatBytesPerSecond, formatUptime } = useNodeFormatters()

const offlineTime = computed(() => props.node.last_seen ? formatDateTime(new Date(props.node.last_seen * 1000)) : '')
const expiredDate = computed(() => props.node.expires_at ? formatDateTime(props.node.expires_at, 'YYYY-MM-DD') : '')

const cpu = computed(() => props.node.metrics?.cpu ?? 0)
const cpuStatus = computed(() => getStatus(cpu.value))
const memPercentage = computed(() => getMemPercentage(props.node))
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => getDiskPercentage(props.node))
const diskStatus = computed(() => getStatus(diskPercentage.value))

const {
  latencyRenderBars,
  lossRenderBars,
  latencyDisplay,
  lossDisplay,
  latencyPanelTooltip,
  lossPanelTooltip,
  topPingNetworks,
} = useNodePingDisplay(() => props.node.id)

const trafficUsedPercentage = computed(() => getTrafficUsedPercentage(props.node))
const trafficUsed = computed(() => getTrafficUsed(props.node))
const priceTags = computed(() => getPriceTags(props.node, appStore.lang))
const remainingTimeTagClass = computed(() => getExpireTextClass(props.node))

function openPingDialog() {
  emit('pingClick', props.node)
}
</script>

<template>
  <CardX
    hoverable
    class="node-card h-full w-full cursor-pointer border-none shadow-[0_0_0_1px] shadow-transparent transition-all duration-200 rounded-md bg-background/60 hover:bg-background hover:shadow-emerald-600/10 hover:shadow-[0_0_20px,0_0_0_1px] hover:-translate-y-0.5 hover:z-1"
    :class="[pickSurfaceClass('', 'backdrop-blur-sm'), !props.node.online && 'shadow-[0_0_0_1px] !shadow-red-600/20']"
    @click="emit('click')"
  >
    <template #header>
      <div class="flex gap-2 min-w-0 items-center">
        <div class="size-2 rounded-full relative" :class="[props.node.online ? 'bg-emerald-600' : 'bg-red-600']">
          <div
            class="animate-ping absolute inset-0 rounded-full opacity-50"
            :class="[props.node.online ? 'bg-emerald-600' : 'bg-red-600']"
          />
        </div>
        <div class="text-md font-bold flex-1 min-w-0 truncate">
          {{ props.node.name }}
        </div>
      </div>
    </template>

    <template #header-extra>
      <div class="flex gap-2 items-center">
        <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-4">
        <img
          v-if="hasCountry(props.node.country)" :src="getFlagSrc(props.node.country)"
          :alt="getRegionDisplayName(props.node.country)" class="size-5 shrink-0"
        >
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-3">
        <div class="gap-x-3 gap-y-1 grid grid-cols-2">
          <!-- CPU -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                CPU
              </span>
              <span>{{ cpu.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="cpu" :status="cpuStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ props.node.metrics?.load?.[0]?.toFixed(2) ?? '0.00' }}, {{ props.node.metrics?.load?.[1]?.toFixed(2) ?? '0.00' }}, {{ props.node.metrics?.load?.[2]?.toFixed(2) ?? '0.00' }}
            </div>
          </div>

          <!-- 内存 -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                内存
              </span>
              <span>{{ memPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="memPercentage" :status="memStatus" :height="4" />
            <DataTooltip placement="top" class="block" :content-class="[!props.node.metrics?.swap_used && '!hidden']">
              <div class="text-[11px] text-muted-foreground truncate">
                {{ formatBytes(props.node.metrics?.mem_used ?? 0) }} / {{ formatBytes(props.node.metrics?.mem_total ?? props.node.mem_total ?? 0) }}
              </div>
              <template #content>
                <div class="flex items-center justify-between gap-3 whitespace-nowrap">
                  <span class="text-background/70">Swap</span>
                  <span>{{ formatBytes(props.node.metrics?.swap_used ?? 0) }}</span>
                </div>
              </template>
            </DataTooltip>
          </div>

          <!-- 硬盘 -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                硬盘
              </span>
              <span>{{ diskPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="diskPercentage" :status="diskStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.metrics?.disk_used ?? 0) }} / {{ formatBytes(props.node.metrics?.disk_total ?? props.node.disk_total ?? 0) }}
            </div>
          </div>

          <!-- 流量进度条 -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                流量
              </span>
              <span>{{ trafficUsedPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="trafficUsedPercentage" status="success" :height="4" />
            <DataTooltip placement="top" class="block">
              <div class="whitespace-pre-wrap text-[11px] text-muted-foreground truncate">
                {{ formatBytes(trafficUsed) }} /
                <template v-if="showTrafficProgress(props.node)">
                  {{ formatBytes(props.node.traffic_limit) }}
                </template>
                <template v-else>
                  ∞
                </template>
              </div>
              <template #content>
                <div class="flex items-center justify-between gap-3 whitespace-nowrap">
                  <div class="text-[11px] flex flex-col">
                    <div class="flex flex-row items-center gap-1">
                      <Icon icon="tabler:chevron-up" width="12" height="12" />
                      {{ formatBytes(props.node.month_tx) }}
                    </div>
                    <div class="flex flex-row items-center gap-1">
                      <Icon icon="tabler:chevron-down" width="12" height="12" />
                      {{ formatBytes(props.node.month_rx) }}
                    </div>
                  </div>
                </div>
              </template>
            </DataTooltip>
          </div>
        </div>
        <div class="relative text-[11px] text-muted-foreground">
          <div
            v-if="!props.node.online"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center space-y-1"
          >
            <span class="text-sm text-red-600">离线</span>
            <div>{{ offlineTime }}</div>
          </div>
          <div class="flex flex-col gap-y-2" :class="[!props.node.online && 'blur-xs opacity-60 pointer-events-none']">
            <div class="flex items-center">
              <span class="truncate">
                速率
              </span>
              <div class="border-t-2 border-dotted border-gray-500/10 mx-2 flex-1" />
              <div class="truncate flex flex-row gap-1">
                <div class="text-green-600 flex flex-row items-center gap-1">
                  <Icon icon="tabler:chevron-up" width="12" height="12" />
                  {{ formatBytesPerSecond(props.node.metrics?.net_tx ?? 0) }}
                </div>
                <div class="text-blue-600 flex flex-row items-center gap-1">
                  <Icon icon="tabler:chevron-down" width="12" height="12" />
                  {{ formatBytesPerSecond(props.node.metrics?.net_rx ?? 0) }}
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between">
              <span class="truncate">
                在线
              </span>
              <div class="border-t-2 border-dotted border-gray-500/10 mx-2 flex-1" />
              <span class="truncate">
                {{ props.node.metrics && props.node.metrics.uptime > 0 ? formatUptime(props.node.metrics.uptime) : '' }}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="truncate">
                费用
              </span>
              <div class="border-t-2 border-dotted border-gray-500/10 mx-2 flex-1" />
              <DataTooltip v-if="expiredDate" placement="left" :content="expiredDate" content-class="whitespace-nowrap right-0 mr-0">
                <span class="truncate flex flex-row gap-1">
                  <template v-for="(tag, index) in priceTags" :key="tag.text">
                    <span class="inline-flex flex-row gap-1 items-center">
                      <span :class="tag.highlight ? remainingTimeTagClass : ''">{{ tag.text }}</span>
                    </span>
                    <span v-if="index < priceTags.length - 1">·</span>
                  </template>
                </span>
              </DataTooltip>
              <span v-else class="truncate flex flex-row gap-1">
                <template v-for="(tag, index) in priceTags" :key="tag.text">
                  <span class="inline-flex flex-row gap-1 items-center">
                    <span :class="tag.highlight ? remainingTimeTagClass : ''">{{ tag.text }}</span>
                  </span>
                  <span v-if="index < priceTags.length - 1">·</span>
                </template>
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="truncate">
                三网
              </span>
              <div class="border-t-2 border-dotted border-gray-500/10 mx-2 flex-1" />
              <div v-if="topPingNetworks.length > 0" class="flex flex-row">
                <DataTooltip
                  v-for="(net, index) in topPingNetworks" :key="net.name" placement="top"
                  :content="`${net.name}\n${net.latency}`" content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
                >
                  <div class="truncate">
                    <span v-if="index" class="mx-1">·</span>
                    <span :class="net.toneClass">{{ net.latency }}</span>
                  </div>
                </DataTooltip>
              </div>
              <div v-else class="truncate">
                N/A
              </div>
            </div>
            <div class="grid grid-cols-6 gap-x-3">
              <!-- 延迟 -->
              <div
                role="button" tabindex="0"
                class="group/panel relative col-span-3 flex h-6 cursor-pointer flex-col gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :title="latencyPanelTooltip" :aria-label="`${props.node.name} 延迟`" @click.stop="openPingDialog"
                @keydown.enter.stop.prevent="openPingDialog" @keydown.space.stop.prevent="openPingDialog"
              >
                <div class="flex items-center justify-between text-[11px] leading-none relative">
                  <span class="text-muted-foreground">延迟</span>
                  <div class="border-t-2 border-dotted border-gray-500/10 mx-2 flex-1" />
                  <span class="font-medium text-foreground/85">{{ latencyDisplay }}</span>
                </div>
                <div
                  class="grid h-full items-end gap-[1px]"
                  :style="{ gridTemplateColumns: `repeat(${latencyRenderBars.length}, minmax(0, 1fr))` }"
                >
                  <DataTooltip
                    v-for="bar in latencyRenderBars" :key="bar.key" placement="top" :content="bar.tooltip"
                    class="h-full w-full" content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
                  >
                    <span
                      class="block h-full w-full rounded-[1px] transition-transform duration-150 group-hover/data-tooltip:scale-y-200"
                      :class="bar.className"
                    />
                  </DataTooltip>
                </div>
              </div>
              <!-- 丢包 -->
              <div
                role="button" tabindex="0"
                class="group/panel relative col-span-3 flex h-6 cursor-pointer flex-col gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :title="lossPanelTooltip" :aria-label="`${props.node.name} 丢包`" @click.stop="openPingDialog"
                @keydown.enter.stop.prevent="openPingDialog" @keydown.space.stop.prevent="openPingDialog"
              >
                <div class="flex items-center justify-between text-[11px] leading-none">
                  <span class="text-muted-foreground">丢包</span>
                  <div class="border-t-2 border-dotted border-gray-500/10 mx-2 flex-1" />
                  <span class="font-medium text-foreground/85">{{ lossDisplay }}</span>
                </div>
                <div
                  class="grid h-full items-end gap-[1px]"
                  :style="{ gridTemplateColumns: `repeat(${lossRenderBars.length}, minmax(0, 1fr))` }"
                >
                  <DataTooltip
                    v-for="bar in lossRenderBars" :key="bar.key" placement="top" :content="bar.tooltip"
                    class="h-full w-full" content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
                  >
                    <span
                      class="block h-full w-full rounded-[1px] transition-transform duration-150 group-hover/data-tooltip:scale-y-200"
                      :class="bar.className"
                    />
                  </DataTooltip>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </CardX>
</template>

<style scoped>
.node-card {
  position: relative;
}
</style>
