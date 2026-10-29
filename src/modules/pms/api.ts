import { getAccessToken } from 'zmp-sdk'

import { API_URL } from '@/constants/common'

import { Session, usePms } from './pms.store'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public body: ErrorBody = {},
  ) {
    super(message)
  }
}

// The whole error answer: `errors` per field (invalid), `registration_token` (not_registered), `feed` (sync_failed)…
export type ErrorBody = { error?: string; message?: string; errors?: Record<string, string[]>; [k: string]: unknown }

type Init = { method?: string; body?: unknown; headers?: Record<string, string> }

// hueni-api /api/v1 (wiki Mini-App-API). The bearer is the hueni token from POST /session, not the Zalo access token.
// Errors carry the server's Vietnamese message, ready to show.
export async function api<T>(path: string, init: Init = {}, retried = false): Promise<T> {
  const { token, actions } = usePms.getState()
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method: init.method || (init.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 0)
  }
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}))
  if (res.ok) return json as T
  // Expired or revoked token: Zalo doesn't ask again once allowed, so sign in again quietly and retry once.
  if (res.status === 401 && token && !retried) {
    if (await renew()) return api<T>(path, init, true)
    actions.signOut()
  }
  throw new ApiError(json.message || 'Có lỗi, thử lại sau ít phút.', res.status, json.error, json)
}

let renewing: Promise<boolean> | undefined
// One renewal for every request that hit the 401 together.
function renew() {
  renewing ||= (async () => {
    try {
      const access_token = await getAccessToken()
      usePms.setState({ token: '' })
      usePms.getState().actions.signIn(await api<Session>('/session', { body: { access_token } }, true))
      return true
    } catch {
      return false
    } finally {
      renewing = undefined
    }
  })()
  return renewing
}
