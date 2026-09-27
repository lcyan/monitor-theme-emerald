<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { onScopeDispose, ref } from 'vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'

const props = defineProps<{
  nodeId: number
  online: boolean
}>()

// 只对视口内的节点发起延迟查询；离开视口即停，再次进入时由 TTL 缓存兜底
const rootRef = ref<HTMLElement | null>(null)
const visible = ref(false)
const { stop } = useIntersectionObserver(rootRef, ([entry]) => {
  visible.value = !!entry?.isIntersecting
}, { threshold: 0 })

const {
  latencyRenderBars,
  lossRenderBars,
  topPingNetworks,
} = useNodePingDisplay(() => props.nodeId, { enabled: visible })

onScopeDispose(() => stop())
</script>

<template>
  <div ref="rootRef" class="flex flex-col">
    <div v-if="topPingNetworks.length > 0" class="flex flex-row">
      <DataTooltip
        v-for="(net, index) in topPingNetworks" :key="net.name" placement="top"
        :content="`${net.name}\n${net.latency}`"
        content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
      >
        <div class="truncate text-[10px]">
          <span v-if="index" class="mx-1">·</span>
          <span :class="net.toneClass">{{ net.latency }}</span>
        </div>
      </DataTooltip>
    </div>
    <div v-else class="truncate">
      N/A
    </div>
    <div class="flex flex-col gap-[1px] w-full pr-4">
      <div class="relative items-center gap-1">
        <div
          class="grid h-1 cursor-auto items-end gap-[1px] transition-all hover:h-2.5"
          :style="{ gridTemplateColumns: `repeat(${latencyRenderBars.length}, minmax(0, 1fr))` }"
        >
          <DataTooltip
            v-for="bar in latencyRenderBars" :key="bar.key" placement="top" :content="bar.tooltip"
            class="h-full w-full" content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
          >
            <span
              class="block h-full w-full rounded-[1px] transition-all hover:scale-y-160"
              :class="bar.className"
            />
          </DataTooltip>
        </div>
      </div>
      <div class="relative items-center gap-1">
        <div
          class="grid h-1 cursor-auto items-end gap-[1px] transition-all hover:h-2.5"
          :style="{ gridTemplateColumns: `repeat(${lossRenderBars.length}, minmax(0, 1fr))` }"
        >
          <DataTooltip
            v-for="bar in lossRenderBars" :key="bar.key" placement="top" :content="bar.tooltip"
            class="h-full w-full" content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
          >
            <span
              class="block h-full w-full rounded-[1px] transition-all hover:scale-y-160"
              :class="bar.className"
            />
          </DataTooltip>
        </div>
      </div>
    </div>
  </div>
</template>
