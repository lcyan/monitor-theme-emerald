# Emerald 主题迁移到 monitor 计划

来源：`Tokinx/komari-theme-emerald`（Vue 3 + Vite 7 + reka-ui + Tailwind v4 + ECharts）
目标：`monitor-probe/monitor` hub 的公开页主题（纯静态 SPA，只读同源 `/api/*`）
参考实现：`monitor-probe/monitor-theme-default`
仓库：<https://github.com/lcyan/monitor-theme-emerald>

## 约定

- **工程包管理继续用 bun**：`bun install` / `bun run` / `bun add`，锁文件 `bun.lock`，CI 用 bun。
  仅在需要临时执行 npm 生态命令（dlx 等）时用 pnpm，不使用 npm。
- **全新迁移，不兼容 Komari**：删除 RPC2 客户端与所有 Komari 类型，store 与组件直接使用 monitor 原生数据结构，
  不做 Komari→monitor 的适配层。
- 已定：列表页三网延迟 **默认开启**；详情页路由改为 **`/node/:id`**。

---

## 0. monitor 主题契约（据 hub 源码 `src/api.rs`、`src/frontend.rs`、`web-admin`）

| 项 | monitor |
|---|---|
| 清单 | `theme.json`：`name/short/description/version/author/url` 六个字符串必填，可选 `config` 数组 |
| 发布包 | `theme.tar.gz`，根目录即主题目录：`dist/index.html`、`theme.json`、`preview.png`（可选），≤ 32 MiB |
| short | `emerald`（仅 `[A-Za-z0-9_-]`），安装目录名 = short |
| 在线更新 | hub 按 `url`（须为 `https://github.com/<owner>/<repo>`）查 `releases/latest`，只下载名为 `theme.tar.gz` 的资产；tag 与已装 `version` 不同即提示更新 |
| 站点/登录 | `GET /api/me` → `{authed, github, site_name, public_page, site}` |
| 节点 | `GET /api/nodes` → `{nodes: Node[], admin}`；匿名只返回 `public` 节点，无 `ip/hostname/remark`；公开页关闭时 401 |
| 实时 | `GET /api/ws`，hub 每 2s 推同样的 `{nodes, admin}`；断开需自行重连，期间 5s 轮询 `/api/nodes` |
| 历史 | `GET /api/nodes/{id}/metrics?hours=&points=&series=metrics\|ping`；匿名 hours ≤168，登录 ≤2160，静默 clamp |
| 历史并发 | hub 全局 4 个并发，超出 **503「查询历史的请求太多」** |
| 主题设置 | `GET /api/themes/emerald/config` → 只含与默认值不同的项；站长可 `PUT` 同址保存 |
| 路由 | 未知路径回落 `dist/index.html`；`/admin/*` 属 hub；`dist/assets/*` 被设为 immutable 1 年缓存 |

### 数据结构（直接作为主题内部类型）

```ts
type Metrics = {
  uptime, cpu, load: [n, n, n], mem_total, mem_used, swap_total, swap_used,
  disk_total, disk_used, net_rx, net_tx, total_rx, total_tx, month_rx, month_tx, tcp, udp, procs
}
type Node = {
  id: number, name, sort, public, online, country /* ISO alpha-2，可空 */, group?,
  last_seen, metrics: Metrics | null,
  os, kernel, arch, virt, cpu_name, cpu_cores, mem_total, swap_total, disk_total, agent_version,
  price, currency, billing_cycle /* monthly|quarterly|semiannual|yearly|biennial|triennial|once */,
  expires_at: string | null, expires_in?: number | null /* hub 日历上的剩余天数 */,
  traffic_limit, traffic_mode, traffic_reset_day,
  total_rx, total_tx, month_rx, month_tx, month_used?, month_start, day_rx, day_tx,
}
// metrics 历史行
type MetricRow = { ts, cpu, mem_used, disk_used, net_rx, net_tx }
// ping 历史行（按后台探测顺序、每个探测内按时间排好）
type PingRow = { task_id, ts, latency: number | null, band?: [min, max], loss?: number }
type MetricsResponse = { metrics: MetricRow[], ping: PingRow[], probes: Record<string, string>, loss: Record<string, number> }
```

monitor 没有的：GPU、温度、标签、公开备注、IPv4/IPv6、自动续费、隐藏标记、实时状态里的延迟汇总 → 对应 UI 删除。
monitor 新增可用：`day_rx/day_tx`、`month_used`、`traffic_reset_day`、`month_start`、`expires_in`、ping `band`。

