<script setup lang="ts">
import type { CurrencyCode } from '@/utils/financeHelper'
import { Icon } from '@iconify/vue'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useNodeFormatters } from '@/composables/useNodeFormatters'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import * as financeHelper from '@/utils/financeHelper'
import { formatDateTime } from '@/utils/helper'
import { getBillingCycleText, getDaysUntilExpiry, getExpireTextClass, getTrafficUsed } from '@/utils/nodeHelpers'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagSrc, getRegionDisplayName, hasCountry } from '@/utils/regionHelper'

const LoadChart = defineAsyncComponent(() => import('@/components/LoadChart.vue'))
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const route = useRoute()
const router = useRouter()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const nodesStore = useNodesStore()
const { formatBytes, formatBytesPerSecond, formatUptime } = useNodeFormatters()
const exchangeRates = ref(financeHelper.DEFAULT_EXCHANGE_RATES)
const financeBaseCurrency = ref<CurrencyCode>('CNY')

const nodeId = computed(() => Number(route.params.id))

onMounted(async () => {
  window.scrollTo({ top: 0, behavior: 'instant' })
  financeBaseCurrency.value = financeHelper.getStoredFinanceCurrency()

  const { rates } = await financeHelper.getDailyExchangeRates()
  exchangeRates.value = rates
})

const data = computed(() => nodesStore.nodeById(nodeId.value))

interface InfoItem {
  label: string
  value: string | undefined
  icon?: string
}

interface MetricCard {
  label: string
  value: string
  unit?: string
  icon: string
  valueClass?: string
}

const CURRENCY_SUFFIX_REGEX = /^(\S.*\S)\s+([A-Z]{3})$/

function formatFinanceMetricValue(amountCNY: number, currency: CurrencyCode): string {
  const targetRate = exchangeRates.value[currency] || 1
  const formattedValue = financeHelper.formatFinanceAmount(amountCNY * targetRate, currency)
  return `${formattedValue.symbol}${formattedValue.value} ${formattedValue.currency}`
}

function splitMetricValue(value: string): { value: string, unit?: string } {
  const cycleIndex = value.indexOf(' / ')
  if (cycleIndex > -1) {
    return {
      value: value.slice(0, cycleIndex),
      unit: value.slice(cycleIndex),
    }
  }

  const currencyMatch = value.match(CURRENCY_SUFFIX_REGEX)
  if (currencyMatch) {
    return {
      value: currencyMatch[1] ?? value,
      unit: currencyMatch[2] ?? undefined,
    }
  }

  return { value }
}

const nodePriceText = computed(() => {
  if (!data.value)
    return '-'

  const priceCNY = financeHelper.calculateValueCNY(data.value, exchangeRates.value)
  if (priceCNY <= 0)
    return formatFinanceMetricValue(0, financeBaseCurrency.value)

  return `${formatFinanceMetricValue(priceCNY, financeBaseCurrency.value)} / ${getBillingCycleText(data.value.billing_cycle, appStore.lang)}`
})

const monthlyAverageCostText = computed(() => {
  if (!data.value)
    return '-'

  // 买断没有月均的概念
  if ((financeHelper.BILLING_CYCLE_DAYS[data.value.billing_cycle] ?? 0) <= 0)
    return appStore.lang === 'zh-CN' ? '不适用' : 'N/A'

  const monthlyAverageCost = financeHelper.calculateMonthlyAverageCostCNY(data.value, exchangeRates.value)
  return `${formatFinanceMetricValue(monthlyAverageCost, financeBaseCurrency.value)} / 月`
})

const remainingTimeText = computed(() => {
  const days = data.value ? getDaysUntilExpiry(data.value) : null
  if (days === null)
    return '-'
  if (days > 36_500)
    return '长期'
  if (days >= 0)
    return `${days} 天`
  return appStore.lang === 'zh-CN' ? `已过期 ${-days} 天` : `Expired ${-days}d`
})

const remainingValueText = computed(() => {
  if (!data.value)
    return '-'

  const remainingValueCNY = financeHelper.calculateRemainingValueCNY(data.value, exchangeRates.value)
  return formatFinanceMetricValue(remainingValueCNY, financeBaseCurrency.value)
})

const remainingTimeValueClass = computed(() => {
  if (!data.value)
    return ''

  return getExpireTextClass(data.value)
})

