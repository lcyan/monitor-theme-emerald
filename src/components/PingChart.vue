<script setup lang="ts">
import type { PingRow } from '@/api/types'
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { fetchHistory } from '@/api/history'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useAppStore } from '@/stores/app'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  nodeId: number
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const isDark = computed(() => appStore.isDark)

// 图表主题相关颜色
const chartThemeColors = computed(() => ({
  text: isDark.value ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
  textSecondary: isDark.value ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
  textTertiary: isDark.value ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
  borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
  splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  tooltipBg: isDark.value ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.8)',
  tooltipShadow: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.06)',
  crosshairColor: isDark.value ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
}))

// 多探测时的曲线配色
const chartColors = [
  '#FF6B6B', // 珊瑚红
  '#4ECDC4', // 青绿色
  '#A78BFA', // 紫罗兰
  '#60A5FA', // 天蓝色
  '#FFB347', // 琥珀黄
  '#F472B6', // 粉红色
  '#34D399', // 翠绿色
  '#FB923C', // 橙色
]

// 与 hub 的窗口上限对齐：匿名 ≤168h，登录 ≤2160h（超出部分 hub 会静默 clamp）
const presetViews = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '1 天', hours: 24 },
  { label: '7 天', hours: 168 },
  ...(appStore.authed
    ? [
        { label: '30 天', hours: 720 },
        { label: '90 天', hours: 2160 },
      ]
    : []),
]

const selectedView = ref('')
const selectedHours = computed(() => presetViews.find(v => v.label === selectedView.value)?.hours ?? 1)

// ==================== 数据状态 ====================

interface TaskInfo {
  id: number
  name: string
  rows: PingRow[]
  loss: number
  latest: number | null
  avg: number | null
  min: number | null
  max: number | null
}

const rows = shallowRef<PingRow[]>([])
const probes = shallowRef<Record<string, string>>({})
const windowLoss = shallowRef<Record<string, number>>({})
const loading = ref(false)
const error = ref<string | null>(null)
let fetchRequestId = 0

// 探测选择
const selectedTaskIds = ref<number[]>([])
const showDelay = ref(true)
const showLoss = ref(true)
const showBand = ref(true)
const chartMargin = { top: 30, right: 24, bottom: 52, left: 56 }

// 与 hub 的分桶预算对齐
const HISTORY_POINTS = 700

// 探测按行首次出现顺序（hub 已按后台顺序排好行）
const tasks = computed<TaskInfo[]>(() => {
  const byTask = new Map<number, PingRow[]>()
  for (const row of rows.value) {
    const list = byTask.get(row.task_id) ?? []
    list.push(row)
    byTask.set(row.task_id, list)
  }

  return Array.from(byTask.entries(), ([id, taskRows]) => {
    const latencies = taskRows.map(r => r.latency).filter((v): v is number => v !== null)
    let min: number | null = null
    let max: number | null = null
    for (const row of taskRows) {
      if (row.band) {
        min = min === null ? row.band[0] : Math.min(min, row.band[0])
        max = max === null ? row.band[1] : Math.max(max, row.band[1])
      }
    }
    if (min === null && latencies.length) {
      min = Math.min(...latencies)
      max = Math.max(...latencies)
    }
    return {
      id,
      name: probes.value[String(id)] ?? `Ping ${id}`,
      rows: taskRows,
      // 窗口丢包率只用响应的 loss，不平均行内值
      loss: windowLoss.value[String(id)] ?? 0,
      latest: taskRows.length ? taskRows.at(-1)!.latency : null,
      avg: latencies.length ? latencies.reduce((sum, v) => sum + v, 0) / latencies.length : null,
      min,
      max,
    }
  })
})

// ==================== 数据获取 ====================

async function fetchRecords() {
  if (!props.nodeId)
    return

  const requestId = ++fetchRequestId
  loading.value = true
  error.value = null

  try {
    const response = await fetchHistory(props.nodeId, {
      hours: selectedHours.value,
      points: HISTORY_POINTS,
      series: 'ping',
    })

    if (requestId !== fetchRequestId)
      return

    rows.value = response.ping
    probes.value = response.probes
    windowLoss.value = response.loss
    selectedTaskIds.value = tasks.value.map(t => t.id)
  }
  catch (err) {
    if (requestId !== fetchRequestId)
      return

    error.value = err instanceof Error ? err.message : '获取数据失败'
    rows.value = []
    probes.value = {}
    windowLoss.value = {}
    selectedTaskIds.value = []
  }
  finally {
    if (requestId === fetchRequestId) {
      loading.value = false
    }
  }
}

