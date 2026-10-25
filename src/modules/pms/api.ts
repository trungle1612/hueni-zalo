import { API_URL } from '@/constants/common'

import { usePms } from './pms.store'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message)
  }
}

// hueni-api /app/v1. The bearer is the hueni token from POST /app/v1/session, not the Zalo access token.
// Errors carry the server's Vietnamese message, ready to show.
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { token, actions } = usePms.getState()
  let res: Response
  try {
    res = await fetch(`${API_URL}/app/v1${path}`, {
      method: init.method || (init.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 0)
  }
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}))
  if (res.ok) return json as T
  // Expired or revoked session: back to Đăng nhập.
  if (res.status === 401 && token) actions.signOut()
  throw new ApiError(json.message || 'Có lỗi, thử lại sau ít phút.', res.status, json.error)
}