const metricCards = computed<MetricCard[]>(() => {
  if (!data.value)
    return []

  const nodePrice = splitMetricValue(nodePriceText.value)
  const monthlyAverageCost = splitMetricValue(monthlyAverageCostText.value)
  const remainingTime = splitMetricValue(remainingTimeText.value)
  const remainingValue = splitMetricValue(remainingValueText.value)

  return [
    {
      label: '节点价格',
      value: nodePrice.value,
      unit: nodePrice.unit,
      icon: 'tabler:cash',
    },
    {
      label: '月均支出',
      value: monthlyAverageCost.value,
      unit: monthlyAverageCost.unit,
      icon: 'tabler:receipt-2',
    },
    {
      label: '剩余时间',
      value: remainingTime.value,
      unit: remainingTime.unit,
      icon: 'tabler:calendar-dollar',
      valueClass: remainingTimeValueClass.value,
    },
    {
      label: '剩余价值',
      value: remainingValue.value,
      unit: remainingValue.unit,
      icon: 'tabler:coins',
    },
  ]
})

const hardwareInfo = computed<InfoItem[]>(() => [
  { label: 'CPU', value: data.value ? `${data.value.cpu_name} (x${data.value.cpu_cores})` : '-', icon: 'icon-park-outline:cpu' },
  { label: '架构', value: data.value?.arch ?? '-', icon: 'icon-park-outline:application-two' },
  { label: '虚拟化', value: data.value?.virt ?? '-', icon: 'icon-park-outline:server' },
])

const systemInfo = computed<InfoItem[]>(() => [
  { label: '操作系统', value: data.value?.os ?? '-', icon: 'icon-park-outline:computer' },
  { label: '内核版本', value: data.value?.kernel ?? '-', icon: 'icon-park-outline:code' },
  { label: '运行时间', value: formatUptime(data.value?.metrics?.uptime ?? 0, 'minute'), icon: 'icon-park-outline:timer' },
  { label: '最后上报', value: data.value?.last_seen ? formatDateTime(new Date(data.value.last_seen * 1000)) : '-', icon: 'icon-park-outline:time' },
])

const storageInfo = computed<InfoItem[]>(() => [
  { label: '内存', value: formatBytes(data.value?.mem_total ?? 0), icon: 'icon-park-outline:memory' },
  { label: '内存交换', value: formatBytes(data.value?.swap_total ?? 0), icon: 'icon-park-outline:switch' },
  { label: '硬盘', value: formatBytes(data.value?.disk_total ?? 0), icon: 'icon-park-outline:hard-disk' },
])

const trafficUsed = computed(() => {
  if (!data.value)
    return 0
  return getTrafficUsed(data.value)
})

const hasTrafficLimit = computed(() => (data.value?.traffic_limit ?? 0) > 0)

const trafficUsedPercentage = computed(() => {
  const trafficLimit = data.value?.traffic_limit ?? 0
  if (trafficLimit <= 0)
    return 0

  return Math.min((trafficUsed.value / trafficLimit) * 100, 100)
})

const trafficUsageText = computed(() => {
  if (!hasTrafficLimit.value)
    return '无限流量'

  return `${formatBytes(trafficUsed.value)} / ${formatBytes(data.value?.traffic_limit ?? 0)}`
})

const trafficProgressStyle = computed(() => ({
  width: `${trafficUsedPercentage.value}%`,
}))

/** 账期描述：起始日 + 重置日 */
const billingPeriodText = computed(() => {
  const node = data.value
  if (!node)
    return '-'
  const resetDay = node.traffic_reset_day > 0 ? `每月 ${node.traffic_reset_day} 日重置` : '按自然月重置'
  return `${node.month_start || '-'} 起 · ${resetDay}`
})
</script>

