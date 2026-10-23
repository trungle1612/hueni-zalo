import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'

import { Screen, Spinner } from '@/modules/pms/components/ui'
import { usePms } from '@/modules/pms/pms.store'

// Zalo identity only (PRODUCT.md: no password in the mini app); the canvas's phone + password form is left out.
export default function LoginPage() {
  const { signedIn, actions } = usePms()
  const [waiting, setWaiting] = useState(false)
  if (signedIn) return <Navigate to="/" replace />

  function zalo() {
    setWaiting(true)
    // ponytail: mock delay; becomes getAccessToken() → hueni-api session.
    setTimeout(() => actions.signIn(), 1200)
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
        </div>
      </main>
      <footer className="login-foot">
        Chưa có tài khoản? Chủ cơ sở thêm nhân viên trên trang quản trị hueni, mục Nhân viên.
      </footer>
    </Screen>
  )
}
