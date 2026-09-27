import { describe, expect, it } from 'bun:test'
import { defaultSettings, isValid, mergeSettings } from '../config'

describe('defaultSettings', () => {
  it('与 theme.json 的 default 一致', () => {
    const settings = defaultSettings()
    expect(settings.defaultViewMode).toBe('card')
    // 列表延迟按迁移决定默认开启
    expect(settings.listPingEnabled).toBe(true)
    expect(settings.earthViewMode).toBe('earth')
    expect(settings.visitorInfoCardEnabled).toBe(true)
    expect(settings.backgroundBlur).toBe(0)
    expect(settings.backgroundOverlay).toBe(0)
  })
})

describe('mergeSettings', () => {
  it('合法覆盖项生效', () => {
    const merged = mergeSettings({ defaultViewMode: 'list', backgroundBlur: 20, listPingEnabled: false })
    expect(merged.defaultViewMode).toBe('list')
    expect(merged.backgroundBlur).toBe(20)
    expect(merged.listPingEnabled).toBe(false)
  })

  it('类型不合法回落默认', () => {
    const merged = mergeSettings({
      alertEnabled: 'yes',
      backgroundBlur: 'high',
      offlineNodesLast: 1,
    })
    expect(merged.alertEnabled).toBe(false)
    expect(merged.backgroundBlur).toBe(0)
    expect(merged.offlineNodesLast).toBe(false)
  })

  it('select 值不在 options 内回落默认', () => {
    const merged = mergeSettings({ earthViewMode: 'cube', defaultViewMode: 'grid' })
    expect(merged.earthViewMode).toBe('earth')
    expect(merged.defaultViewMode).toBe('card')
  })

  it('number 超出 min/max 回落默认', () => {
    const merged = mergeSettings({ backgroundBlur: 51, backgroundOverlay: -101 })
    expect(merged.backgroundBlur).toBe(0)
    expect(merged.backgroundOverlay).toBe(0)
  })

  it('边界值合法', () => {
    const merged = mergeSettings({ backgroundBlur: 50, backgroundOverlay: -100 })
    expect(merged.backgroundBlur).toBe(50)
    expect(merged.backgroundOverlay).toBe(-100)
  })

  it('未知键被忽略，其余保留默认', () => {
    const merged = mergeSettings({ hackerMode: true } as Record<string, unknown>)
    expect(merged).toEqual(defaultSettings())
  })

  it('非有限数字回落默认', () => {
    expect(isValid({ key: 'x', type: 'number', default: 0 }, Number.NaN)).toBe(false)
    expect(isValid({ key: 'x', type: 'number', default: 0 }, Number.POSITIVE_INFINITY)).toBe(false)
  })
})
