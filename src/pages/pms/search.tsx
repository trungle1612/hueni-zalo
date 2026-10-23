import React, { useState } from 'react'

import {
  A,
  Badge,
  bookingStatus,
  Icon,
  phoneDigits,
  Screen,
  Sec,
  useBack,
  useCurrent,
} from '@/modules/pms/components/ui'
import { Booking, bookingCode, fmtRange, guestLabel, isStaying, today, usePms } from '@/modules/pms/pms.store'

// "Nguyễn Thị Lan" matches "nguyen thi lan".
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

const GROUPS: [string, (b: Booking) => boolean][] = [
  ['Đang ở', isStaying],
  ['Sắp đến', (b) => b.status !== 'cancelled' && !b.checked_in_at && b.end_date > today()],
  ['Đã qua và đã huỷ', () => true],
]

export default function SearchPage() {
  const back = useBack()
  const { bookings, recent } = usePms()
  const { rooms, roomOf } = useCurrent()
  const [query, setQuery] = useState('')

  const ids = new Set(rooms.map((r) => r.id))
  const mine = bookings.filter((b) => ids.has(b.room_id))
  const q = query.trim()
  const digits = phoneDigits(q)
  const isPhone = digits.length >= 3 && digits.length === q.replace(/[\s+.-]/g, '').length
  const fq = fold(q).replace(/-/g, '')
  const hits =
    q.length >= 2
      ? mine
          .filter(
            (b) =>
              (isPhone && phoneDigits(b.guest_phone).includes(digits)) ||
              fold(bookingCode(b)).replace(/-/g, '').includes(fq) ||
              fold(guestLabel(b)).includes(fold(q)),
          )
          .sort((a, b) => b.start_date.localeCompare(a.start_date))
      : []
  const seen = new Set<number>()
  const groups = GROUPS.map(([title, test]) => {
    const items = hits.filter((b) => !seen.has(b.id) && test(b))
    items.forEach((b) => seen.add(b.id))
    return { title, items }
  }).filter((g) => g.items.length)

  const row = (b: Booking) => {
    const s = bookingStatus(b)
    return (
      <A className="row" key={b.id} to={`/bookings/${b.id}`}>
        <span className="grow">
          <span className="t1">{guestLabel(b)}</span>
          <span className="t2">
            {bookingCode(b)} · {roomOf(b.room_id)?.name} · {fmtRange(b)}
          </span>
        </span>
        <Badge tone={s.tone}>{s.label}</Badge>
      </A>
    )
  }
  // Nothing opened yet: today's guests are the likeliest search anyway.
  const todayRows = mine.filter(
    (b) => b.status !== 'cancelled' && !b.checked_out_at && (isStaying(b) || b.start_date === today()),
  )
  const recentRows = recent.map((id) => mine.find((b) => b.id === id)).filter(Boolean) as Booking[]

  return (
    <Screen>
      <header className="bar has-back">
        <button type="button" className="icon-btn" aria-label="Quay lại" onClick={back}>
          <Icon name="back" />
        </button>
        <div className="qwrap">
          <label htmlFor="q" className="sr-only">
            Tìm đặt phòng
          </label>
          <input
            id="q"
            className="input"
            type="search"
            autoComplete="off"
            autoFocus
            placeholder="Tên, số điện thoại hoặc mã"
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
        {!q && (
          <>
            <div className="sec">
              <p className="help">
                Tìm trong tất cả đặt phòng của cơ sở. Gõ tên có dấu hoặc không dấu, số điện thoại, hoặc mã như DP-0004.
              </p>
            </div>
            {recentRows.length > 0 ? (
              <Sec title="Mở gần đây">
                <div className="panel">{recentRows.map(row)}</div>
              </Sec>
            ) : (
              todayRows.length > 0 && (
                <Sec title="Khách hôm nay">
                  <div className="panel">{todayRows.map(row)}</div>
                </Sec>
              )
            )}
          </>
        )}
        {q.length === 1 && (
          <div className="sec">
            <p className="help">Nhập ít nhất 2 ký tự.</p>
          </div>
        )}
        {groups.length > 0 && (
          <>
            <div className="sec" style={{ paddingTop: 12 }}>
              <p className="help">{hits.length} đặt phòng</p>
            </div>
            {groups.map((g) => (
              <Sec key={g.title} title={g.title} aside={<span className="aside">{g.items.length}</span>}>
                <div className="panel">{g.items.map(row)}</div>
              </Sec>
            ))}
          </>
        )}
        {q.length >= 2 && !hits.length && (
          <div className="empty">
            <div style={{ color: 'var(--text)', fontWeight: 600 }}>Không có đặt phòng khớp “{q}”.</div>
            <div>Kiểm tra lại chính tả hoặc số điện thoại. Khách mới thì tạo đặt phòng.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <A className="btn btn-primary" to="/bookings/new">
                + Đặt phòng mới
              </A>
              <button type="button" className="btn" onClick={() => setQuery('')}>
                Xoá tìm kiếm
              </button>
            </div>
          </div>
        )}
        <div className="end" />
      </main>
    </Screen>
  )
}
