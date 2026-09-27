import { describe, expect, test } from 'bun:test'
import { DEFAULT_CHART_RANGES, parseChartRanges } from '../chartRanges'

describe('parseChartRanges', () => {
  test('默认配置产出历史档位', () => {
    expect(parseChartRanges(DEFAULT_CHART_RANGES)).toEqual([
      { label: '1 小时', hours: 1 },
      { label: '6 小时', hours: 6 },
      { label: '1 天', hours: 24 },
      { label: '7 天', hours: 168 },
      { label: '30 天', hours: 720 },
      { label: '90 天', hours: 2160 },
    ])
  })

  test('按保留期取舍：去掉 90 天', () => {
    expect(parseChartRanges('1,6,24,168,720').map(r => r.label)).toEqual([
      '1 小时',
      '6 小时',
      '1 天',
      '7 天',
      '30 天',
    ])
  })

  test('乱序、重复与空白 token', () => {
    expect(parseChartRanges(' 720 , 1 , 24, , 1, abc, 168 ').map(r => r.hours)).toEqual([1, 24, 168, 720])
  })

  test('超出上限与负数被丢弃', () => {
    expect(parseChartRanges('0,-6,4320,24').map(r => r.hours)).toEqual([24])
  })

  test('全部非法时回落默认档位', () => {
    expect(parseChartRanges('abc')).toEqual(parseChartRanges(DEFAULT_CHART_RANGES))
    expect(parseChartRanges('')).toEqual(parseChartRanges(DEFAULT_CHART_RANGES))
    expect(parseChartRanges(null)).toEqual(parseChartRanges(DEFAULT_CHART_RANGES))
  })

  test('非整天数显示为小时', () => {
    expect(parseChartRanges('36')[0]!.label).toBe('36 小时')
    expect(parseChartRanges('48')[0]!.label).toBe('2 天')
  })
})
