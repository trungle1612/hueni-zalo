import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from 'zmp-ui'

import { API_URL } from '@/constants/common'
import {
  A,
  AppBar,
  Badge,
  bookingStatus,
  ContactButtons,
  Field,
  Icon,
  KV,
  phoneDigits,
  Screen,
  Sec,
  Sheet,
  toast,
  useBack,
  useCurrent,
} from '@/modules/pms/components/ui'
import { Guest, guestKey, GuestProfile, logActivity, useGuests } from '@/modules/pms/guests.store'
import { Booking, bookingCode, fmtRange, money, nights, usePms } from '@/modules/pms/pms.store'
import { fetchGuest, listGuests, saveGuest } from '@/modules/pms/remote'

// Short money for the stat tiles: 4,05tr · 500k.
const million = (n: number) =>
  n >= 1e6
    ? `${String(+(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)).replace('.', ',')}tr`
    : n >= 1e3
      ? `${Math.round(n / 1e3)}k`
      : money(n)
const masked = (id: string) => `•••• ${id.slice(-4)}`
const spaced = (id: string) => id.replace(/(.{3})(?=.)/g, '$1 ')

// /guests: everyone who stayed at the current homestay. /guests/:id: the guest of booking :id.
export default function GuestsPage() {
  const { id } = useParams()
  return id ? <Profile bookingId={Number(id)} /> : <GuestList />
}

// "Cần lưu ý" line for any screen showing this guest's booking: guest_flag from hueni-api, else the mock's.
export function GuestFlagNotice({ booking }: { booking: Booking }) {
  const mock = useGuests((s) => s.flags[guestKey(booking)])
  const flag = booking.guest_flag || mock
  if (!flag) return null
  return (
    <div className="sec">
      <div className="alert" role="status">
        Cần lưu ý: {flag}
      </div>
    </div>
  )
}

