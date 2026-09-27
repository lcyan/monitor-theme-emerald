<script setup lang="ts">
import { onMounted } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import Background from './components/Background.vue'
import Footer from './components/Footer.vue'
import Header from './components/Header.vue'
import LoadingCover from './components/LoadingCover.vue'
import Provider from './components/Provider.vue'

const appStore = useAppStore()
const nodesStore = useNodesStore()

onMounted(async () => {
  // 站点信息 + 主题设置（内部各自失败回落），实时流并行启动
  nodesStore.start()
  await appStore.bootstrap()
  appStore.loading = false
})
</script>

<template>
  <Provider>
    <Background />
    <LoadingCover v-if="appStore.loading" />
    <Header />
    <main v-if="!appStore.loading" class="flex-1">
      <div class="max-w-[1280px] mx-auto">
        <RouterView v-slot="{ Component }">
          <KeepAlive :include="['HomeView']">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </div>
    </main>
    <Footer v-if="!appStore.loading" />
    <Toaster rich-colors close-button position="top-center" />
  </Provider>
</template>
