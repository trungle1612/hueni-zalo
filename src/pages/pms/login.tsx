import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getAccessToken } from 'zmp-sdk'

import { API_URL } from '@/constants/common'
import { api, ApiError } from '@/modules/pms/api'
import { acceptTerms, Agree, Field, Icon, Legal, Screen, Sheet, Spinner } from '@/modules/pms/components/ui'
import { Doc, LEGAL, TERMS_VERSION } from '@/modules/pms/legal'
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

// A known Zalo id signs in. An unknown one enters a mã mời from the owner (hueni-api#211) or asks to register as an owner.
const ask = (access_token: string) => api<Session>('/session', { body: { access_token } })
const join = (access_token: string, invite_code: string) =>
  api<Session>('/session', { body: { access_token, invite_code, terms_version: TERMS_VERSION } })

// Terms ticked on this device: the popup isn't shown again until TERMS_VERSION changes.
const TERMS_KEY = 'pms.terms'
const termsAccepted = () => {
  try {
    return localStorage.getItem(TERMS_KEY) === TERMS_VERSION
  } catch {
    return false
  }
}
const rememberTerms = () => {
  try {
    localStorage.setItem(TERMS_KEY, TERMS_VERSION)
  } catch {
    // private mode: ask again next time
  }
}

// Zalo identity only (PRODUCT.md: no password in the mini app); the canvas's phone + password form is left out.
export default function LoginPage() {
  const { signedIn, actions } = usePms()
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const [linking, setLinking] = useState<Unknown>() // a Zalo account hueni doesn't know yet
  const [registering, setRegistering] = useState(false)
  const [code, setCode] = useState('')
  // What hueni takes from Zalo, with the agreement: shown on open ('info'), or on a tap before agreeing ('pre').
  const [agreed, setAgreed] = useState(termsAccepted)
  const [intro, setIntro] = useState<'info' | 'pre' | undefined>(agreed ? undefined : 'info')
  const [doc, setDoc] = useState<Doc>() // a policy text open over the current step
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
      if (!session.places.length) return setError('Tài khoản chưa thuộc cơ sở nào. Xin chủ cơ sở mã mời.')
      // A known Zalo id just ticked the box here: record it, or the app asks again right away.
      if (session.user.terms_version !== TERMS_VERSION)
        await acceptTerms(session.token)
          .then(() => (session.user.terms_version = TERMS_VERSION))
          .catch(() => {}) // the sign-in sheet asks again
      actions.signIn(session)
    } catch (e) {
      // not_registered opens the linking step (Đăng ký chủ nhà).
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

  if (linking && registering)
    return (
      <Register
        unknown={linking}
        onBack={back}
        onOpen={setDoc}
        doc={doc}
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
              <p>Tài khoản Zalo này chưa có trong hueni. Nhân viên: nhập mã mời chủ cơ sở gửi cho bạn.</p>
              <form
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  run(() => join(linking.access_token, code))
                }}
              >
                <Field label="Mã mời">
                  {(p) => (
                    <input
                      {...p}
                      className="invite-input"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="VD: 7K2P-9QXM"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                    />
                  )}
                </Field>
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  style={{ minHeight: 48 }}
                  disabled={waiting || code.replace(/[^A-Z0-9]/g, '').length < 8}
                >
                  {waiting && <Spinner />}
                  Vào hueni
                </button>
              </form>
              <p className="help">Chủ cơ sở mới chưa có mã: đăng ký, hueni gọi xác minh rồi duyệt.</p>
              <button
                type="button"
                className="btn btn-block"
                style={{ minHeight: 48 }}
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
              <p>
                hueni dành cho chủ cơ sở lưu trú và nhân viên của họ. Đăng nhập để hueni biết bạn thuộc cơ sở nào và chỉ
                cho bạn thấy dữ liệu của cơ sở đó.
              </p>
              <button
                type="button"
                className="btn btn-zalo btn-block"
                style={{ minHeight: 48 }}
                disabled={waiting}
                onClick={agreed ? zalo : () => setIntro('pre')}
              >
                {waiting ? <Spinner /> : <img src={zaloIcon} alt="" width={28} height={28} />}
                {waiting ? 'Đang chờ Zalo xác nhận…' : 'Đăng nhập bằng Zalo'}
              </button>
              <button type="button" className="btn btn-ghost link" onClick={() => setIntro('info')}>
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
        Nhân viên chưa có tài khoản? Xin chủ cơ sở mã mời (Thêm → Nhân viên).
        <nav aria-label="Văn bản pháp lý">
          {(['terms', 'privacy'] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDoc(d)}>
              {LEGAL[d].label}
            </button>
          ))}
        </nav>
      </footer>
      {doc ? (
        <Legal doc={doc} onClose={() => setDoc(undefined)} />
      ) : (
        intro && (
          <Sheet className="dialog" title="hueni cần thông tin của bạn" onClose={() => setIntro(undefined)}>
            <p>Đăng nhập bằng cách xác nhận trên Zalo.</p>
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
                  <span>Chỉ khi đăng ký chủ cơ sở, để hueni gọi xác minh. hueni không lấy số từ Zalo.</span>
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
            <div className="terms-f">
              <Agree checked={agreed} onChange={setAgreed} onOpen={setDoc} />
              <button
                type="button"
                className="btn btn-primary btn-block"
                style={{ minHeight: 48 }}
                disabled={!agreed}
                onClick={() => {
                  rememberTerms()
                  setIntro(undefined)
                  if (intro === 'pre') zalo()
                }}
              >
                {intro === 'pre' ? 'Đã hiểu, mở Zalo' : 'Đã hiểu'}
              </button>
              {intro === 'pre' && (
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setIntro(undefined)}>
                  Để sau
                </button>
              )}
            </div>
          </Sheet>
        )
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

function Register({
  unknown,
  onBack,
  onApproved,
  onOpen,
  doc,
}: {
  unknown: Unknown
  onBack: () => void
  onApproved: () => void
  onOpen: (doc?: Doc) => void
  doc?: Doc
}) {
  const [sent, setSent] = useState(unknown.registration)
  const [editing, setEditing] = useState(sent?.status !== 'pending')
  const [f, setF] = useState(sent ? { ...sent, maps_url: sent.maps_url || '' } : BLANK)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [error, setError] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [agreed, setAgreed] = useState(false) // asked again on every send: hueni-api records each one
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
        body: { registration: { ...f, terms_version: TERMS_VERSION } },
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
            <p className="help">
              <b>Dữ liệu khách:</b> khi nhập họ tên, số điện thoại của khách, bạn cần có lý do hợp pháp (hợp đồng lưu
              trú, khai báo lưu trú) và cho khách biết. hueni chỉ xử lý dữ liệu này cho cơ sở của bạn, không bán, không
              dùng để quảng cáo.
            </p>
            <Agree checked={agreed} onChange={setAgreed} onOpen={onOpen}>
              , và cam kết trên về dữ liệu khách
            </Agree>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              style={{ minHeight: 48 }}
              disabled={waiting || !agreed}
            >
              {waiting && <Spinner />}
              {sent?.status === 'pending' ? 'Lưu thay đổi' : 'Gửi yêu cầu'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" disabled={waiting} onClick={onBack}>
              Quay lại
            </button>
          </form>
        )}
      </main>
      {doc && <Legal doc={doc} onClose={() => onOpen(undefined)} />}
    </Screen>
  )
}
