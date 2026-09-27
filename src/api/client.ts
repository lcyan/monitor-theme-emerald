/**
 * monitor hub 同源 /api 的最小 fetch 封装。
 *
 * hub 的每个错误应答都是写给读者看的一行 text/plain；其余情况（代理错误页、
 * CDN 拦截页、空 502）来自 hub 之外的东西，用状态码描述即可。
 */

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function failure(res: Response): Promise<ApiError> {
  const text = res.headers.get('content-type')?.startsWith('text/plain') ? (await res.text()).trim() : ''
  return new ApiError(
    res.status,
    text || (res.status >= 500 ? `服务暂时无法访问（HTTP ${res.status}），稍后再试` : `请求被拦截（HTTP ${res.status}），稍后再试`),
  )
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
    })
  }
  catch {
    throw new ApiError(0, '网络连接失败，稍后再试')
  }
  if (!res.ok)
    throw await failure(res)
  if (res.status === 204)
    return undefined as T
  // 200 却解析不出 JSON：那是代理的页面，不是状态数据
  return res.json().catch(() => {
    throw new ApiError(res.status, '收到的不是状态数据，稍后再试')
  })
}
