/**
 * 非 hub 的第三方只读查询。monitor 规范只约定同源 /api 的五个接口，这些
 * 是主题自己的增强功能（访客 IP 归属、汇率），不属于 hub 契约；transport
 * 统一放这一层，utils / 组件只消费结果。
 *
 * 隐私提示：访客 IP 归属查询会把访客 IP 发给下列服务商，README 的隐私
 * 说明需与此处清单保持一致。
 */

export async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { signal: controller.signal })
  }
  finally {
    window.clearTimeout(timeoutId)
  }
}

export async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const response = await fetchWithTimeout(url, timeoutMs)
  if (!response.ok)
    throw new Error(`Request failed: ${response.status}`)
  return await response.json() as T
}

export interface VisitorGeoData {
  ip: string
  isp: string
  location: string
  countryCode: string
}

/** 依次尝试各 IP 归属源，全部失败返回 null */
export async function fetchVisitorGeo(): Promise<VisitorGeoData | null> {
  const loaders = [
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        ip?: string
        isp?: string
        organization?: string
        asn_organization?: string
        country?: string
        country_code?: string
        region?: string
        city?: string
      }>('https://api.ip.sb/geoip', 4000)

      if (!data.ip)
        throw new Error('ip.sb unavailable')

      return {
        ip: data.ip,
        isp: data.isp || data.organization || data.asn_organization || '未知运营商',
        location: [data.country, data.city || data.region].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.country_code || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        success?: boolean
        message?: string
        ip?: string
        country?: string
        country_code?: string
        region?: string
        city?: string
        connection?: {
          isp?: string
          org?: string
        }
      }>('https://ipwho.is/', 4000)

      if (data.success === false || !data.ip)
        throw new Error(data.message || 'ipwho.is unavailable')

      return {
        ip: data.ip,
        isp: data.connection?.isp || data.connection?.org || '未知运营商',
        location: [data.country, data.city || data.region].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.country_code || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        ip?: string
        company?: {
          name?: string
        }
        asn?: {
          org?: string
          descr?: string
          country?: string
        }
        datacenter?: {
          datacenter?: string
          country?: string
          region?: string
          city?: string
        }
        location?: {
          country?: string
          country_code?: string
          state?: string
          city?: string
        }
      }>('https://api.ipapi.is/', 4000)

      if (!data.ip)
        throw new Error('ipapi.is unavailable')

      return {
        ip: data.ip,
        isp: data.asn?.org || data.company?.name || data.datacenter?.datacenter || data.asn?.descr || '未知运营商',
        location: [
          data.location?.country || data.datacenter?.country,
          data.location?.city || data.location?.state || data.datacenter?.city || data.datacenter?.region,
        ].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.location?.country_code || data.asn?.country || data.datacenter?.country || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        error?: boolean
        reason?: string
        ip?: string
        org?: string
        country_name?: string
        country_code?: string
        region?: string
        city?: string
      }>('https://ipapi.co/json/', 4000)

      if (data.error || !data.ip)
        throw new Error(data.reason || 'ipapi unavailable')

      return {
        ip: data.ip,
        isp: data.org || '未知运营商',
        location: [data.country_name, data.city || data.region].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.country_code || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        code: number
        data?: {
          ip?: string
          isp?: string
          country?: string
          province?: string
          city?: string
          countryCode?: string
        }
      }>('https://api.vore.top/api/IPdata', 5000)

      if (data.code !== 0 || !data.data?.ip)
        throw new Error('vore unavailable')

      return {
        ip: data.data.ip,
        isp: data.data.isp || '未知运营商',
        location: [data.data.country, data.data.city || data.data.province].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.data.countryCode || '',
      }
    },
  ]

  for (const load of loaders) {
    try {
      return await load()
    }
    catch {
    }
  }

  return null
}
