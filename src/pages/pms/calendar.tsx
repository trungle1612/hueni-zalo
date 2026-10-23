import React, { useState } from 'react'
import { useNavigate } from 'zmp-ui'

import {
  A,
  AppBar,
  Badge,
  Field,
  Icon,
  MoneyInput,
  PHONE_ERROR,
  phoneDigits,
  Screen,
  Sheet,
  Tone,
  useCurrent,
  useRecord,
} from '@/modules/pms/components/ui'
import {
  addDays,
  Booking,
  daysBetween,
  dueOf,
  fmtDate,
  fmtRange,
  guestLabel,
  isStaying,
  money,
  nights,
  occupiedUntil,
  occupies,
  paidOf,
  Room,
  sourceLabel,
  today,
  usePms,
  weekday,
} from '@/modules/pms/pms.store'

type BarTone = 'in' | 'ok' | 'warn' | 'out' | 'maint'
const CHIP: Record<BarTone, Tone> = { in: 'primary', ok: 'info', warn: 'warning', out: 'neutral', maint: 'neutral' }

type Bar = {
  key: string
  row: number
  start: string
  until: string // exclusive; a stay ends mid-cell on its checkout morning
  cont?: boolean // began before the week, or blocks the whole day
  tone: BarTone
  text: string
  status: string
  title: string
  sub: string
  booking?: Booking
}

