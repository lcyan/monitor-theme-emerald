# AGENTS.md

Repo guide for `monitor-theme-emerald`.

## Snapshot

- Generated: 2026-09-27, Asia/Shanghai
- Branch: `main`
- App: Vue 3 + Vite + reka-ui + Tailwind CSS v4 theme for the monitor hub
- Package manager: `bun` (>= 1.2)
- Theme manifest: `theme.json`

## What this repo is

- Builds a monitor hub theme, not a generic web app
- A pure static SPA that reads the same-origin `/api/*` read-only; no admin surface of its own
- Release artifact is `theme.tar.gz` that the hub can import (upload or `--themes/` directory)
- Runtime app code lives under `src/`
- Runtime static assets include `public/flags/` (258 Twemoji 15 country flags, UPPERCASE names) and `public/assets/logo/` (33 OS logos referenced by `src/utils/osImageHelper.ts`)
- Release preview image is `docs/preview.png`

## Root structure

- `src/` app source — see `src/AGENTS.md` for the detailed guide
- `src/api/` the hub data layer (fetch client, live WS, settings, history queue); the only code that talks to `/api/*`
- `public/flags/` runtime flag asset contract: `/flags/<ISO alpha-2>.svg`, UPPERCASE, Twemoji 15
- `theme.json` theme manifest consumed by the tar build and the hub's update check
- `vite.config.ts` build, chunking, `monitorThemeTar` packaging, dev proxy
- `package.json` root commands and pinned dependency versions
- `bun.lock` resolved lockfile (managed by bun)
- `scripts/publish.ts` version bump + tag + push (the release workflow builds the artifact)
- `scripts/check-version.ts` package.json ↔ theme.json (and optional tag) version guard used by CI
- `docs/preview.png` release preview image, packed as `preview.png` by the build

## Root commands

Run from repo root only.

```bash
bun run dev      # vite dev server; proxies /api to MONITOR_HUB (default http://127.0.0.1:9911)
bun run build    # type check + production build; emits dist/ + theme.tar.gz + theme.tar.gz.sha256
bun run preview  # serve the production build
bun run lint     # eslint with --fix --cache
bun test         # bun test runner (unit tests in src/**/__tests__/)
bun run icons    # regenerate src/generated/icons.ts (offline iconify set) after adding icon references
bun run publish  # bump package.json + theme.json, commit, tag v<version>, push (release.yml takes over)
```

Notes:

- `bun run build` runs `vue-tsc --build` plus the production build
- Dev against a real hub: `MONITOR_HUB=https://your-hub bun run dev` (proxy target, `/api` only)
- Dependency versions are declared directly in `package.json`; add new ones with `bun add` / `bun add -d`

## Build and release contract

`bun run build` must preserve the packaging flow defined in `vite.config.ts`.

Expected output:

- `dist/`
- `theme.tar.gz` (≤ 32 MiB; root of the archive is the theme directory: `dist/`, `theme.json`, `preview.png`)
- `theme.tar.gz.sha256`

Archive contents:

- `dist/` (includes `flags/` copied from `public/`)
- `theme.json`
- `preview.png` (from `docs/preview.png`)

Do not change the archive layout, manifest filename, or preview filename without updating the real build contract (`vite.config.ts` `monitorThemeTar`) and the hub's expectations (`theme.json` six required strings: `name/short/description/version/author/url`; `short` must be `[A-Za-z0-9_-]`).

## CI facts

Source of truth: `.github/workflows/`

- `ci.yml` — `bun install --frozen-lockfile`, `scripts/check-version.ts`, eslint (no `--fix`), `bun test`, `bun run build`
- `release.yml` — on `v*` tags: verifies tag equals `v{theme.json.version}`, builds, publishes `theme.tar.gz` + `.sha256` via `gh release create --generate-notes`

The hub's online-update check reads `url` from `theme.json` (`https://github.com/<owner>/<repo>`), fetches `releases/latest`, and downloads the asset named exactly `theme.tar.gz`. Renaming the asset breaks updates.

## Where to look

- Start at `package.json` for root commands
- Check `vite.config.ts` for build behavior, global constants, and tar packaging
- Check `theme.json` for theme metadata and the settings `config` schema (validated per-field in `src/api/config.ts`)
- Check `src/api/` for hub contract details; `src/AGENTS.md` for app code conventions
- Check `public/flags/` when code references flag filenames
- Check `.github/workflows/` for CI expectations

Contributor density, useful for triage:

- `src/components/` is a dense UI change area
- `src/api/` is the hub-contract boundary; changes there must match the hub source
- `src/stores/` is central state, usually affected by cross-cutting changes

## Conventions seen in this repo

- Use `bun`, not pnpm/npm/yarn
- Keep root guidance focused on build, packaging, manifest, and repo structure
- Preserve the `@` alias to `src` defined in `vite.config.ts`
- Treat `theme.json` as release input, not optional metadata
- Treat `docs/preview.png` as release input, not just documentation art
- Respect existing generated outputs and naming patterns, especially `theme.tar.gz(.sha256)`
- Root verification is lint + type-check + tests + build
- UI is built on `reka-ui` + Tailwind CSS v4 (shadcn-vue style under `src/components/ui/`). Do **not** reintroduce Naive UI, UnoCSS, or SCSS — they have been removed.
- Do **not** reintroduce a Komari RPC client or compatibility layer — the theme speaks monitor's native data structures only

## Repo grounded anti-patterns

- Do not rename `theme.json` or the `theme.tar.gz` release asset
- Do not move or rename `docs/preview.png` casually
- Do not add generic framework advice here that belongs in `src/AGENTS.md`
- Do not fetch `/api/nodes/{id}/metrics` outside `src/api/history.ts` (the hub rate-limits history queries)

## Child guides

For local rules, defer to the nearest child guide:

- `src/AGENTS.md` for app code, api layer, component, store, router, and utility changes

If a child guide exists, it overrides this root file for its subtree.