<template>
  <div class="instance-detail space-y-4">
    <div v-if="!data" class="p-4">
      <CardX
        class="border-none transition-all rounded-md"
        :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
      >
        <Empty description="节点不存在或已被删除">
          <template #extra>
            <Button @click="router.push('/')">
              返回首页
            </Button>
          </template>
        </Empty>
      </CardX>
    </div>

    <template v-else>
      <div class="px-4 flex gap-4 items-center">
        <Button variant="ghost" size="icon-sm" class="bg-background/50 hover:bg-background" @click="router.push('/')">
          <Icon icon="tabler:arrow-left" :width="16" :height="16" />
        </Button>
        <div class="text-lg font-bold flex gap-2 items-center">
          <img
            v-if="hasCountry(data.country)" :src="getFlagSrc(data.country)" :alt="getRegionDisplayName(data.country)"
            class="size-6"
          >
          <span>{{ data.name }}</span>
        </div>
        <Badge :variant="data.online ? 'default' : 'destructive'" class="text-xs !rounded">
          {{ data.online ? '在线' : '离线' }}
        </Badge>
      </div>

      <div class="px-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CardX
          v-for="item in metricCards" :key="item.label" hoverable size="small"
          class="group h-full border-none transition-all rounded-md"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
          content-class="h-full !p-3"
        >
          <div class="flex h-full min-h-10 md:min-h-18 flex-col justify-between gap-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium tracking-wider text-muted-foreground">{{ item.label }}</span>
              <Icon
                :icon="item.icon" :width="20" :height="20"
                class="text-slate-500/25 transition-colors group-hover:text-slate-500"
              />
            </div>
            <div class="min-w-0 space-y-1">
              <div
                class="flex min-w-0 items-baseline gap-1 truncate font-semibold leading-none"
                :class="item.valueClass"
              >
                <span class="truncate text-base sm:text-2xl">{{ item.value }}</span>
                <span v-if="item.unit" class="shrink-0 text-[11px] font-medium text-muted-foreground sm:text-xs">
                  {{ item.unit }}
                </span>
              </div>
            </div>
          </div>
        </CardX>
      </div>

      <div class="px-4 gap-4 grid grid-cols-1 lg:grid-cols-2">
        <CardX
          title="硬件信息" size="small"
          class="group h-full border-none transition-all rounded-md"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
        >
          <div class="gap-3 grid grid-cols-3">
            <div
              v-for="(item, index) in hardwareInfo" :key="item.label"
              class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2" :class="!index && 'col-span-3'"
            >
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <span class="text-xs sm:text-sm break-all">{{ item.value }}</span>
            </div>
          </div>
        </CardX>

        <CardX
          title="系统信息" size="small"
          class="group h-full border-none transition-all rounded-md"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
        >
          <div class="gap-3 grid grid-cols-1 sm:grid-cols-2">
            <div
              v-for="item in systemInfo" :key="item.label"
              class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2"
            >
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <div class="flex min-w-0 gap-2 items-center">
                <img
                  v-if="item.label === '操作系统'" :src="getOSImage(data.os)" :alt="getOSName(data.os)"
                  class="size-5 shrink-0"
                >
                <span class="text-xs sm:text-sm break-all">
                  {{ item.value }}
                </span>
              </div>
            </div>
          </div>
        </CardX>

        <CardX
          title="存储信息" size="small"
          class="group h-full border-none transition-all rounded-md"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
        >
          <div class="gap-3 grid grid-cols-3">
            <div
              v-for="item in storageInfo" :key="item.label"
              class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2"
            >
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <span class="text-xs sm:text-sm break-all">{{ item.value }}</span>
            </div>
          </div>
        </CardX>

        <CardX
          title="网络信息" size="small"
          class="group h-full border-none transition-all rounded-md"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
          content-class="pt-0"
        >
          <div class="gap-3 grid grid-cols-2">
            <div class="relative min-w-0 overflow-hidden rounded-sm bg-slate-500/5 p-2">
              <div
                v-if="hasTrafficLimit"
                class="absolute inset-y-0 left-0 rounded-sm bg-primary/10 pointer-events-none transition-[width] duration-300 ease-out"
                :style="trafficProgressStyle"
              />
              <div class="relative flex flex-col gap-1.5">
                <div class="flex gap-1 items-center text-muted-foreground">
                  <Icon icon="icon-park-outline:transfer-data" :width="14" :height="14" />
                  <span class="text-xs sm:text-sm">本账期流量</span>
                  <div class="flex-1" />
                  <span class="hidden sm:block text-[11px] font-medium text-foreground/70">
                    ↑ {{ formatBytes(data.month_tx) }} / ↓ {{ formatBytes(data.month_rx) }}
                  </span>
                </div>
                <span class="text-xs sm:text-sm break-all">
                  {{ trafficUsageText }}
                </span>
              </div>
            </div>
            <div class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon icon="icon-park-outline:dashboard-one" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">网络速率</span>
              </div>
              <span class="text-xs sm:text-sm break-all flex flex-row flex-wrap items-center gap-1">
                <Icon icon="tabler:chevron-up" width="12" height="12" />
                {{ formatBytesPerSecond(data.metrics?.net_tx ?? 0) }}
                <span class="px-0.5" />
                <Icon icon="tabler:chevron-down" width="12" height="12" />
                {{ formatBytesPerSecond(data.metrics?.net_rx ?? 0) }}
              </span>
            </div>
            <div class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon icon="icon-park-outline:calendar" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">今日流量</span>
              </div>
              <span class="text-xs sm:text-sm break-all flex flex-row flex-wrap items-center gap-1">
                <Icon icon="tabler:chevron-up" width="12" height="12" />
                {{ formatBytes(data.day_tx) }}
                <span class="px-0.5" />
                <Icon icon="tabler:chevron-down" width="12" height="12" />
                {{ formatBytes(data.day_rx) }}
              </span>
            </div>
            <div class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon icon="icon-park-outline:history" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">账期起始</span>
              </div>
              <span class="text-xs sm:text-sm break-all">
                {{ billingPeriodText }}
              </span>
            </div>
          </div>
        </CardX>
      </div>

      <LoadChart :node-id="data.id" class="px-4" />
      <PingChart :node-id="data.id" class="px-4" />
    </template>
  </div>
</template>
