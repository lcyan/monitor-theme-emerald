/**
 * 负载 / 延迟图的时间档位。hub 的「历史保留天数」没有公开接口可查，档位由
 * 后台设置 `chartTimeRanges`（逗号分隔的小时数）决定，站长按自己的保留期
 * 取舍——比如只保留 30 天就去掉 2160。
 */

export interface ChartTimeRange {
  label: string
  hours: number
}

export const DEFAULT_CHART_RANGES = '1,6,24,168,720,2160'

/** hub 匿名上限 168h，登录 2160h（超出部分 hub 会静默 clamp），配置再大没意义 */
const MAX_RANGE_HOURS = 2160

function toChartRange(hours: number): ChartTimeRange {
  return hours % 24 === 0
    ? { label: `${hours / 24} 天`, hours }
    : { label: `${hours} 小时`, hours }
}

/** 解析后台配置；非法 token 丢弃、去重升序，全部非法时回落默认档位 */
export function parseChartRanges(raw: string | undefined | null): ChartTimeRange[] {
  const hoursList = [...new Set(
    (raw ?? '')
      .split(',')
      .map(token => Number.parseInt(token.trim(), 10))
      .filter(hours => Number.isInteger(hours) && hours >= 1 && hours <= MAX_RANGE_HOURS),
  )].sort((a, b) => a - b)

  if (!hoursList.length)
    return parseChartRanges(DEFAULT_CHART_RANGES)

  return hoursList.map(toChartRange)
}
