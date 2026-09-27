# Source Tree Guide

This document applies to `/src` only. The app is a monitor hub theme: a pure static SPA that reads the same-origin `/api/*` read-only. Keep changes aligned with the current Vue 3 + Vite + reka-ui + Tailwind CSS v4 structure. **There is no Naive UI, no Komari RPC client** — do not reintroduce either.

## Core architecture

- `main.ts` is bootstrap only. It creates the Vue app, installs Pinia and the router, loads global styles, and mounts `App.vue`. Do not move feature logic into bootstrap.
- `App.vue` is the app shell. It mounts `<Toaster>` and `Provider`, calls `nodesStore.start()` (live stream) and `await appStore.bootstrap()` (site info + theme settings) on mount, and `KeepAlive`s `HomeView`.
- `src/router/index.ts` defines exactly two lazy routes:
  - `/` → `@/views/HomeView.vue`
  - `/node/:id` → `@/views/InstanceDetail.vue` (deployments behind a reverse proxy / WAF must allow the `/node/` prefix)
- The router has **no guards** today. Do not add one unless there is a real need.

## Data layer (`src/api/`) — the only place that talks to the hub

- `client.ts` — `api<T>()` fetch wrapper and `ApiError.status`. The hub answers errors as one line of `text/plain`; a 200 that is not JSON is a proxy page, not data.
- `types.ts` — hub-native data structures (`Node`, `Metrics`, history rows). Field semantics come from the hub source (`node_view`, `db.rs`); keep them in sync rather than inventing an adapter layer.
- `live.ts` — `startLive()`: one `GET /api/nodes`, then `/api/ws` (hub pushes every 2 s). On disconnect: 5 s polling + 5 s reconnect until a frame arrives. `safeNodes()` must guard every consumer from a malformed metrics report (set `metrics: null`, never drop the node).
- `config.ts` — theme settings. Defaults are baked in from `theme.json` at build time; saved overrides from `GET /api/themes/emerald/config` are validated per field (type / options / min / max) and anything invalid falls back to the default. Never trust a saved value.
- `history.ts` — the single entry point for history requests: client-side concurrency cap of 2, exponential backoff on 503 (the hub refuses beyond 4 concurrent history windows), dedupe + TTL cache keyed by `(nodeId, hours, points, series)`. LoadChart, PingChart and the list ping cells all go through this; do not fetch `/metrics` anywhere else.
- `me.ts` — `/api/me` (`site_name`, `authed`, `public_page`).

## Authoring conventions

- Use the Composition API with `<script setup lang="ts">`.
- Prefer `@/` imports for source-local modules instead of long relative paths.
- Data types come from `@/api/types`. Do not redefine node shapes in components or stores.
- Node identity is `id` (number). `country` is an ISO 3166-1 alpha-2 string (may be empty); flags live in `public/flags/<UPPERCASE>.svg`.

## UI library (`src/components/ui/`)

`src/components/ui/` is the local shadcn-vue-style component library (alert, avatar, back-top, badge, button, card-x, empty, input, progress-thin, sonner, spinner, tabs, tooltip). Each component:

- Wraps a `reka-ui` primitive (or composes lower-level primitives) when applicable.
- Declares variants with `class-variance-authority` and merges classes via `cn()` from `@/lib/utils` (which combines `clsx` + `tailwind-merge`).
- Uses Tailwind utilities; design tokens are CSS variables defined in `@/styles/main.css` (OKLCH, with `.dark` overrides via `@custom-variant dark`).

When you need a new piece of UI:

1. Compose existing primitives from `src/components/ui/` first.
2. If a primitive is missing, add it following the same pattern (reka-ui + cva + `cn()`), not by pulling in another component library.
3. Do not introduce per-component SCSS files or scoped styles for things Tailwind already covers.

## Views

- Views orchestrate data already exposed by stores and the api layer.
- `HomeView.vue` coordinates search (name / group / country / OS), grouping, view-mode selection, offline-last ordering, scroll restore, and route navigation; it also renders the public-page-closed and connection-error alerts.
- `InstanceDetail.vue` coordinates node detail presentation plus `LoadChart` and `PingChart` for a selected node.
- Keep `HomeView` named with `defineOptions({ name: 'HomeView' })` so `App.vue`'s `KeepAlive :include="['HomeView']"` keeps working.
- Heavy node and chart UI must stay lazily loaded with `defineAsyncComponent`, as already done for `NodeCard`, `NodeGeneralCards`, `NodeList`, `LoadChart`, and `PingChart`.