// ==================== 数据处理 ====================

/**
 * 按时间戳合并选中探测的行。hub 把各探测放在同一分桶网格上，
 * 行内 latency=null 的桶即超时；loss 只做标记，不参与延迟曲线。
 */
interface MergedPoint {
  ts: number
  time: string
  values: Record<number, number | null>
  bands: Record<number, [number, number] | undefined>
  lossIndexes: Record<number, boolean>
}

const mergedData = computed<MergedPoint[]>(() => {
  const selected = tasks.value.filter(t => selectedTaskIds.value.includes(t.id))
  if (!selected.length)
    return []

  const grouped = new Map<number, MergedPoint>()
  for (const task of selected) {
    for (const row of task.rows) {
      let point = grouped.get(row.ts)
      if (!point) {
        point = { ts: row.ts, time: new Date(row.ts * 1000).toISOString(), values: {}, bands: {}, lossIndexes: {} }
        grouped.set(row.ts, point)
      }
      point.values[task.id] = row.latency
      if (row.band)
        point.bands[task.id] = row.band
      if ((row.loss ?? 0) > 0)
        point.lossIndexes[task.id] = true
    }
  }

  return Array.from(grouped.values()).sort((a, b) => a.ts - b.ts)
})

function getTaskColor(taskId: number): string {
  const taskIndex = tasks.value.findIndex(t => t.id === taskId)
  const safeIndex = Math.max(0, taskIndex % chartColors.length)
  return chartColors[safeIndex]!
}

const selectedTasks = computed(() => tasks.value.filter(t => selectedTaskIds.value.includes(t.id)))

// 切换探测选中状态
function toggleTask(taskId: number) {
  if (selectedTaskIds.value.includes(taskId)) {
    selectedTaskIds.value = selectedTaskIds.value.filter(id => id !== taskId)
  }
  else {
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function hideAllTasks() {
  selectedTaskIds.value = []
}

// ==================== 图表配置 ====================

const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: false,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 6,
  textStyle: {
    color: chartThemeColors.value.text,
    fontSize: 12,
    lineHeight: 20,
  },
  extraCssText: `backdrop-filter: blur(5px);z-index:9;box-shadow:0 0 0 1px ${chartThemeColors.value.tooltipShadow}, 0 0 16px ${chartThemeColors.value.tooltipShadow}`,
  axisPointer: {
    type: 'cross' as const,
    crossStyle: {
      color: chartThemeColors.value.textTertiary,
    },
    lineStyle: {
      color: chartThemeColors.value.crosshairColor,
      width: 1,
      type: 'dashed' as const,
    },
    shadowStyle: {
      color: chartThemeColors.value.crosshairColor,
    },
  },
}))

function formatTime(ts: number, showDate: boolean): string {
  const date = dayjs(ts * 1000)
  return showDate ? date.format('M/D HH:mm') : date.format('HH:mm')
}

