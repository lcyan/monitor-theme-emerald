import { addCollection } from '@iconify/vue'
import { offlineCollections } from '@/generated/icons'

/**
 * Iconify 离线注册。
 *
 * @iconify/vue 默认在运行时从 api.iconify.design 按需拉取图标，自托管
 * 页面在访客网络受限时图标会全部显示不出来。这里把源码中实际用到的
 * 图标（`bun run icons` 生成，见 scripts/generate-icons.ts）在启动时
 * 注册为离线集合，之后不再有任何 CDN 请求。
 */
export async function setupIconify(): Promise<void> {
  for (const collection of offlineCollections)
    addCollection(collection)
}
