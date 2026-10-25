/**
 * 负载 / 延迟图的时间档位。hub 的历史保留天数从 /api/me 的 history_days 读取
 * （1–365），档位据此自动收窄；站长仍可用 `chartTimeRanges`（逗号分隔的小时数）
 * 自定义档位集合，两道约束取交集。
 */

export interface ChartTimeRange {
  label: string
  hours: number
}

export const DEFAULT_CHART_RANGES = '1,6,24,168,720,2160'
const DEFAULT_RANGE_HOURS = [1, 6, 24, 168, 720, 2160]

/** hub 的上限是 history_days×24（本模块收窄）；旧版 hub 缺省时以 2160 兜底，超出部分 hub 会静默 clamp */
const MAX_RANGE_HOURS = 2160

function toChartRange(hours: number): ChartTimeRange {
  return hours % 24 === 0
    ? { label: `${hours / 24} 天`, hours }
    : { label: `${hours} 小时`, hours }
}

/** history_days×24 与固定上限取小；未知（旧版 hub）时只受固定上限约束 */
function rangeCeiling(maxHours?: number): number {
  return typeof maxHours === 'number' && maxHours >= 1
    ? Math.min(maxHours, MAX_RANGE_HOURS)
    : MAX_RANGE_HOURS
}

/** 解析后台配置；非法 token 丢弃、去重升序，按保留期收窄，全部非法时回落默认档位 */
export function parseChartRanges(raw: string | undefined | null, maxHours?: number): ChartTimeRange[] {
  const ceiling = rangeCeiling(maxHours)
  const hoursList = [...new Set(
    (raw ?? '')
      .split(',')
      .map(token => Number.parseInt(token.trim(), 10))
      .filter(hours => Number.isInteger(hours) && hours >= 1 && hours <= ceiling),
  )].sort((a, b) => a - b)

  if (!hoursList.length)
    return DEFAULT_RANGE_HOURS.filter(hours => hours <= ceiling).map(toChartRange)

  return hoursList.map(toChartRange)
}