## Charts

- `LoadChart.vue` — history via `series=metrics` (cpu / memory / disk / net only; the hub thins rows itself, do not refill gaps client-side). Realtime view seeds with `hours=1` then appends one point per WS metrics change; swap, load, TCP/UDP and process counts exist only in realtime frames, so those cards render only there.
- `PingChart.vue` — via `series=ping`; probe names come from the response's `probes` map, series order is the rows' first-appearance order (the hub pre-sorts). Window loss uses only the response-level `loss` map, never row values; `band` rows draw a min–max ribbon.
- `useNodePingStats.ts` — one `fetchHistory(id, { hours: 1, points: 10, series: 'ping' })` per node; visibility-gated by the callers. `useNodePingDisplay.ts` turns that into render bars and the top-3 probe selection honoring `pingNetworkOrder`.

## Stores

- Pinia setup stores are the source of truth for app state.
- `@/stores/app` owns site info (`me`), merged theme `settings`, theme mode, view mode, and persisted UI state. Settings are already validated by `@/api/config` — read them directly, do not re-validate defensively.
- `@/stores/nodes` owns the live node list (hub order `sort, id`), `nodesById`, group derivation, `closed` (public page off → 401) and `error` states, and the throttled `earthNodes` snapshot for the globe/maps.
- Components and views should read from stores, not recreate parallel state for the same domain.

## Utils

- `src/utils` owns formatting and lookups only — **no transport**. All hub access lives in `src/api/`.
- `helper.ts` — bytes / uptime / percentage / date formatting, `daysUntilDate` for YYYY-MM-DD calendar math.
- `nodeHelpers.ts` — node-derived display values (price tags, expire status via `expires_in` first, traffic via `month_used` first).
- `financeHelper.ts` — currency conversion and `billing_cycle` enum → days (`BILLING_CYCLE_DAYS`; `once` has no remaining value).
- `regionHelper.ts` — ISO code → zh/en name table + `/flags/` path. No emoji parsing.
- `geoHelper.ts` — ISO code → `[lat, lng]` for the globe and dot map.
- `recordHelper.ts` — generic chart smoothing (`interpolateNullsLinear`, `cutPeakValues`) accepting numeric `ts` rows.
- `@/utils/message` is the wrapper exposed as `window.$message`. It calls into `vue-sonner`'s `toast`.

## App globals

- Only one app global exists on `window`: `$message`. It is typed in `src/types/global.d.ts`. Keep that file in sync if you add/remove a global.
- Theming: `Provider.vue` drives `useDark()` from `@vueuse/core` (storage key `vueuse-color-scheme`) and toggles `.dark` on `<html>`. Source of truth for the user-chosen mode is `useAppStore().themeMode` (`'auto' | 'light' | 'dark'`).
- Build-time constants `__BUILD_VERSION__` and `__BUILD_GIT_HASH__` are declared in `src/types/global.d.ts` and injected by `vite.config.ts`.

## Icons

- All icons go through `@iconify/vue` (`<Icon icon="icon-park-outline:sun" />`). The icons actually used are bundled offline: `bun run icons` scans the source and regenerates `src/generated/icons.ts`, which `setupIconify()` registers via `addCollection` at startup. There are **no runtime CDN requests** — self-hosted pages must not depend on api.iconify.design.
- After adding a new icon reference, rerun `bun run icons` (or the icon stays blank offline).
- Do **not** add `lucide-vue-next` or any other icon-as-component package — the project deliberately routes everything through Iconify so there is a single icon pipeline.

## Styles

- Single global stylesheet: `@/styles/main.css`. It imports `tailwindcss` and `tw-animate-css`, declares the `dark` custom variant, and defines OKLCH design tokens for both modes. **No SCSS, no UnoCSS.**
- Component-level styling should be Tailwind utilities composed with `cn()`, not scoped `<style>` blocks, unless there is a genuine reason (e.g. animations or selectors Tailwind cannot express cleanly).

## Validation

- Validate source-tree changes with:
  - `bun run lint`
  - `bun run type-check`
  - `bun test`
  - `bun run build`
- Tests live in `__tests__/` directories (excluded from `vue-tsc`) and run under `bun test` — no Vitest.
