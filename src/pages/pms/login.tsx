import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getAccessToken, getPhoneNumber } from 'zmp-sdk'

import { API_URL } from '@/constants/common'
import { api, ApiError } from '@/modules/pms/api'
import { Screen, Spinner } from '@/modules/pms/components/ui'
import { Session, usePms } from '@/modules/pms/pms.store'

// A known Zalo id signs in. Otherwise the Zalo phone (asked once, needs Zalo's approval of
// scope.userPhonenumber) links the owner or staff member added in the web admin.
async function zaloSession(): Promise<Session> {
  const access_token = await getAccessToken()
  try {
    return await api<Session>('/session', { body: { access_token } })
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'not_registered') throw e
  }
  const { token: phone_token } = await getPhoneNumber()
  return api<Session>('/session', { body: { access_token, phone_token } })
}

// Zalo identity only (PRODUCT.md: no password in the mini app); the canvas's phone + password form is left out.
export default function LoginPage() {
  const { signedIn, actions } = usePms()
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  if (signedIn) return <Navigate to="/" replace />

  async function zalo() {
    setWaiting(true)
    setError('')
    // ponytail: mock sign-in only in `vite dev` without VITE_API_URL (see API_URL).
    if (!API_URL) return setTimeout(() => actions.signIn(), 1200)
    try {
      const session = await zaloSession()
      if (!session.places.length)
        return setError('Tài khoản chưa thuộc cơ sở nào. Nhờ chủ cơ sở thêm bạn trên trang quản trị hueni.')
      actions.signIn(session)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Zalo chưa cho phép đăng nhập. Thử lại.')
    } finally {
      setWaiting(false)
    }
  }

  return (
    <Screen open plain>
      <main className="scroll login">
        <div className="brand">
          <b>hueni</b>
          <span>Quản lý đặt phòng cho homestay</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1>Đăng nhập</h1>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ minHeight: 48 }}
            disabled={waiting}
            onClick={zalo}
          >
            {waiting && <Spinner />}
            {waiting ? 'Đang chờ Zalo xác nhận…' : 'Đăng nhập bằng Zalo'}
          </button>
          {waiting && (
            <p className="help" role="status" style={{ textAlign: 'center' }}>
              Xác nhận trong ứng dụng Zalo rồi quay lại đây.
            </p>
          )}
          {error && (
            <div className="notice err" role="alert">
              {error}
            </div>
          )}
        </div>
      </main>
      <footer className="login-foot">
        Chưa có tài khoản? Chủ cơ sở thêm nhân viên trên trang quản trị hueni, mục Nhân viên.
      </footer>
    </Screen>
  )
}
