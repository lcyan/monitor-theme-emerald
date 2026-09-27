import type { Me } from './types'
import { api } from './client'

/** GET /api/me：站点名、登录态与公开页开关 */
export function fetchMe(): Promise<Me> {
  return api<Me>('/me')
}
