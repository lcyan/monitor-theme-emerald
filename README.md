<h3 align="center">Emerald</h3>
<p align="center">
基于 Vue 3 + Vite + reka-ui + Tailwind CSS v4 构建的 monitor 状态页主题<br>
自 Tokinx 的 Komari 主题 <a href="https://github.com/Tokinx/komari-theme-emerald">komari-theme-emerald</a> 迁移而来，数据层与设置契约针对 <a href="https://github.com/monitor-probe/monitor">monitor</a> hub 重写
</p>

![preview](/docs/preview.png)

## 使用

1. 从 [Release 页面](https://github.com/lcyan/monitor-theme-emerald/releases) 下载最新的 `theme.tar.gz`
2. 登录 monitor 后台，在主题管理中上传该文件；或放到 hub 的 `--themes` 目录
3. 在后台切换主题并保存设置，刷新前台即可生效

在线更新：后台的「检查更新」按 `theme.json` 的 `url` 查询本仓库最新 release，下载名为 `theme.tar.gz` 的资产。

## 环境要求

- Node.js: `^20.19.0` 或 `>=22.12.0`
- Bun: `>=1.2.0`

## 开发

```bash
# 安装依赖
bun install

# 连接本地 hub（默认 http://127.0.0.1:9911）开发
bun run dev

# 连接远程 hub 开发
MONITOR_HUB=https://your-hub.example.com bun run dev

# 代码检查
bun run lint
```

## 构建

```bash
# 类型检查 + 生产构建，产出 dist/ + theme.tar.gz + theme.tar.gz.sha256
bun run build

# 预览生产构建
bun run preview
```

## 部署注意

- 详情页路由为 `/node/:id`，反向代理 / WAF 需放行 `/node/` 前缀（hub 已把未知路径回落到主题的 `index.html`，只需确保代理不拦截）
- hub 的历史查询有全局并发上限（4 个），超出返回 503；主题内置了请求队列与退避，无需额外配置
- 前台只读同源 `/api/*`，不提供任何管理接口

## 隐私说明

- 「访客信息卡片」默认开启：访客 IP 归属地通过第三方接口（ipapi / ipinfo）查询，归属国仅用于展示国旗，不会写入 hub
- 「汇率」卡片通过第三方接口（frankfurter.app / open.er-api.com）获取当日汇率
- 两者都可在后台主题设置中关闭（访客卡片）或不使用（汇率卡片仅在展开时请求）

## 技术栈

| 类别     | 技术                             |
| -------- | -------------------------------- |
| 框架     | Vue 3                            |
| 构建工具 | Vite 7                           |
| UI 组件  | reka-ui（shadcn-vue 风格组件）   |
| 样式方案 | Tailwind CSS v4 + tw-animate-css |
| 状态管理 | Pinia 3                          |
| 路由     | Vue Router 5                     |
| 提示系统 | vue-sonner（Toaster）            |
| 图标     | @iconify/vue                     |
| 图表     | vue-echarts                      |
| 3D 地球  | cobe                             |
| 实用工具 | @vueuse/core, dayjs              |
| 代码规范 | ESLint (@antfu/eslint-config)    |

## 鸣谢

本项目不是从零开始的作品：

- 设计与交互基座来自 [Tokinx](https://github.com/Tokinx) 的 [komari-theme-emerald](https://github.com/Tokinx/komari-theme-emerald)（MIT）。本项目在其基础上迁移：数据层、主题设置契约与图表按 monitor hub 的接口重写，组件结构与视觉风格沿用原作
- [monitor](https://github.com/monitor-probe/monitor) 与 [monitor-theme-default](https://github.com/monitor-probe/monitor-theme-default) —— 主题打包与设置契约的参考实现
- 国旗与 OS 图标静态资源取自 [komari-web](https://github.com/komari-monitor/komari-web)（国旗为 [Twemoji](https://github.com/twitter/twemoji)，CC-BY 4.0）
- [Vue 3](https://vuejs.org/) · [Vite](https://vitejs.dev/) · [reka-ui](https://reka-ui.com/) · [Tailwind CSS](https://tailwindcss.com/)

## License

[MIT](./LICENSE)。本项目包含并修改自 [komari-theme-emerald](https://github.com/Tokinx/komari-theme-emerald) 的代码（MIT，Copyright (c) 2026 Tokinx），原许可声明已随本仓库一并保留。
