import type { ThemeSettings } from '@/api/config'
import type { Me } from '@/api/types'
import type { ByteDecimalsConfig } from '@/utils/helper'
import { usePreferredDark, useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { defaultSettings, loadThemeSettings } from '@/api/config'
import { fetchMe } from '@/api/me'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type NodeViewMode = 'card' | 'list'
export type EarthViewMode = 'earth' | 'earth-stop' | 'maps' | 'cards' | 'hide'

/** 固定的字节精度配置 */
const BYTE_DECIMALS: ByteDecimalsConfig = {
  B: 0,
  KB: 0,
  MB: 1,
  GB: 1,
  TB: 2,
}

function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark'
}

const useAppStore = defineStore('app', () => {
  const loading = ref(true)

  const themeMode = useStorageAsync<ThemeMode>('themeMode', 'auto', localStorage)
  const lang = ref<'zh-CN' | 'en-US'>('zh-CN')
  const nodeSelectedGroup = useStorageAsync<string>('nodeSelectedGroup', 'all', localStorage)

  // 首页滚动位置记忆
  const homeScrollPosition = ref(0)

  // ===== 站点信息与主题设置（bootstrap 时填充） =====

  const me = ref<Me | null>(null)
  const settings = ref<ThemeSettings>(defaultSettings())
  /** 设置是否已加载过（含回落默认值的失败） */
  const settingsLoaded = ref(false)

  const siteName = computed(() => me.value?.site_name || 'Monitor')
  const authed = computed(() => me.value?.authed ?? false)
  const publicPage = computed(() => me.value?.public_page ?? true)

  /**
   * 启动引导：站点信息与主题设置互不阻塞，各自失败独立回落
   * （me 失败按未登录 + 默认站点名渲染，设置失败回落默认值），不抛出。
   */
  async function bootstrap(): Promise<void> {
    const [meResult, settingsResult] = await Promise.allSettled([fetchMe(), loadThemeSettings()])
    if (meResult.status === 'fulfilled')
      me.value = meResult.value
    if (settingsResult.status === 'fulfilled')
      settings.value = settingsResult.value
    settingsLoaded.value = true
    document.title = siteName.value
  }

  // ===== 视图模式（访客选择优先，其次主题设置） =====

  const storedViewMode = useStorageAsync<NodeViewMode | null>('nodeViewMode', null, localStorage)

  const defaultViewMode = computed<NodeViewMode>(() => settings.value.defaultViewMode)

  function isValidViewMode(value: string | null): value is NodeViewMode {
    return value === 'card' || value === 'list'
  }

  const nodeViewMode = computed<NodeViewMode>({
    get: () => (storedViewMode.value !== null && isValidViewMode(storedViewMode.value) ? storedViewMode.value : defaultViewMode.value),
    set: (val) => {
      storedViewMode.value = val
    },
  })

  watch(settingsLoaded, (loaded) => {
    if (loaded && !isValidViewMode(storedViewMode.value))
      storedViewMode.value = defaultViewMode.value
  }, { immediate: true })

  // ===== 主题设置直通项 =====

  const listPingEnabled = computed(() => settings.value.listPingEnabled)
  const pingNetworkOrder = computed<string[]>(() => {
    const seen = new Set<string>()
    const names: string[] = []
    for (const item of settings.value.pingNetworkOrder.split(',')) {
      const normalized = item.trim()
      if (!normalized || seen.has(normalized))
        continue
      seen.add(normalized)
      names.push(normalized)
    }
    return names
  })
  const offlineNodesLast = computed(() => settings.value.offlineNodesLast)

  const alertEnabled = computed(() => settings.value.alertEnabled)
  const alertTitle = computed(() => settings.value.alertTitle)
  const alertContent = computed(() => settings.value.alertContent)

  const earthViewMode = computed<EarthViewMode>(() => settings.value.earthViewMode)
  const visitorInfoCardEnabled = computed(() => settings.value.visitorInfoCardEnabled)
  const hideAdminEntryWhenLoggedOut = computed(() => settings.value.hideAdminEntryWhenLoggedOut)
  const disablePageAnimation = computed(() => settings.value.disablePageAnimation)

  const icpEnabled = computed(() => settings.value.icpEnabled)
  const icpNumber = computed(() => settings.value.icpNumber)
  const icpUrl = computed(() => settings.value.icpUrl || 'https://beian.miit.gov.cn/')

  const policeEnabled = computed(() => settings.value.policeEnabled)
  const policeNumber = computed(() => settings.value.policeNumber)
  const policeUrl = computed(() => settings.value.policeUrl)

  const backgroundEnabled = computed(() => settings.value.backgroundEnabled)
  const backgroundType = computed<'image' | 'video'>(() => settings.value.backgroundType)
  const lightBackgroundUrl = computed(() => settings.value.lightBackgroundUrl.trim())
  const darkBackgroundUrl = computed(() => settings.value.darkBackgroundUrl.trim())
  const backgroundBlur = computed(() => settings.value.backgroundBlur)
  const backgroundOverlay = computed(() => settings.value.backgroundOverlay)

  const visitorCountryCode = ref<string | null>(null)

  // ===== 外观 =====

  const prefersDark = usePreferredDark()

  watch(themeMode, (mode) => {
    if (!isValidThemeMode(mode))
      themeMode.value = 'auto'
  }, { immediate: true })

  const isDark = computed(() => (themeMode.value === 'auto' ? prefersDark.value : themeMode.value === 'dark'))
  const resolvedThemeMode = computed<'light' | 'dark'>(() => (isDark.value ? 'dark' : 'light'))

  const currentBackgroundUrl = computed(() => {
    if (!backgroundEnabled.value)
      return ''
    return resolvedThemeMode.value === 'dark' ? darkBackgroundUrl.value : lightBackgroundUrl.value
  })

  /** 字节格式化精度（固定配置） */
  const byteDecimals: ByteDecimalsConfig = { ...BYTE_DECIMALS }

  function updateThemeMode(mode?: ThemeMode): void {
    if (mode) {
      themeMode.value = isValidThemeMode(mode) ? mode : 'auto'
      return
    }
    const nextMode: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' }
    themeMode.value = nextMode[isValidThemeMode(themeMode.value) ? themeMode.value : 'auto']
  }

  return {
    loading,
    themeMode,
    isDark,
    resolvedThemeMode,
    lang,
    nodeSelectedGroup,
    nodeViewMode,
    defaultViewMode,
    byteDecimals,
    me,
    siteName,
    authed,
    publicPage,
    settingsLoaded,
    listPingEnabled,
    pingNetworkOrder,
    offlineNodesLast,
    alertEnabled,
    alertTitle,
    alertContent,
    earthViewMode,
    visitorInfoCardEnabled,
    visitorCountryCode,
    hideAdminEntryWhenLoggedOut,
    disablePageAnimation,
    icpEnabled,
    icpNumber,
    icpUrl,
    policeEnabled,
    policeNumber,
    policeUrl,
    backgroundEnabled,
    backgroundType,
    lightBackgroundUrl,
    darkBackgroundUrl,
    currentBackgroundUrl,
    backgroundBlur,
    backgroundOverlay,
    homeScrollPosition,
    bootstrap,
    updateThemeMode,
  }
})

export { useAppStore }