function barOf(b: Booking, room: Room, row: number): Bar {
  const until = occupiedUntil(b)
  const due = dueOf(b, room)
  const [tone, status]: [BarTone, string] = isStaying(b)
    ? b.end_date <= today()
      ? ['out', 'Trả hôm nay']
      : ['in', 'Đang ở']
    : b.checked_out_at
      ? ['ok', 'Đã trả phòng']
      : b.status === 'hold'
        ? ['warn', 'Giữ chỗ']
        : b.source === 'manual' && due > 0 && !paidOf(b, room)
          ? ['warn', 'Chưa cọc']
          : due > 0
            ? ['ok', 'Đã cọc']
            : ['ok', 'Đã thanh toán']
  const words = guestLabel(b).split(/\s+/)
  return {
    key: `b${b.id}`,
    row,
    start: b.start_date,
    until,
    tone,
    text: words.length > 2 ? words.slice(-2).join(' ') : guestLabel(b),
    status,
    title: guestLabel(b),
    sub: `Phòng ${room.name} · ${fmtRange(b)} · ${nights(b)} đêm · ${sourceLabel(b)}`,
    booking: b,
  }
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const bookings = usePms((s) => s.bookings)
  const { rooms } = useCurrent()
  const [off, setOff] = useState(0)
  const [peek, setPeek] = useState<Bar>()
  const [quick, setQuick] = useState<{ room: Room; date: string; maxN: number }>()

  // 5 days on a narrow phone so names stay readable, a week from 420px up.
  const span = window.innerWidth < 420 ? 5 : 7
  const ws = addDays(today(), span * off)
  const we = addDays(ws, span)
  const dates = Array.from({ length: span }, (_, i) => addDays(ws, i))
  const cols = { gridTemplateColumns: `72px repeat(${span}, minmax(0, 1fr))` }

  const bars: Bar[] = rooms.flatMap((room, i) => {
    const row = i + 1
    if (!room.active)
      return [
        {
          key: `off${room.id}`,
          row,
          start: ws,
          until: we,
          cont: true,
          tone: 'maint' as const,
          text: 'Tạm ngưng',
          status: 'Tạm ngưng',
          title: `Phòng ${room.name} tạm ngưng`,
          sub: 'Mở lại phòng trên trang quản trị hueni.',
        },
      ]
    const list = bookings
      .filter(
        (b) =>
          b.room_id === room.id &&
          b.status !== 'cancelled' &&
          b.start_date < we &&
          (occupiedUntil(b) > ws || (isStaying(b) && occupiedUntil(b) >= ws)),
      )
      .map((b) => barOf(b, room, row))
    const m = room.maintenance
    if (m && m.until > ws && today() < we)
      list.push({
        key: `m${room.id}`,
        row,
        start: today(),
        until: m.until,
        cont: true,
        tone: 'maint',
        text: 'Bảo trì',
        status: 'Bảo trì',
        title: `Bảo trì phòng ${room.name}`,
        sub: `${m.reason} · đến ${fmtDate(m.until)}`,
      })
    return list
  })

  // Free nights from this cell up to the next booking (or maintenance): quick-book can't overlap.
  function openQuick(room: Room, date: string) {
    if (date < today() || !room.active) return
    const mine = bookings.filter((b) => b.room_id === room.id)
    if (mine.some((b) => occupies(b, date, addDays(date, 1)))) return
    if (room.maintenance && date < room.maintenance.until) return
    const next = mine
      .filter((b) => b.status !== 'cancelled' && b.start_date > date)
      .map((b) => b.start_date)
      .sort()[0]
    setQuick({ room, date, maxN: Math.min(next ? daysBetween(date, next) : 30, 30) })
  }

  return (
    <Screen tab="/calendar">
      <AppBar
        title="Lịch phòng"
        sub={`${fmtDate(ws)} – ${fmtDate(addDays(we, -1))}/${addDays(we, -1).slice(0, 4)} · ${rooms.length} phòng`}
      >
        {off !== 0 && (
          <button type="button" className="text-btn" onClick={() => setOff(0)}>
            Hôm nay
          </button>
        )}
        <A className="icon-btn" to="/search" aria-label="Tìm đặt phòng">
          <Icon name="search" />
        </A>
        <button
          type="button"
          className="icon-btn"
          aria-label={span === 7 ? 'Tuần trước' : `${span} ngày trước`}
          disabled={off <= -8}
          onClick={() => setOff(off - 1)}
        >
          <Icon name="prev" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={span === 7 ? 'Tuần sau' : `${span} ngày sau`}
          disabled={off >= 12}
          onClick={() => setOff(off + 1)}
        >
          <Icon name="next" />
        </button>
      </AppBar>

      <div className="days" style={cols} aria-hidden="true">
        <div />
        {dates.map((d) => (
          <div key={d} className={d === today() ? 'day today' : d < today() ? 'day past' : 'day'}>
            {weekday(d)}
            <b>{Number(d.slice(8))}</b>
          </div>
        ))}
      </div>

      <main className="scroll">
        <div
          className="grid"
          style={cols}
          role="group"
          aria-label={`Lịch đặt phòng ${fmtDate(ws)} đến ${fmtDate(addDays(we, -1))}`}
        >
          {rooms.map((r, i) => (
            <div
              key={r.id}
              className="grid-room"
              style={{ gridRow: i + 1, borderTop: i ? '1px solid var(--border)' : 0 }}
            >
              {r.name}
            </div>
          ))}
          {rooms.flatMap((r, i) =>
            dates.map((d, di) => (
              <button
                key={`${r.id}-${d}`}
                type="button"
                tabIndex={-1}
                className={d === today() ? 'cell today' : d < today() ? 'cell past' : 'cell'}
                aria-label={`Phòng ${r.name}, ${fmtDate(d)}${d < today() ? ', đã qua' : ', đặt nhanh'}`}
                style={{
                  gridColumn: di + 2,
                  gridRow: i + 1,
                  borderTop: i ? '1px solid var(--border)' : 0,
                  borderLeft: di ? '1px solid var(--border-subtle)' : 0,
                }}
                onClick={() => openQuick(r, d)}
              />
            )),
          )}
          {bars.map((b) => {
            const s0 = daysBetween(ws, b.start) + 1
            const e0 = daysBetween(ws, b.until) + 1
            const cont = b.cont || s0 < 1
            const st = Math.max(s0, 1)
            const endHalf = e0 <= span
            const cover = endHalf ? e0 - st + 1 : span + 1 - st
            const unit = 100 / cover
            return (
              <button
                key={b.key}
                type="button"
                className={`cal-bar ${b.tone}`}
                aria-label={`${b.title}, ${b.sub}, ${b.status}`}
                style={{
                  gridColumn: `${st + 1} / span ${cover}`,
                  gridRow: b.row,
                  marginLeft: cont ? 1 : `${unit / 2}%`,
                  marginRight: endHalf ? `${unit / 2}%` : 1,
                }}
                onClick={() => setPeek(b)}
              >
                {b.tone === 'warn' ? '! ' : ''}
                {b.text}
              </button>
            )
          })}
        </div>
        {!bars.some((b) => b.booking) && (
          <p className="help" style={{ margin: '12px 16px 0' }}>
            Chưa có đặt phòng nào trong tuần này.
          </p>
        )}
        <div className="legend">
          <span>
            <i
              className="sw"
              style={{ background: 'var(--primary-faint)', border: '1px solid var(--primary-border)' }}
            />
            Đang ở
          </span>
          <span>
            <i className="sw" style={{ background: 'var(--info-bg)', border: '1px solid var(--info-line)' }} />
            Đã cọc
          </span>
          <span>
            <i className="sw" style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-line)' }} />! Chưa
            cọc
          </span>
          <span>
            <i className="sw" style={{ border: '1px dashed var(--text-2)' }} />
            Trả hôm nay
          </span>
          <span>
            <i className="sw" style={{ background: 'var(--muted-bg)' }} />
            Bảo trì
          </span>
          <span style={{ flexBasis: '100%' }}>Chạm thanh để xem chi tiết, chạm ô trống để đặt nhanh.</span>
        </div>
      </main>

      {peek && (
        <Sheet title={peek.title} onClose={() => setPeek(undefined)}>
          <div style={{ marginTop: -6 }}>
            <Badge tone={CHIP[peek.tone]}>{peek.status}</Badge>
          </div>
          <p className="help">{peek.sub}</p>
          {peek.booking && (
            <p className="help">
              {peek.tone === 'warn' && 'Dấu ! trên lịch: chưa nhận tiền cọc. '}
              {peek.tone === 'out' && 'Viền nét đứt: khách trả phòng sáng nay. '}
              Thanh bắt đầu từ chiều ngày nhận phòng và hết vào sáng ngày trả phòng, nên một phòng có thể trả và nhận
              khách cùng ngày.
            </p>
          )}
          {peek.booking && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => (setPeek(undefined), navigate(`/bookings/${peek.booking!.id}`))}
            >
              Mở đặt phòng
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setPeek(undefined)}>
            Đóng
          </button>
        </Sheet>
      )}
      {quick && <QuickBook {...quick} onClose={() => setQuick(undefined)} />}
    </Screen>
  )
}