function GuestList() {
  const back = useBack('/more')
  const { place } = useCurrent()
  const [query, setQuery] = useState('')
  const [guests, setGuests] = useState<Guest[]>()
  const [error, setError] = useState<string>()

  // The server searches (name with or without accents, phone, DP code); wait for a pause in typing.
  useEffect(() => {
    let live = true
    const t = setTimeout(
      async () => {
        const r = await listGuests(place.id, query.trim())
        if (!live) return
        if (typeof r === 'string') setError(r)
        else {
          setGuests(r)
          setError(undefined)
        }
      },
      query ? 300 : 0,
    )
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [place.id, query])
  const back2 = (guests || []).filter((g) => g.returning).length

  return (
    <Screen>
      <header className="bar has-back">
        <button type="button" className="icon-btn" aria-label="Quay lại" onClick={back}>
          <Icon name="back" />
        </button>
        <div className="qwrap">
          <label htmlFor="gq" className="sr-only">
            Tìm khách
          </label>
          <input
            id="gq"
            className="input"
            type="search"
            autoComplete="off"
            placeholder="Tên hoặc số điện thoại"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="clear" aria-label="Xoá tìm kiếm" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </div>
      </header>
      <main className="scroll">
        <Sec
          title="Hồ sơ khách"
          aside={
            <span className="aside">
              {guests?.length ?? 0} khách{back2 ? ` · ${back2} quay lại` : ''}
            </span>
          }
        >
          {error ? (
            <div className="alert" role="alert">
              {error}
            </div>
          ) : !guests ? (
            <div className="panel empty-row">Đang tải…</div>
          ) : guests.length ? (
            <div className="panel">
              {guests.map((g) => (
                <A key={g.booking_id} className="row" to={`/guests/${g.booking_id}`}>
                  <span className="grow">
                    <span className="t1">{g.name || 'Khách'}</span>
                    <span className="t2">
                      {g.phone || 'Chưa có số'} · {g.visits} lần ở · gần nhất {dayjs(g.last_stay).format('DD/MM/YYYY')}
                    </span>
                  </span>
                  {g.flag ? (
                    <Badge tone="danger">Cần lưu ý</Badge>
                  ) : (
                    g.returning && <Badge tone="primary">Khách quen</Badge>
                  )}
                </A>
              ))}
            </div>
          ) : (
            <div className="panel empty-row">{query ? `Không có khách khớp “${query}”.` : 'Chưa có khách.'}</div>
          )}
        </Sec>
        <p className="foot">Khách đặt qua OTA không có hồ sơ: Airbnb và Booking.com không gửi tên, số điện thoại.</p>
      </main>
    </Screen>
  )
}

function Profile({ bookingId }: { bookingId: number }) {
  const navigate = useNavigate()
  const { rooms, user } = usePms()
  const papers = useGuests((s) => s.papers)
  const [g, setG] = useState<GuestProfile | string>()
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState<string>() // Đã lưu · Chưa lưu · the server's error
  const [reveal, setReveal] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [draft, setDraft] = useState('')
  const [flagError, setFlagError] = useState<string>()

  useEffect(() => {
    fetchGuest(bookingId).then((r) => {
      setG(r)
      if (typeof r !== 'string') setNote(r.note || '')
    })
  }, [bookingId])

  if (typeof g !== 'object') {
    return (
      <Screen>
        <AppBar lead="back" title="Hồ sơ khách" />
        <main className="scroll">
          <div className="empty">{g || 'Đang tải…'}</div>
        </main>
      </Screen>
    )
  }

  const roomOf = (id: number) => rooms.find((r) => r.id === id)
  const mine = g.bookings
  const name = g.name || 'Khách'
  const phone = phoneDigits(g.phone)
  // ponytail: ID papers are still the mock's; they come from the API with Khai báo lưu trú (#29).
  const p = API_URL ? undefined : papers[guestKey(mine[0])]
  const paperLabel = p?.nationality === 'Việt Nam' ? 'CCCD' : 'Hộ chiếu'
  const flag = g.flag

  function toggleId() {
    if (!reveal) {
      logActivity(mine[0], 'booking', `Xem số ${paperLabel}`, name)
      toast(`Đã ghi vào nhật ký: ${user.name} xem số ${paperLabel}`)
    }
    setReveal(!reveal)
  }
  async function saveNote() {
    if (saved !== 'Chưa lưu') return
    const r = await saveGuest(bookingId, { note: note.trim() })
    if (typeof r === 'string') return setSaved(r)
    setG(r)
    setSaved('Đã lưu')
  }
  async function setFlag(text: string) {
    const r = await saveGuest(bookingId, { flag: text })
    if (typeof r === 'string') return setFlagError(r)
    setG(r)
    setFlagging(false)
    toast(text ? 'Đã đánh dấu. Nhân viên sẽ thấy lưu ý khi mở đặt phòng.' : 'Đã bỏ đánh dấu')
  }

  return (
    <Screen>
      <AppBar lead="back" title={name} sub={`Hồ sơ khách · lần đầu ở ${dayjs(g.first_stay).format('MM/YYYY')}`}>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setDraft('')
            setFlagError(undefined)
            setFlagging(true)
          }}
        >
          {flag ? 'Lưu ý' : 'Đánh dấu'}
        </button>
      </AppBar>
      <main className="scroll">
        {flag && (
          <div className="sec">
            <div className="alert" role="status">
              Cần lưu ý: {flag}
            </div>
          </div>
        )}
        <div className="sec">
          <div className="panel stats">
            <div className="stat">
              <b>{g.visits}</b>
              <span>Lần ở</span>
            </div>
            <div className="stat">
              <b>{million(g.paid)}</b>
              <span>Đã trả</span>
            </div>
            <div className="stat">
              <b>{million(g.due)}</b>
              <span>Còn nợ</span>
            </div>
          </div>
        </div>

        <Sec title="Liên hệ và giấy tờ">
          <div className="panel">
            <dl>
              <KV label="Điện thoại">{phone || 'Chưa có'}</KV>
              {p?.email && <KV label="Email">{p.email}</KV>}
              {p ? (
                <>
                  <KV label={paperLabel}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {reveal ? spaced(p.id_no) : masked(p.id_no)}
                      <button type="button" className="text-btn" aria-pressed={reveal} onClick={toggleId}>
                        {reveal ? 'Ẩn' : 'Hiện'}
                      </button>
                    </span>
                  </KV>
                  <KV label="Ngày sinh">{p.dob}</KV>
                  <KV label="Quốc tịch">{p.nationality}</KV>
                </>
              ) : (
                !API_URL && <KV label="Giấy tờ">Chưa có · quét khi khai báo lưu trú</KV>
              )}
            </dl>
            {phone && (
              <div className="actions">
                <ContactButtons phone={g.phone} />
              </div>
            )}
          </div>
          {p && <p className="help">Mỗi lần xem số giấy tờ đầy đủ được ghi vào nhật ký.</p>}
        </Sec>

        <Sec title="Ghi chú cho lễ tân" aside={saved && <span className="aside">{saved}</span>}>
          <Field label="Ghi chú" hideLabel help="Lưu khi rời ô. Mọi nhân viên của cơ sở đều thấy.">
            {(f) => (
              <textarea
                {...f}
                maxLength={1000}
                value={note}
                placeholder="Ví dụ: thích phòng yên tĩnh, đi xe máy"
                onChange={(e) => {
                  setNote(e.target.value)
                  setSaved('Chưa lưu')
                }}
                onBlur={saveNote}
              />
            )}
          </Field>
        </Sec>

        <Sec title="Lịch sử đặt phòng" aside={<span className="aside">{mine.length} lần</span>}>
          <div className="panel">
            {mine.map((x) => {
              const s = bookingStatus(x)
              const room = roomOf(x.room_id)
              return (
                <A key={x.id} className="row" to={`/bookings/${x.id}`}>
                  <span className="grow">
                    <span className="t1">
                      {fmtRange(x)}/{x.end_date.slice(0, 4)} · {room?.name}
                    </span>
                    <span className="t2">
                      {bookingCode(x)} · {nights(x)} đêm
                    </span>
                  </span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </A>
              )
            })}
          </div>
        </Sec>
        <div className="end" />
      </main>
      <div className="footer-bar">
        <button
          type="button"
          className="btn btn-primary btn-block"
          // Router state, not the URL: guest details never go into links.
          onClick={() => navigate('/bookings/new', { state: { guest_name: name, guest_phone: phone } })}
        >
          + Đặt phòng cho khách này
        </button>
      </div>

      {flagging && (
        <Sheet
          title={flag ? 'Khách đang được đánh dấu cần lưu ý' : 'Đánh dấu khách cần lưu ý'}
          onClose={() => setFlagging(false)}
        >
          {flagError && (
            <div className="alert" role="alert">
              {flagError}
            </div>
          )}
          {flag ? (
            <>
              <p className="help">Lưu ý hiện tại: {flag}</p>
              <button type="button" className="btn btn-block" onClick={() => setFlag('')}>
                Bỏ đánh dấu
              </button>
            </>
          ) : (
            <>
              <p className="help">
                Mọi nhân viên sẽ thấy dòng lưu ý này khi mở đặt phòng của khách. Ghi sự việc cụ thể, tránh nhận xét cá
                nhân.
              </p>
              <Field label="Lý do">
                {(f) => (
                  <textarea
                    {...f}
                    maxLength={200}
                    placeholder="Ví dụ: 08/2025 trả phòng còn nợ 200.000đ, đã thu sau"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                )}
              </Field>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={draft.trim().length < 5}
                onClick={() => setFlag(draft.trim())}
              >
                Đánh dấu cần lưu ý
              </button>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setFlagging(false)}>
            Đóng
          </button>
        </Sheet>
      )}
    </Screen>
  )
}
