<script setup lang="ts">
import { computed } from 'vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import VisitorInfoCard from '@/components/VisitorInfoCard.vue'
import { useAppStore } from '@/stores/app'
import manifest from '../../theme.json'

const appStore = useAppStore()

const buildVersion = __BUILD_VERSION__
const buildGitHash = __BUILD_GIT_HASH__

const showIcp = computed(() => appStore.icpEnabled && appStore.icpNumber)
const showPolice = computed(() => appStore.policeEnabled && appStore.policeNumber)
const showFiling = computed(() => showIcp.value || showPolice.value)

/** 站长填的跳转链接只放行 http(s)，其余按纯文本渲染 */
function safeFilingUrl(url: string): string | null {
  try {
    const protocol = new URL(url.trim()).protocol
    return protocol === 'http:' || protocol === 'https:' ? url.trim() : null
  }
  catch {
    return null
  }
}

const icpHref = computed(() => safeFilingUrl(appStore.icpUrl))
const policeHref = computed(() => safeFilingUrl(appStore.policeUrl))
</script>

<template>
  <VisitorInfoCard v-if="appStore.visitorInfoCardEnabled" />
  <footer class="w-full sm:flex-row sm:gap-4 max-w-[1280px] mx-auto p-4">
    <div class="flex flex-row items-center justify-between  text-xs text-muted-foreground">
      <div class="flex gap-1 items-center">
        Powered by
        <a
          href="https://github.com/monitor-probe/monitor" target="_blank" rel="noopener noreferrer"
          class="transition-opacity hover:opacity-80"
        >
          <span class="font-medium text-foreground">monitor</span>
        </a>
      </div>
      <div class="flex flex-wrap gap-1 items-center">
        Theme by
        <DataTooltip
          as="span"
          placement="top"
          :content="`Emerald v${manifest.version}\n${buildVersion}\n${buildGitHash}`"
        >
          <a
            href="https://github.com/lcyan/monitor-theme-emerald" target="_blank" rel="noopener noreferrer"
            class="transition-opacity hover:opacity-80"
          >
            <span class="font-medium text-foreground">Emerald</span>
          </a>
        </DataTooltip>
      </div>
    </div>

    <div v-if="showFiling" class="flex flex-wrap gap-2 items-center justify-center sm:flex-shrink-0 pb-7">
      <a
        v-if="showIcp && icpHref" :href="icpHref" target="_blank" rel="noopener noreferrer"
        class="transition-opacity hover:opacity-70"
      >
        <span class="text-xs text-muted-foreground">{{ appStore.icpNumber || '' }}</span>
      </a>
      <span v-else-if="showIcp" class="text-xs text-muted-foreground">{{ appStore.icpNumber || '' }}</span>
      <span v-if="showIcp && showPolice" class="opacity-50 text-xs text-muted-foreground">·</span>
      <template v-if="showPolice">
        <a
          v-if="policeHref" :href="policeHref" target="_blank" rel="noopener noreferrer"
          class="transition-opacity hover:opacity-70"
        >
          <span class="text-xs text-muted-foreground">{{ appStore.policeNumber || '' }}</span>
        </a>
        <span v-else class="text-xs text-muted-foreground">{{ appStore.policeNumber || '' }}</span>
      </template>
    </div>
  </footer>
</template>