---

## 1. 工程初始化（bun）

1. 拷入 emerald 源码（不带 `.git`、`node_modules`），保留 MIT LICENSE 与原作者署名。
2. `package.json`：`name: monitor-theme-emerald`，`version` 与 `theme.json` 同步（`1.0.0` 起），保留 `packageManager: bun`。
3. 删除 `archiver`、`https-proxy-agent`；`bun add -d tar` 用于打 tar.gz。
4. `scripts/publish.ts` 改为基于 `gh release create` 的发布脚本（或删掉，交给 CI）。
5. 改写 `AGENTS.md`：Komari→monitor，产物说明改为 `theme.tar.gz`。

## 2. 构建与打包

1. `vite.config.ts`
   - `komariThemeZip` → `monitorThemeTar`：`closeBundle` 打 `theme.tar.gz`（`dist/` + `theme.json` + `preview.png`）并写 `theme.tar.gz.sha256`
   - `server.proxy`：`{ '/api': { target: process.env.MONITOR_HUB || 'http://127.0.0.1:9911', changeOrigin: true, ws: true } }`
   - 保留 `@` 别名与 `manualChunks`；`vueDevTools()` 仅 dev
2. `docs/preview.png` 打包时放到根目录 `preview.png`。
3. `bun run build` 后解包确认结构。

## 3. `theme.json`

```json
{
  "name": "Emerald",
  "short": "emerald",
  "description": "An emerald theme for monitor",
  "version": "1.0.0",
  "author": "Tokinx, lcyan",
  "url": "https://github.com/lcyan/monitor-theme-emerald",
  "config": [ ... ]
}
```

`config` 格式（后台 `configForm()` 校验，不合法的字段会被丢弃）：
`{type:"title", label}` 或 `{key, type: string|text|number|boolean|select, label, help, default, options?: [{value,label}], min?, max?}`

| 保留项 | 类型 | 默认 |
|---|---|---|
| 基础：`defaultViewMode` | select card/list | card |
| 基础：`listPingEnabled`（新） | boolean | **true** |
| 基础：`pingNetworkOrder` | string（探测名，逗号分隔） | "" |
| 基础：`offlineNodesLast` | boolean | false |
| 公告：`alertEnabled` / `alertTitle` / `alertContent` | boolean / string / text | false / "" / "" |
| 页面：`earthViewMode` | select earth/earth-stop/maps/cards/hide | earth |
| 页面：`visitorInfoCardEnabled` / `hideAdminEntryWhenLoggedOut` / `disablePageAnimation` | boolean | true / false / false |
| 备案：`icpEnabled/icpNumber/icpUrl/policeEnabled/policeNumber/policeUrl` | boolean/string | 同原主题 |
| 背景：`backgroundEnabled` / `backgroundType` / `lightBackgroundUrl` / `darkBackgroundUrl` | boolean/select/string | 同原主题 |
| 背景：`backgroundBlur` | number 0–50 | 0 |
| 背景：`backgroundOverlay` | number -100–100 | 0 |

删除：`dataUpdateInterval`、`rpcTransportMode`（推送由 hub 决定，WS 失败自动轮询）。

## 4. 数据层（重写）

删除：`utils/rpc.ts`、`utils/rpc.md`、`utils/api.ts`、`utils/init.ts`、`utils/pingTaskOrder.ts`、`utils/recordHelper.ts` 中 Komari 部分及所有 Komari 类型。

新增 `src/api/`：

1. `client.ts`：`api<T>(path, init?)`，同源 `/api`；非 2xx 读 `text/plain` 单行报错，非 JSON 视为代理页；`ApiError.status`。
2. `types.ts`：上文数据结构。
3. `live.ts`：先 `GET /api/nodes`，再连 `/api/ws`；断开后 5s 轮询 + 5s 重连，WS 恢复停轮询；401 → 公开页关闭状态；
   `safeNodes()` 校验 metrics，坏数据置 `null` 而不影响其他节点。
4. `config.ts`：`GET /api/themes/emerald/config`，与构建时 `import manifest from '../../theme.json'` 的默认值合并，
   每项按类型/options/min/max 校验，不合法回落默认。
5. `me.ts`：`/api/me` → `site_name`（`document.title`、页头）、`authed`（后台入口）。
6. `history.ts`：metrics 请求统一入口 —— **客户端并发上限 2 的队列**、503 指数退避、按 `(id, hours, series)` 缓存。
   负载图、延迟图、列表延迟都走这里，避免打爆 hub 的 4 并发。

