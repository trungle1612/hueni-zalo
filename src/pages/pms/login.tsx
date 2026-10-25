import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getAccessToken, getPhoneNumber } from 'zmp-sdk'

import { API_URL } from '@/constants/common'
import { api, ApiError } from '@/modules/pms/api'
import { Screen, Spinner } from '@/modules/pms/components/ui'
import { Session, usePms } from '@/modules/pms/pms.store'

// A known Zalo id signs in. Otherwise, after the user has read why (Zalo's guidance: ask for the phone
// only when needed, explained first), the Zalo phone links the owner or staff member added in the web admin.
// getPhoneNumber needs Zalo's approval of scope.userPhonenumber.
const ask = (access_token: string, phone_token?: string) =>
  api<Session>('/session', { body: { access_token, phone_token } })

// Zalo identity only (PRODUCT.md: no password in the mini app); the canvas's phone + password form is left out.
export default function LoginPage() {
  const { signedIn, actions } = usePms()
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const [linking, setLinking] = useState('') // the Zalo access token while asking to use the phone
  if (signedIn) return <Navigate to="/" replace />

  async function run(step: () => Promise<Session>) {
    setWaiting(true)
    setError('')
    try {
      const session = await step()
      if (!session.places.length)
        return setError('Tài khoản chưa thuộc cơ sở nào. Nhờ chủ cơ sở thêm bạn trên trang quản trị hueni.')
      actions.signIn(session)
    } catch (e) {
      // First not_registered opens the linking step instead of an error.
      if (e instanceof ApiError && e.code === 'not_registered' && !linking) return
      setError(e instanceof ApiError ? e.message : 'Zalo chưa cho phép đăng nhập. Thử lại.')
    } finally {
      setWaiting(false)
    }
  }

  function zalo() {
    // ponytail: mock sign-in only in `vite dev` without VITE_API_URL (see API_URL).
    if (!API_URL) {
      setWaiting(true)
      return setTimeout(() => actions.signIn(), 1200)
    }
    run(async () => {
      const access_token = await getAccessToken()
      try {
        return await ask(access_token)
      } catch (e) {
        if (e instanceof ApiError && e.code === 'not_registered') setLinking(access_token)
        throw e
      }
    })
  }

  function linkByPhone() {
    run(async () => ask(linking, (await getPhoneNumber()).token))
  }

  return (
    <Screen open plain>
      <main className="scroll login">
        <div className="brand">
          <b>hueni</b>
          <span>Quản lý đặt phòng cho homestay</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {linking ? (
            <>
              <h1>Liên kết tài khoản</h1>
              <p>
                Tài khoản Zalo này chưa liên kết với hueni. Nếu chủ cơ sở đã thêm bạn bằng số điện thoại, hueni dùng số
                điện thoại Zalo của bạn để tìm và liên kết tài khoản đó. Số chỉ dùng để liên kết, không hiện cho ai
                khác.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                style={{ minHeight: 48 }}
                disabled={waiting}
                onClick={linkByPhone}
              >
                {waiting && <Spinner />}
                {waiting ? 'Đang chờ Zalo xác nhận…' : 'Dùng số điện thoại Zalo'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                disabled={waiting}
                onClick={() => {
                  setLinking('')
                  setError('')
                }}
              >
                Quay lại
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
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
