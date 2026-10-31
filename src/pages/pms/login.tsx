import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getAccessToken, getPhoneNumber } from 'zmp-sdk'

import { API_URL } from '@/constants/common'
import { api, ApiError } from '@/modules/pms/api'
import { Field, Icon, Screen, Sheet, Spinner } from '@/modules/pms/components/ui'
import { Session, usePms } from '@/modules/pms/pms.store'
import zaloIcon from '@/static/images/zalo-icon.png'

// Đăng ký chủ nhà (wiki Mini-App-API): an owner request the hueni admin approves after calling them.
type Registration = {
  status: 'pending' | 'approved' | 'rejected'
  name: string
  phone_number: string
  place_name: string
  maps_url: string | null
}
type Unknown = { access_token: string; registration_token: string; registration: Registration | null }

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
  const [linking, setLinking] = useState<Unknown>() // a Zalo account hueni doesn't know yet
  const [registering, setRegistering] = useState(false)
  const [intro, setIntro] = useState(true) // what hueni takes from Zalo, shown before the first tap
  if (signedIn) return <Navigate to="/" replace />

  const back = () => {
    setLinking(undefined)
    setRegistering(false)
    setError('')
  }

  async function run(step: () => Promise<Session>) {
    setWaiting(true)
    setError('')
    try {
      const session = await step()
      if (!session.places.length)
        return setError('Tài khoản chưa thuộc cơ sở nào. Nhờ chủ cơ sở thêm bạn trên trang quản trị hueni.')
      actions.signIn(session)
    } catch (e) {
      // First not_registered opens the linking step; still unknown with the phone → Đăng ký chủ nhà.
      if (e instanceof ApiError && e.code === 'not_registered') return
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
        if (e instanceof ApiError && e.code === 'not_registered') setLinking(unknown(access_token, e))
        throw e
      }
    })
  }

  function linkByPhone() {
    if (!linking) return
    run(async () => {
      try {
        return await ask(linking.access_token, (await getPhoneNumber()).token)
      } catch (e) {
        if (e instanceof ApiError && e.code === 'not_registered') {
          setLinking(unknown(linking.access_token, e))
          setRegistering(true)
        }
        throw e
      }
    })
  }

  if (linking && registering)
    return (
      <Register
        unknown={linking}
        onBack={back}
        onApproved={() => {
          back()
          zalo()
        }}
      />
    )

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
                onClick={() => setRegistering(true)}
              >
                {linking.registration ? 'Xem yêu cầu đăng ký' : 'Tôi là chủ cơ sở mới: đăng ký'}
              </button>
              <button type="button" className="btn btn-ghost btn-block" disabled={waiting} onClick={back}>
                Quay lại
              </button>
            </>
          ) : (
            <>
              <h1>Đăng nhập</h1>
              <button
                type="button"
                className="btn btn-zalo btn-block"
                style={{ minHeight: 48 }}
                disabled={waiting}
                onClick={zalo}
              >
                {waiting ? <Spinner /> : <img src={zaloIcon} alt="" width={28} height={28} />}
                {waiting ? 'Đang chờ Zalo xác nhận…' : 'Đăng nhập bằng Zalo'}
              </button>
              <button type="button" className="btn btn-ghost link" onClick={() => setIntro(true)}>
                <Icon name="lock" size={16} />
                hueni nhận gì từ Zalo?
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
      {intro && (
        <Sheet className="dialog" title="hueni cần thông tin của bạn" onClose={() => setIntro(false)}>
          <p>Đăng nhập gồm 2 bước: xác nhận trên Zalo, rồi nhập số điện thoại.</p>
          <ul>
            <li>
              <Icon name="user" stroke={1.75} />
              <div>
                <b>Tên và ảnh đại diện · lấy từ Zalo</b>
                <span>Hiện trong danh sách nhân viên, giao ca và nhật ký thao tác.</span>
              </div>
            </li>
            <li>
              <Icon name="phone" stroke={1.75} />
              <div>
                <b>Số điện thoại · bạn tự nhập</b>
                <span>Để biết bạn thuộc cơ sở nào. Chỉ cần nhập lần đầu trên mỗi tài khoản Zalo.</span>
              </div>
            </li>
            <li className="muted">
              <Icon name="block" stroke={1.75} />
              <div>
                <b>Không truy cập</b>
                <span>Tin nhắn, danh bạ và bạn bè Zalo của bạn.</span>
              </div>
            </li>
          </ul>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ minHeight: 48 }}
            onClick={() => setIntro(false)}
          >
            Đã hiểu
          </button>
        </Sheet>
      )}
    </Screen>
  )
}

