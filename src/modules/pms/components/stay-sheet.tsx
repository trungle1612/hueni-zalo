import React, { useState } from 'react'
import { useNavigate } from 'zmp-ui'

import {
  Booking,
  conflicts,
  dueOf,
  fmtDate,
  fmtRange,
  guestLabel,
  isStaying,
  money,
  paidOf,
  PAY_METHOD,
  PayMethod,
  Room,
  totalOf,
  usePms,
} from '../pms.store'
import { Field, KV, Segmented, Sheet, useRecord } from './ui'

export type StayKind = 'in' | 'early' | 'out'
const VERB: Record<StayKind, string> = { in: 'nhận phòng', early: 'nhận phòng sớm', out: 'trả phòng' }

// What a front-desk tap must stop for: money still owed, a room not cleaned, a clash, a missing guest count.
export function needsSheet(kind: StayKind, b: Booking, room: Room, all: Booking[]) {
  if (dueOf(b, room) > 0) return true
  if (kind === 'out') return false
  return (
    !b.guests ||
    room.housekeeping === 'dirty' ||
    (b.guests || 0) > room.max_guests ||
    conflicts(all).some((c) => c.manual.id === b.id || c.ota.id === b.id)
  )
}

export function useStay() {
  const actions = usePms((s) => s.actions)
  const record = useRecord()
  // pay first so Hoàn tác takes both back at once
  return (
    kind: StayKind,
    b: Booking,
    room: Room,
    opts: { collect?: number; method?: PayMethod; guests?: number } = {},
  ) => {
    const verb = VERB[kind]
    const note = opts.collect
      ? ` · đã thu ${money(opts.collect)} ${PAY_METHOD[opts.method || 'cash'].toLowerCase()}`
      : dueOf(b, room) > 0
        ? ` · ghi nợ ${money(dueOf(b, room))}`
        : ''
    return record(
      () => {
        if (opts.collect) actions.pay(b.id, opts.collect, opts.method || 'cash')
        if (kind === 'out') return actions.checkOut(b.id)
        if (kind === 'early') return actions.earlyCheckIn(b.id)
        return actions.checkIn(b.id, opts.guests)
      },
      `Đã ${verb} ${room.name}${note}${kind === 'out' ? ' · phòng cần dọn' : ''}`,
    )
  }
}

// Check-in / check-out when money is owed or something needs knowing. Facts warn, they never block.
export function StaySheet({
  kind,
  booking: b,
  room,
  onClose,
}: {
  kind: StayKind
  booking: Booking
  room: Room
  onClose: () => void
}) {
  const navigate = useNavigate()
  const all = usePms((s) => s.bookings)
  const stay = useStay()
  const [guests, setGuests] = useState<number | undefined>(b.guests)
  const [error, setError] = useState<string>()
  const [tried, setTried] = useState(false)
  const [method, setMethod] = useState<PayMethod>('cash')

  const verb = VERB[kind]
  const Verb = verb[0].toUpperCase() + verb.slice(1)
  const due = dueOf(b, room)
  const isIn = kind !== 'out'
  const clash = isIn && conflicts(all).find((c) => c.manual.id === b.id || c.ota.id === b.id)
  const other = clash && (clash.manual.id === b.id ? clash.ota : clash.manual)
  const stillIn = isIn && all.find((x) => x.id !== b.id && x.room_id === b.room_id && isStaying(x))
  const guestsBad = isIn && !b.guests && !(guests && guests >= 1)

  function go(collect?: number) {
    if (guestsBad) return setTried(true)
    const err = stay(kind, b, room, { collect, method, guests })
    if (err) setError(err)
    else onClose()
  }

  return (
    <Sheet title={`${Verb} ${room.name} · ${guestLabel(b)}`} onClose={onClose}>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {kind === 'early' && <p className="help">Ngày đến đổi từ {fmtDate(b.start_date)} thành hôm nay.</p>}
      {stillIn && (
        <div className="alert" role="alert">
          Phòng {room.name} còn {guestLabel(stillIn)} chưa trả phòng. Trả phòng cho khách đó trước.
        </div>
      )}
      {isIn && room.housekeeping === 'dirty' && (
        <div className="notice" role="alert">
          Phòng {room.name} chưa dọn xong. Nên đổi sang phòng đã sẵn sàng, hoặc mời khách chờ.
        </div>
      )}
      {other && (
        <div className="notice" role="alert">
          Trùng lịch đêm {fmtDate(other.start_date)} với {guestLabel(other)} ({fmtRange(other)}).
        </div>
      )}
      {isIn && (guests || 0) > room.max_guests && (
        <div className="notice" role="alert">
          {guests} khách, phòng {room.name} tối đa {room.max_guests}.
        </div>
      )}
      {isIn && !b.guests && (
        <Field
          label="Số khách"
          error={tried && guestsBad && 'Nhập số khách.'}
          help={`Phòng tối đa ${room.max_guests} khách.`}
        >
          {(p) => (
            <input
              {...p}
              type="number"
              inputMode="numeric"
              min={1}
              value={guests ?? ''}
              onChange={(e) => setGuests(e.target.value ? Number(e.target.value) : undefined)}
            />
          )}
        </Field>
      )}
      {due > 0 && (
        <dl className="panel">
          <KV label="Tổng tiền phòng">{money(totalOf(b, room))}</KV>
          <KV label="Đã thanh toán">{money(paidOf(b, room))}</KV>
          <KV label="Còn phải thu" total tone="warn">
            {money(due)}
          </KV>
        </dl>
      )}
      {due > 0 && (
        <div className="field">
          <span className="lbl">Khách trả bằng</span>
          <Segmented
            label="Khách trả bằng"
            value={method}
            onChange={setMethod}
            options={Object.entries(PAY_METHOD) as [PayMethod, string][]}
          />
        </div>
      )}
      {isIn && room.housekeeping === 'dirty' && b.source === 'manual' && (
        <button type="button" className="btn btn-block" onClick={() => navigate(`/bookings/${b.id}/edit`)}>
          Đổi phòng…
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!!stillIn}
        onClick={() => go(due || undefined)}
      >
        {due > 0 ? `Đã thu ${money(due)}, ${verb}` : isIn && room.housekeeping === 'dirty' ? `Vẫn ${verb}` : Verb}
      </button>
      {due > 0 && (
        <button type="button" className="btn btn-block" disabled={!!stillIn} onClick={() => go()}>
          {Verb}, ghi nợ
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}