`stores/nodes.ts`、`stores/app.ts` 按新类型重写，以 `id` 为键。

## 5. 图表

1. `LoadChart.vue`
   - 历史：`series=metrics&hours=H&points=<图宽>`，仅有 cpu / 内存 / 磁盘 / 网速
   - 实时：进入详情页先拉 `hours=1`，之后从 WS 帧追加点；swap、load、tcp/udp、procs 只在实时视图展示
   - 时间范围 1h / 6h / 24h / 7d（登录后可加 30d / 90d）
2. `PingChart.vue`
   - `series=ping`，名称取 `probes[task_id]`，顺序按行首次出现
   - 窗口丢包率只用响应 `loss`，不平均行内 `loss`
   - 有 `band` 时画 min–max 色带
3. 列表三网延迟（`NodePingListCell` / `useNodePingStats`，默认开启）
   - 每节点 `series=ping&hours=1&points=<柱数>`，经 `history.ts` 队列
   - 只对视口内节点加载（IntersectionObserver），结果缓存 60s，随后按可见性刷新
   - `listPingEnabled=false` 时完全不请求
   - `pingNetworkOrder` 按探测名选 3 条

## 6. UI

1. 国旗：自带 SVG 放 `public/flags/`，`/flags/${country.toLowerCase()}.svg`；`country` 为空显示占位。
   `regionHelper.ts` 精简为 ISO 代码 → 名称/坐标，删 emoji 解析。
2. 地球 / 点状地图按 ISO 代码聚合。
3. `NodeList.vue`：删标签列；搜索按名称、分组、国家、OS。
4. `NodeCard.vue` / `InstanceDetail.vue`：删 GPU、IP、公开备注；加今日流量、流量重置日、账期起始。
5. `TrafficProgress.vue`：`month_used / traffic_limit`，按 `traffic_mode` 显示模式。
6. `financeHelper.ts`：`billing_cycle` 枚举 → 30/90/180/365/730/1095 天，`once` 不计剩余价值；到期天数用 `expires_in`。
7. 路由：`/node/:id`；README 注明反代 / WAF 需放行 `/node/` 前缀。
8. `Header.vue`：`/admin` 入口，显隐由 `authed` 与 `hideAdminEntryWhenLoggedOut` 决定。
9. `Footer.vue`：Powered by monitor · Emerald v{version}。
10. 访客 IP 卡片、汇率等第三方外呼保留，README 注明隐私影响。

## 7. 开发与验证

- 数据源：`MONITOR_HUB=https://<开了公开页的 hub> bun run dev`，或本机起 hub（默认 9911）。
- 验收清单
  - [ ] `bun run lint`、`bun run type-check`、`bun run build` 通过
  - [ ] `theme.tar.gz` 放入 hub `--themes/emerald/` 或后台上传，能切换、预览图正常
  - [ ] 后台主题设置表单完整渲染；改值后前台生效；恢复默认后回落
  - [ ] 列表 / 卡片 / 地球 / 地图 / 分组 / 离线后置 / 搜索正常；`metrics:null` 节点不崩
  - [ ] 详情页刷新不 404；负载 1h/6h/24h/7d、延迟图、丢包率正确
  - [ ] 关闭公开页 → 前台显示未公开；登录后可见
  - [ ] 重启 hub → WS 自动重连，期间轮询接管
  - [ ] 几十个节点下列表延迟默认开启，无大面积 503
  - [ ] 后台"检查更新"能从本仓库 release 拉到新版
- 单测：`bun test` 覆盖 `safeNodes`、设置合并、`billing_cycle` 换算。

## 8. CI / 发布（bun）

- `ci.yml`：`oven-sh/setup-bun` → `bun install --frozen-lockfile` → 校验 `theme.json.version == package.json.version`
  → `bun run lint` → `bun test` → `bun run build`
- `release.yml`：`v*` tag 触发，校验 tag == `v${theme.json.version}` → 构建 →
  `gh release create $TAG theme.tar.gz theme.tar.gz.sha256 --generate-notes`

## 工作量

| 阶段 | 估计 |
|---|---|
| 1–3 工程 / 打包 / 清单 | 0.5 天 |
| 4 数据层 | 1 天 |
| 5 图表 + 列表延迟 | 1.5 天 |
| 6 UI | 1 天 |
| 7–8 验证 / CI | 0.5–1 天 |