const unknown = (access_token: string, e: ApiError): Unknown => ({
  access_token,
  registration_token: e.body.registration_token as string,
  registration: (e.body.registration as Registration | null) || null,
})

const BLANK = { name: '', phone_number: '', place_name: '', maps_url: '' }

function Register({ unknown, onBack, onApproved }: { unknown: Unknown; onBack: () => void; onApproved: () => void }) {
  const [sent, setSent] = useState(unknown.registration)
  const [editing, setEditing] = useState(sent?.status !== 'pending')
  const [f, setF] = useState(sent ? { ...sent, maps_url: sent.maps_url || '' } : BLANK)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [error, setError] = useState('')
  const [waiting, setWaiting] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setWaiting(true)
    setError('')
    setErrors({})
    try {
      const res = await api<{ registration: Registration }>('/registration', {
        method: sent?.status === 'pending' ? 'PATCH' : 'POST',
        headers: { 'X-Registration-Token': unknown.registration_token },
        body: { registration: f },
      })
      setSent(res.registration)
      setEditing(false)
    } catch (err) {
      if (!(err instanceof ApiError)) return setError('Có lỗi, thử lại sau ít phút.')
      if (err.code === 'registered') return onApproved()
      if (err.code === 'invalid') setErrors(err.body.errors || {})
      setError(err.code === 'invalid' ? err.body.errors?.base?.join(' ') || '' : err.message)
    } finally {
      setWaiting(false)
    }
  }

  const fieldError = (k: string) => errors[k]?.join(' ')

  return (
    <Screen open plain>
      <main className="scroll login">
        <div className="brand">
          <b>hueni</b>
          <span>Quản lý đặt phòng cho homestay</span>
        </div>
        {sent && !editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1>{sent.status === 'rejected' ? 'Yêu cầu chưa được duyệt' : 'Đã gửi yêu cầu đăng ký'}</h1>
            <p>
              {sent.name} · {sent.phone_number}
              <br />
              {sent.place_name}
            </p>
            <p>
              {sent.status === 'rejected'
                ? 'Kiểm tra lại thông tin rồi gửi lại.'
                : `hueni sẽ gọi số ${sent.phone_number} để xác minh. Duyệt xong, bấm Đăng nhập bằng Zalo lần nữa.`}
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => setEditing(true)}>
              {sent.status === 'rejected' ? 'Gửi lại' : 'Sửa thông tin'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={onBack}>
              Quay lại
            </button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1>Đăng ký chủ cơ sở</h1>
            <p>hueni gọi lại số điện thoại này để xác minh trước khi duyệt.</p>
            {error && (
              <div className="notice err" role="alert">
                {error}
              </div>
            )}
            <Field label="Họ tên" error={fieldError('name')}>
              {(p) => <input {...p} required value={f.name} onChange={(e) => set({ name: e.target.value })} />}
            </Field>
            <Field label="Số điện thoại" error={fieldError('phone_number')}>
              {(p) => (
                <input
                  {...p}
                  required
                  type="tel"
                  inputMode="tel"
                  value={f.phone_number}
                  onChange={(e) => set({ phone_number: e.target.value })}
                />
              )}
            </Field>
            <Field label="Tên homestay" error={fieldError('place_name')}>
              {(p) => (
                <input {...p} required value={f.place_name} onChange={(e) => set({ place_name: e.target.value })} />
              )}
            </Field>
            <Field label="Link Google Maps" optional error={fieldError('maps_url')}>
              {(p) => (
                <input {...p} type="url" value={f.maps_url} onChange={(e) => set({ maps_url: e.target.value })} />
              )}
            </Field>
            <button type="submit" className="btn btn-primary btn-block" style={{ minHeight: 48 }} disabled={waiting}>
              {waiting && <Spinner />}
              {sent?.status === 'pending' ? 'Lưu thay đổi' : 'Gửi yêu cầu'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" disabled={waiting} onClick={onBack}>
              Quay lại
            </button>
          </form>
        )}
      </main>
    </Screen>
  )
}
