import type { Plugin } from 'vite'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import * as tar from 'tar'
import { defineConfig } from 'vite'

import vueDevTools from 'vite-plugin-vue-devtools'

const root = fileURLToPath(new URL('.', import.meta.url))

function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  }
  catch {
    return 'unknown'
  }
}

function shouldIgnoreRollupWarning(warning: { code?: string, id?: string }): boolean {
  return warning.code === 'INVALID_ANNOTATION'
    && warning.id?.includes('/node_modules/@vueuse/core/dist/index.js') === true
}

/**
 * Vite 插件：构建后打包 monitor 主题，解开即是 hub 读取的主题目录
 * theme.tar.gz
 * ├── theme.json
 * ├── preview.png
 * └── dist/
 */
function monitorThemeTar(): Plugin {
  return {
    name: 'monitor-theme-tar',
    apply: 'build',
    closeBundle: async () => {
      if (!existsSync(resolve(root, 'dist/index.html'))) {
        console.log('[monitor-theme-tar] dist/index.html not found, skipping archive')
        return
      }

      // preview.png 源文件在 docs/ 下，包里要与 theme.json 同级，借临时目录摆好再打包
      const staging = mkdtempSync(join(tmpdir(), 'emerald-theme-'))
      try {
        const entries = ['dist', 'theme.json']
        copyFileSync(resolve(root, 'theme.json'), join(staging, 'theme.json'))
        cpSync(resolve(root, 'dist'), join(staging, 'dist'), { recursive: true })

        const previewPath = resolve(root, 'docs/preview.png')
        if (existsSync(previewPath)) {
          copyFileSync(previewPath, join(staging, 'preview.png'))
          entries.push('preview.png')
        }

        const output = resolve(root, 'theme.tar.gz')
        await tar.create({ gzip: { level: 9 }, file: output, cwd: staging, portable: true }, entries)

        const sha = createHash('sha256').update(readFileSync(output)).digest('hex')
        writeFileSync(`${output}.sha256`, `${sha}\n`)
        const sizeMB = (statSync(output).size / 1024 / 1024).toFixed(2)
        console.log(`[monitor-theme-tar] Created theme.tar.gz (${sizeMB} MB), sha256 ${sha}`)
      }
      finally {
        rmSync(staging, { recursive: true, force: true })
      }
    },
  }
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as { version: string }

export default defineConfig(({ command }) => ({
  define: {
    __BUILD_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_GIT_HASH__: JSON.stringify(getCommitHash()),
  },
  plugins: [
    vue(),
    command === 'serve' && vueDevTools(),
    tailwindcss(),
    monitorThemeTar(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 主题只读公开数据，任何开着公开页的 hub 都可以当数据源：
  // MONITOR_HUB=https://hub.example.com bun run dev
  // changeOrigin 让 hub 前面按 Host 路由的反代 / CDN 能认出请求
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.MONITOR_HUB || 'http://127.0.0.1:9911',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (shouldIgnoreRollupWarning(warning))
          return
        defaultHandler(warning)
      },
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'echarts': ['echarts', 'vue-echarts'],
          'reka-ui': ['reka-ui'],
          'vueuse': ['@vueuse/core'],
        },
      },
    },
  },
}))
