import dayjs from 'dayjs'
import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from 'zmp-ui'

import {
  A,
  AppBar,
  Badge,
  bookingStatus,
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
import { fold, guestKey, logActivity, useGuests } from '@/modules/pms/guests.store'
import { Booking, bookingCode, dueOf, fmtRange, money, nights, paidOf, totalOf, usePms } from '@/modules/pms/pms.store'

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

// "Cần lưu ý" line for any screen showing this guest's booking.
export function GuestFlagNotice({ booking }: { booking: Booking }) {
  const flag = useGuests((s) => s.flags[guestKey(booking)])
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
  const { bookings } = usePms()
  const flags = useGuests((s) => s.flags)
  const { rooms } = useCurrent()
  const [query, setQuery] = useState('')
  const ids = new Set(rooms.map((r) => r.id))

  const byKey = new Map<string, Booking[]>()
  bookings
    .filter((b) => ids.has(b.room_id) && guestKey(b))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .forEach((b) => byKey.set(guestKey(b), [...(byKey.get(guestKey(b)) || []), b]))
  const q = fold(query)
  const digits = phoneDigits(query)
  const guests = Array.from(byKey.entries())
    .map(([key, list]) => ({
      key,
      list,
      name: list.find((b) => b.guest_name)?.guest_name || 'Khách',
      stays: list.filter((b) => b.status !== 'cancelled').length,
    }))
    .filter(
      (g) =>
        !q || fold(g.name).includes(q) || (digits.length >= 3 && phoneDigits(g.list[0].guest_phone).includes(digits)),
    )
  const back2 = guests.filter((g) => g.stays >= 2).length

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
              {guests.length} khách{back2 ? ` · ${back2} quay lại` : ''}
            </span>
          }
        >
          {guests.length ? (
            <div className="panel">
              {guests.map((g) => (
                <A key={g.key} className="row" to={`/guests/${g.list[0].id}`}>
                  <span className="grow">
                    <span className="t1">{g.name}</span>
                    <span className="t2">
                      {g.list[0].guest_phone || 'Chưa có số'} · {g.stays} lần ở · gần nhất {fmtRange(g.list[0])}
                    </span>
                  </span>
                  {flags[g.key] ? (
                    <Badge tone="danger">Cần lưu ý</Badge>
                  ) : (
                    g.stays >= 2 && <Badge tone="primary">Khách quen</Badge>
                  )}
                </A>
              ))}
            </div>
          ) : (
            <div className="panel empty-row">Không có khách khớp “{query}”.</div>
          )}
        </Sec>
        <p className="foot">Khách đặt qua OTA không có hồ sơ: Airbnb và Booking.com không gửi tên, số điện thoại.</p>
      </main>
    </Screen>
  )
}

function Profile({ bookingId }: { bookingId: number }) {
  const navigate = useNavigate()
  const { bookings, rooms, user } = usePms()
  const { notes, flags, papers } = useGuests()
  const b = bookings.find((x) => x.id === bookingId)
  const key = b ? guestKey(b) : ''
  const [note, setNote] = useState(notes[key] || '')
  const [saved, setSaved] = useState<'Đã lưu' | 'Chưa lưu'>()
  const [reveal, setReveal] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [draft, setDraft] = useState('')

  if (!b || !key) {
    return (
      <Screen>
        <AppBar lead="back" title="Hồ sơ khách" />
        <main className="scroll">
          <div className="empty">Đặt phòng này không có hồ sơ khách (khách đặt qua OTA hoặc chưa có tên).</div>
        </main>
      </Screen>
    )
  }

  const roomOf = (id: number) => rooms.find((r) => r.id === id)
  const mine = bookings.filter((x) => guestKey(x) === key).sort((x, y) => y.start_date.localeCompare(x.start_date))
  const kept = mine.filter((x) => x.status !== 'cancelled')
  const name = mine.find((x) => x.guest_name)?.guest_name || 'Khách'
  const phone = phoneDigits(mine.find((x) => x.guest_phone)?.guest_phone)
  const first = kept[kept.length - 1] || mine[mine.length - 1]
  const p = papers[key]
  const paperLabel = p?.nationality === 'Việt Nam' ? 'CCCD' : 'Hộ chiếu'
  const flag = flags[key]

  function toggleId() {
    if (!reveal) {
      logActivity(mine[0], 'booking', `Xem số ${paperLabel}`, name)
      toast(`Đã ghi vào nhật ký: ${user.name} xem số ${paperLabel}`)
    }
    setReveal(!reveal)
  }
  function saveNote() {
    if (saved !== 'Chưa lưu') return
    useGuests.setState((s) => ({ notes: { ...s.notes, [key]: note.trim() } }))
    setSaved('Đã lưu')
  }
  function setFlag(text: string) {
    useGuests.setState((s) => ({ flags: { ...s.flags, [key]: text } }))
    logActivity(mine[0], 'booking', text ? 'Đánh dấu khách cần lưu ý' : 'Bỏ đánh dấu khách', name)
    setFlagging(false)
    toast(text ? 'Đã đánh dấu. Nhân viên sẽ thấy lưu ý khi mở đặt phòng.' : 'Đã bỏ đánh dấu')
  }

  return (
    <Screen>
      <AppBar lead="back" title={name} sub={`Hồ sơ khách · lần đầu ở ${dayjs(first.start_date).format('MM/YYYY')}`}>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setDraft('')
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
              <b>{kept.length}</b>
              <span>Lần ở</span>
            </div>
            <div className="stat">
              <b>{kept.reduce((n, x) => n + nights(x), 0)}</b>
              <span>Đêm</span>
            </div>
            <div className="stat">
              <b>{million(mine.reduce((n, x) => n + paidOf(x, roomOf(x.room_id)), 0))}</b>
              <span>Đã trả</span>
            </div>
            <div className="stat">
              <b>{million(mine.reduce((n, x) => n + dueOf(x, roomOf(x.room_id)), 0))}</b>
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
                <KV label="Giấy tờ">Chưa có · quét khi khai báo lưu trú</KV>
              )}
            </dl>
            {phone && (
              <div className="actions">
                <a className="btn btn-sm" href={`tel:${phone}`}>
                  Gọi
                </a>
                <a className="btn btn-sm" href={`https://zalo.me/${phone}`} target="_blank" rel="noopener noreferrer">
                  Nhắn Zalo
                </a>
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
                maxLength={300}
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
              const due = dueOf(x, room)
              return (
                <A key={x.id} className="row" to={`/bookings/${x.id}`}>
                  <span className="grow">
                    <span className="t1">
                      {fmtRange(x)}/{x.end_date.slice(0, 4)} · {room?.name}
                    </span>
                    <span className="t2">
                      {bookingCode(x)} · {nights(x)} đêm · {money(totalOf(x, room))}
                      {due > 0 && ` · còn thu ${money(due)}`}
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
