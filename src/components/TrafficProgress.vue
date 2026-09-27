<script setup lang="ts">
import type { Node } from '@/api/types'
import { computed } from 'vue'
import { formatBytes } from '@/utils/helper'

export interface TrafficProgressProps {
  node: Node
  uploadColor?: string
  downloadColor?: string
  singleColor?: string
  height?: number | string
  showIndicator?: boolean
}

const props = withDefaults(defineProps<TrafficProgressProps>(), {
  uploadColor: undefined,
  downloadColor: undefined,
  singleColor: undefined,
  height: undefined,
  showIndicator: false,
})

const showProgress = computed(() => props.node.traffic_limit > 0)

/** hub 已按 traffic_mode 折算好 month_used；旧版 hub 缺省时按双向求和 */
const usedTraffic = computed(() => props.node.month_used ?? (props.node.month_rx + props.node.month_tx))

const totalPercentage = computed(() => {
  if (props.node.traffic_limit <= 0)
    return 0
  return Math.min((usedTraffic.value / props.node.traffic_limit) * 100, 100)
})

/** up 计上行（tx），down 计下行（rx） */
const uploadPercentage = computed(() => {
  if (props.node.traffic_limit <= 0)
    return 0
  return Math.min((props.node.month_tx / props.node.traffic_limit) * 100, 100)
})

const downloadPercentage = computed(() => {
  if (props.node.traffic_limit <= 0)
    return 0
  return Math.min((props.node.month_rx / props.node.traffic_limit) * 100, 100)
})

/** sum 与 max 以双向两条呈现；up/down 只画对应方向的单一进度 */
const isDualColorMode = computed(() => props.node.traffic_mode !== 'up' && props.node.traffic_mode !== 'down')

const singlePercentage = computed(() => (props.node.traffic_mode === 'up' ? uploadPercentage.value : downloadPercentage.value))

const progressHeight = computed(() => {
  if (props.height === undefined)
    return undefined
  return typeof props.height === 'number' ? `${props.height}px` : props.height
})
</script>

<template>
  <div class="traffic-progress">
    <div v-if="isDualColorMode" class="traffic-progress__rail bg-muted" :style="{ height: progressHeight }">
      <div class="traffic-progress__fill bg-green-600" :style="{ width: `${uploadPercentage}%` }" />
      <div
        class="traffic-progress__fill traffic-progress__fill--last bg-blue-600"
        :style="{ width: `${downloadPercentage}%` }"
      />
    </div>

    <div v-else class="traffic-progress__rail bg-muted" :style="{ height: progressHeight }">
      <div
        class="traffic-progress__fill traffic-progress__fill--last bg-green-600"
        :style="{ width: `${singlePercentage}%` }"
      />
    </div>

    <div v-if="showIndicator && showProgress" class="traffic-progress__indicator">
      <span>{{ totalPercentage.toFixed(1) }}%</span>
      <span class="traffic-progress__indicator-detail">
        {{ formatBytes(usedTraffic) }} / {{ formatBytes(props.node.traffic_limit) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.traffic-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.traffic-progress__rail {
  position: relative;
  display: flex;
  overflow: hidden;
  height: 8px;
  border-radius: 5px;
  transition: background-color 0.3s;
}

.traffic-progress__fill {
  position: relative;
  height: 100%;
  transition:
    max-width 0.2s,
    width 0.2s,
    background-color 0.3s;
}

.traffic-progress__fill--last {
  border-top-right-radius: 5px;
  border-bottom-right-radius: 5px;
}

.traffic-progress__indicator {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: hsl(var(--foreground) / 0.8);
}

.traffic-progress__indicator-detail {
  color: hsl(var(--muted-foreground));
}
</style>