function formatTimeForTooltip(ts: number, hours: number): string {
  const date = dayjs(ts * 1000)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

const showDateInAxis = computed(() => selectedHours.value >= 24)

const pingChartOption = computed(() => {
  const taskList = selectedTasks.value
  const data = mergedData.value
  const hours = selectedHours.value

  // band 色带：min 基线 + (max-min) 增量堆叠成 ribbon
  const series: Record<string, unknown>[] = []
  for (const task of taskList) {
    const hasBand = data.some(point => point.bands[task.id])
    const color = getTaskColor(task.id)
    const lossIndexes = data
      .map((point, index) => (point.lossIndexes[task.id] ? index : -1))
      .filter(index => index >= 0)

    if (hasBand && showBand.value) {
      series.push(
        {
          name: `${task.name} band-base`,
          type: 'line',
          stack: `band-${task.id}`,
          data: data.map(point => point.bands[task.id]?.[0] ?? null),
          lineStyle: { opacity: 0 },
          symbol: 'none',
          silent: true,
          tooltip: { show: false },
          legendHoverLink: false,
        },
        {
          name: `${task.name} band`,
          type: 'line',
          stack: `band-${task.id}`,
          data: data.map((point) => {
            const band = point.bands[task.id]
            return band ? band[1] - band[0] : null
          }),
          lineStyle: { opacity: 0 },
          symbol: 'none',
          silent: true,
          tooltip: { show: false },
          legendHoverLink: false,
          areaStyle: { color, opacity: 0.12 },
        },
      )
    }

    series.push({
      name: task.name,
      type: 'line',
      data: data.map(point => point.values[task.id] ?? null),
      smooth: 0.1,
      showSymbol: false,
      connectNulls: false, // 超时桶保持断点
      lineStyle: { width: showDelay.value ? 1.5 : 0, color, cap: 'round' as const },
      itemStyle: { color, opacity: showDelay.value ? 1 : 0 },
      markLine: showLoss.value && lossIndexes.length
        ? {
            silent: true,
            symbol: ['none', 'none'],
            animation: false,
            label: { show: false },
            lineStyle: {
              color,
              width: 1,
              type: 'solid' as const,
              opacity: 0.55,
            },
            data: lossIndexes.map(index => ({
              xAxis: index,
            })),
          }
        : undefined,
    })
  }

  // 颜色映射表（用于 Tooltip）
  const colorMap = new Map<number, string>()
  tasks.value.forEach((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    colorMap.set(task.id, chartColors[safeIdx]!)
  })

  return {
    animation: false,
    color: tasks.value.map((_, idx) => chartColors[Math.max(0, idx % chartColors.length)]!),
    tooltip: {
      ...baseTooltipConfig.value,
      formatter: (params: unknown) => {
        const p = params as Array<{ seriesName: string, value: number | null, dataIndex: number, seriesIndex: number }>
        if (!p.length)
          return ''
        const firstParam = p.find(item => !String(item.seriesName).endsWith('band') && !String(item.seriesName).endsWith('band-base'))
        if (!firstParam)
          return ''
        const point = data[firstParam.dataIndex]
        if (!point)
          return ''

        const timeStr = formatTimeForTooltip(point.ts, hours)
        let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
        html += '<div style="display:flex;flex-direction:column;gap:4px">'

        // 按延迟值排序显示
        const sortedParams = [...p]
          .filter(item => !String(item.seriesName).endsWith('band') && !String(item.seriesName).endsWith('band-base'))
          .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))

        for (const item of sortedParams) {
          const task = tasks.value.find(t => t.name === item.seriesName)
          if (!task)
            continue
          const color = colorMap.get(task.id) ?? chartColors[0]
          const band = point.bands[task.id]
          const bandText = band ? ` <span style="opacity:.6">(${band[0]}–${band[1]})</span>` : ''
          const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
          html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.seriesName}</span><span style="margin-left:auto;font-weight:600;margin-left:16px;font-variant-numeric:tabular-nums">${item.value === null || item.value === undefined ? '超时' : `${Math.round(item.value)} ms${bandText}`}</span></div>`
        }
        html += '</div>'
        return html
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16,
      icon: 'roundRect',
      textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
      data: taskList.map(t => t.name),
      selected: Object.fromEntries(taskList.map(t => [t.name, true])),
    },
    grid: chartMargin,
    xAxis: {
      type: 'category',
      data: data.map(point => formatTime(point.ts, showDateInAxis.value)),
      axisLabel: {
        fontSize: 11,
        color: chartThemeColors.value.textSecondary,
        margin: 12,
      },
      axisLine: {
        show: true,
        lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
      },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      name: '延迟 (ms)',
      nameTextStyle: { color: chartThemeColors.value.textSecondary },
      axisLabel: { fontSize: 11, color: chartThemeColors.value.textSecondary, formatter: '{value}' },
      axisLine: { show: false },
      axisTick: { show: false },
      axisPointer: {
        lineStyle: { opacity: 0 },
        crossStyle: { opacity: 0 },
        label: { show: false },
      },
      splitLine: {
        lineStyle: {
          color: chartThemeColors.value.splitLineColor,
          type: 'dashed' as const,
        },
      },
    },
    series,
  }
})

// ==================== 生命周期 ====================

watch(selectedView, () => {
  fetchRecords()
})

watch(() => props.nodeId, () => {
  rows.value = []
  probes.value = {}
  windowLoss.value = {}
  selectedTaskIds.value = []
  fetchRecords()
})

onMounted(() => {
  if (!selectedView.value)
    selectedView.value = presetViews[0]!.label
  fetchRecords()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 时间选择器 -->
    <Tabs v-model="selectedView" class="w-full items-center">
      <div class="min-w-0 flex-1 overflow-x-auto pointer-events-auto">
        <TabsList :class="pickSurfaceClass('w-max h-8 bg-background/60 rounded-md', 'w-max h-8 bg-background/50 backdrop-blur-xl rounded-md')">
          <TabsTrigger
            v-for="view in presetViews" :key="view.label" :value="view.label"
            class="h-6.5 flex-none shrink-0 text-xs border-none data-[state=active]:text-emerald-600 shadow-none rounded-sm"
          >
            {{ view.label }}
          </TabsTrigger>
        </TabsList>
      </div>
      <div class="md:flex-1" />
      <div class="flex gap-2 items-center">
        <Button
          variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
          :class="[selectedTaskIds.length === tasks.length && 'bg-background !text-emerald-600']"
          @click="showAllTasks"
        >
          全选
        </Button>
        <Button
          variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
          :class="[!selectedTaskIds.length && 'bg-background !text-emerald-600']"
          @click="hideAllTasks"
        >
          全不选
        </Button>
      </div>
    </Tabs>

    <!-- 内容区域 -->
    <Spinner :show="loading" content-class="flex flex-col gap-4">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="tasks.length === 0 && !loading" class="py-8">
        <Empty description="暂无延迟数据" />
      </div>

      <template v-else>
        <!-- 最新值统计卡片（可点击切换选中状态） -->
        <div
          v-if="tasks.length > 0" class="gap-3 grid"
          style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))"
        >
          <div
            v-for="task in tasks" :key="task.id"
            class="flex cursor-pointer select-none items-center gap-3 rounded-md p-2 transition-all bg-background/60 hover:bg-background hover:shadow-[0_0_0_1px] hover:shadow-emerald-600/10"
            :class="[
              !selectedTaskIds.includes(task.id) && 'opacity-30',
            ]"
            :onmouseover="(e: MouseEvent) => ((e.currentTarget as HTMLElement).style.borderColor = getTaskColor(task.id))"
            :onmouseout="(e: MouseEvent) => ((e.currentTarget as HTMLElement).style.borderColor = '')"
            @click="toggleTask(task.id)"
          >
            <div class="flex-1 min-w-0">
              <div class="flex gap-2 items-center">
                <div class="rounded h-4 w-1" :style="{ backgroundColor: getTaskColor(task.id) }" />
                <span class="text-sm font-semibold truncate">{{ task.name }}</span>
                <div class="flex-1" />
                <DataTooltip placement="left" content-class="!rounded p-3 w-60 backdrop-blur">
                  <Button variant="ghost" size="icon-xs" class="text-slate-500" @click.stop>
                    <Icon icon="carbon:information" :width="14" :height="14" />
                  </Button>
                  <template #content>
                    <div class="text-xs gap-x-4 gap-y-1.5 grid grid-cols-2">
                      <template v-if="task.min !== null">
                        <span class="text-muted-foreground">最小</span>
                        <span class="font-medium">{{ Math.round(task.min) }} ms</span>
                      </template>
                      <template v-if="task.max !== null">
                        <span class="text-muted-foreground">最大</span>
                        <span class="font-medium">{{ Math.round(task.max) }} ms</span>
                      </template>
                      <template v-if="task.avg !== null">
                        <span class="text-muted-foreground">平均</span>
                        <span class="font-medium">{{ Math.round(task.avg) }} ms</span>
                      </template>
                      <template v-if="task.latest !== null">
                        <span class="text-muted-foreground">最新</span>
                        <span class="font-medium">{{ Math.round(task.latest) }} ms</span>
                      </template>
                      <span class="text-muted-foreground">丢包</span>
                      <span class="font-medium">{{ task.loss.toFixed(2) }}%</span>
                    </div>
                  </template>
                </DataTooltip>
              </div>
              <div class="text-xs mt-1 flex gap-1.5 items-center text-muted-foreground">
                <span class="font-medium" title="平均延迟">
                  {{ task.avg !== null ? `${Math.round(task.avg)}ms` : '-' }}
                </span>
                <span class="opacity-60">·</span>
                <span title="窗口丢包率">{{ task.loss.toFixed(2) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 items-center py-2">
          <!-- 延迟可视化开关 -->
          <Button
            variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
            :class="[showDelay && 'bg-background !text-emerald-600']" @click="showDelay = !showDelay"
          >
            延迟
          </Button>
          <!-- 丢包可视化开关 -->
          <Button
            variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
            :class="[showLoss && 'bg-background !text-emerald-600']" @click="showLoss = !showLoss"
          >
            丢包
          </Button>
          <!-- 波动色带开关 -->
          <Button
            variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
            :class="[showBand && 'bg-background !text-emerald-600']" @click="showBand = !showBand"
          >
            波动范围
          </Button>
        </div>

        <!-- 图表 -->
        <div
          class="h-80 rounded-md p-4 transition-all"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xl')"
        >
          <VChart :option="pingChartOption" autoresize />
        </div>
      </template>
    </Spinner>
  </div>
</template>