function QuickBook({ room, date, maxN, onClose }: { room: Room; date: string; maxN: number; onClose: () => void }) {
  const actions = usePms((s) => s.actions)
  const record = useRecord()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [n, setN] = useState(1)
  const [more, setMore] = useState(false)
  const [price, setPrice] = useState<number | undefined>(room.price)
  const [deposit, setDeposit] = useState<number>()
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string>()

  const total = n * (price || 0)
  const nameErr = tried && !name.trim() && 'Nhập tên khách.'
  const phoneErr = tried && phoneDigits(phone).length < 9 && PHONE_ERROR
  const depErr = !!deposit && deposit > total && `Tiền cọc không được lớn hơn tổng ${money(total)}.`

  function save() {
    if (!name.trim() || phoneDigits(phone).length < 9 || depErr) {
      setTried(true)
      if (depErr) setMore(true)
      return
    }
    const err = record(() => {
      const id = actions.create({
        room_id: room.id,
        start_date: date,
        end_date: addDays(date, n),
        status: 'confirmed',
        guest_name: name.trim(),
        guest_phone: phone,
        price: price === room.price ? undefined : price,
        origin: 'Trực tiếp',
        payments: deposit ? [{ amount: deposit, method: 'cash', at: new Date().toISOString(), deposit: true }] : [],
      })
      if (typeof id === 'string') return id
    }, `Đã đặt phòng ${room.name} cho ${name.trim()}`)
    if (err) setError(err)
    else onClose()
  }

  return (
    <Sheet title={`Đặt nhanh phòng ${room.name}`} onClose={onClose}>
      <p className="help" style={{ marginTop: -8 }}>
        {fmtDate(date)} – {fmtDate(addDays(date, n))} · {money(total)}
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <Field label="Tên khách" error={nameErr}>
        {(p) => (
          <input {...p} type="text" placeholder="Nguyễn Văn A" value={name} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label="Số điện thoại" error={phoneErr}>
        {(p) => (
          <input
            {...p}
            type="tel"
            inputMode="tel"
            placeholder="09xx xxx xxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        )}
      </Field>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="lbl">Số đêm</div>
          <div className="help">
            {n >= maxN && maxN < 30 ? `Tối đa ${maxN} đêm, sau đó phòng đã có khách.` : `${money(price || 0)} mỗi đêm`}
          </div>
        </div>
        <div className="stepper">
          <button type="button" aria-label="Giảm số đêm" disabled={n <= 1} onClick={() => setN(n - 1)}>
            −
          </button>
          <output aria-live="polite">{n} đêm</output>
          <button type="button" aria-label="Tăng số đêm" disabled={n >= maxN} onClick={() => setN(n + 1)}>
            +
          </button>
        </div>
      </div>
      <button type="button" className="more" aria-expanded={more} onClick={() => setMore(!more)}>
        <span>{more ? 'Ẩn giá và cọc' : 'Thêm giá và cọc'}</span>
        <span aria-hidden="true">{more ? '−' : '+'}</span>
      </button>
      {more && (
        <div className="grid2">
          <Field label="Giá mỗi đêm (đ)">{(p) => <MoneyInput {...p} value={price} onChange={setPrice} />}</Field>
          <Field label="Đã cọc (đ)" optional error={depErr}>
            {(p) => <MoneyInput {...p} placeholder="0" value={deposit} onChange={setDeposit} />}
          </Field>
        </div>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={save}>
        Đặt phòng
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}
