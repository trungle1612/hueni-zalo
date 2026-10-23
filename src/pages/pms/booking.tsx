import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from 'zmp-ui'

import { needsSheet, StayKind, StaySheet, useStay } from '@/modules/pms/components/stay-sheet'
import {
  A,
  AppBar,
  Badge,
  bookingStatus,
  Field,
  KV,
  MoneyInput,
  phoneDigits,
  Screen,
  Sec,
  Segmented,
  Sheet,
  useRecord,
} from '@/modules/pms/components/ui'
import {
  Booking,
  bookingCode,
  can,
  canCheckIn,
  canEarlyCheckIn,
  chargesOf,
  dueOf,
  fmtDate,
  fmtDay,
  fmtRange,
  fmtTime,
  guestLabel,
  hasWeekendPrice,
  isEditable,
  isRoomFree,
  isStaying,
  money,
  nightPrice,
  nights,
  occupiedUntil,
  overdueDays,
  paidOf,
  PAY_METHOD,
  PayMethod,
  PROVIDER_NAME,
  Room,
  roomTotalOf,
  sourceLabel,
  today,
  usePlaceOf,
  usePms,
  whenLabel,
} from '@/modules/pms/pms.store'
import { GuestFlagNotice } from '@/pages/pms/guests'

const isToday = (iso?: string) => !!iso && dayjs(iso).isSame(dayjs(), 'day')
// "08:08" on the planned day, "22/10 08:08" when it happened another day
const clock = (iso: string, planned: string) =>
  dayjs(iso).format(dayjs(iso).format('YYYY-MM-DD') === planned ? 'HH:mm' : 'DD/MM HH:mm')

type SheetKind = StayKind | 'pay' | 'cancel' | 'move' | 'undo-in' | 'undo-out'

export default function BookingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { bookings, rooms, activities, actions } = usePms()
  const b = bookings.find((x) => x.id === Number(id))
  const room = rooms.find((r) => r.id === b?.room_id)
  const place = usePlaceOf(b?.room_id)
  const stay = useStay()
  const record = useRecord()
  const [sheet, setSheet] = useState<SheetKind>()
  const [restoreError, setRestoreError] = useState<string>()

  useEffect(() => {
    if (id) actions.opened(Number(id))
  }, [id, actions])

  if (!b || !room) {
    return (
      <Screen>
        <AppBar lead="back" title="Đặt phòng" />
        <main className="scroll">
          <div className="empty">Không tìm thấy đặt phòng này. Có thể đã bị xoá khỏi lịch OTA.</div>
        </main>
      </Screen>
    )
  }

  const owner = can(place, 'manage')
  const status = bookingStatus(b)
  const due = dueOf(b, room)
  const paid = paidOf(b, room)
  const manual = b.source === 'manual'
  const log = activities.filter((a) => a.booking_id === b.id).sort((x, y) => x.at.localeCompare(y.at))
  const phone = phoneDigits(b.guest_phone)

  const note =
    b.status === 'cancelled'
      ? `Phòng ${room.name} đã trống lại cho ${fmtRange(b)}`
      : b.checked_out_at
        ? 'Đặt phòng đã hoàn tất'
        : isStaying(b) && !overdueDays(b)
          ? `Nhận ${fmtDay(b.start_date)} · trả ${fmtDay(b.end_date)}` // the badge already says Đang ở / Trả hôm nay
          : whenLabel(b)

  function startStay(kind: StayKind) {
    if (kind === 'early' || needsSheet(kind, b!, room!, bookings)) return setSheet(kind)
    if (stay(kind, b!, room!)) setSheet(kind)
  }

  const main: { label: string; run: () => void } | undefined = isStaying(b)
    ? { label: 'Trả phòng', run: () => startStay('out') }
    : canCheckIn(b)
      ? { label: 'Nhận phòng', run: () => startStay('in') }
      : b.status === 'hold'
        ? {
            label: 'Xác nhận đặt phòng',
            run: () => record(() => actions.confirm(b.id), `Đã xác nhận ${bookingCode(b)}`),
          }
        : canEarlyCheckIn(b)
          ? { label: 'Nhận phòng sớm', run: () => setSheet('early') }
          : b.status === 'cancelled' && manual
            ? { label: 'Khôi phục đặt phòng', run: () => restore() }
            : undefined
  function restore() {
    setRestoreError(record(() => actions.uncancel(b!.id), `Đã khôi phục ${bookingCode(b!)}`) || undefined)
  }

  return (
    <Screen>
      <AppBar lead="back" title={guestLabel(b)} sub={`${bookingCode(b)} · Phòng ${room.name}`}>
        {isEditable(b) && (
          <button type="button" className="text-btn" onClick={() => navigate(`/bookings/${b.id}/edit`)}>
            Sửa
          </button>
        )}
      </AppBar>

      <main className="scroll">
        <div className="sec" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="help">{note}</span>
        </div>
        <GuestFlagNotice booking={b} />
        {restoreError && (
          <div className="sec">
            <div className="alert" role="alert">
              {restoreError}
            </div>
          </div>
        )}

        <Sec title="Khách">
          <div className="panel">
            <dl>
              <KV label="Điện thoại">{b.guest_phone || 'Chưa có'}</KV>
              <KV label="Số khách">{b.guests ? `${b.guests} khách` : 'Chưa rõ'}</KV>
              <KV label="Nguồn">{manual ? b.origin || 'Trực tiếp' : sourceLabel(b)}</KV>
            </dl>
            {manual && (
              <div className="actions">
                {phone && (
                  <>
                    <a className="btn btn-sm" href={`tel:${phone}`}>
                      Gọi
                    </a>
                    <a
                      className="btn btn-sm"
                      href={`https://zalo.me/${phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Nhắn Zalo
                    </a>
                  </>
                )}
                <A className="btn btn-sm" to={`/guests/${b.id}`}>
                  Hồ sơ khách
                </A>
              </div>
            )}
          </div>
        </Sec>

        <Sec title="Lưu trú">
          <div className="panel">
            <dl>
              <KV label="Nhận phòng">
                {fmtDay(b.start_date)}
                {b.checked_in_at && ` · ${clock(b.checked_in_at, b.start_date)}`}
              </KV>
              <KV label="Trả phòng">
                {fmtDay(b.end_date)}
                {b.checked_out_at && ` · ${clock(b.checked_out_at, b.end_date)}`}
              </KV>
              <KV label="Phòng">
                {room.name} · {nights(b)} đêm
              </KV>
              {!!room.amenities?.length && <KV label="Tiện nghi">{room.amenities.join(', ')}</KV>}
              {b.checked_in_at && (
                <KV label="Khai báo lưu trú" tone={b.declared_at ? 'pos' : 'warn'}>
                  {b.declared_at ? `Đã khai báo ${fmtDate(b.declared_at.slice(0, 10))}` : 'Chưa khai báo'}
                </KV>
              )}
            </dl>
            {(isStaying(b) && !b.declared_at) || (isStaying(b) && manual) ? (
              <div className="actions">
                {!b.declared_at && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => record(() => actions.declare(b.id), 'Đã ghi: đã khai báo lưu trú')}
                  >
                    Đã khai báo
                  </button>
                )}
                {manual && (
                  <button type="button" className="btn btn-sm" onClick={() => setSheet('move')}>
                    Đổi phòng…
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </Sec>

        <Sec title="Thanh toán">
          <div className="panel">
            <dl>
              <KV
                label={
                  hasWeekendPrice(b, room)
                    ? `${nights(b)} đêm · T6–T7 giá riêng`
                    : `${nights(b)} đêm × ${money(nightPrice(b, room))}`
                }
              >
                {money(roomTotalOf(b, room))}
              </KV>
              {manual && chargesOf(b) > 0 && <KV label="Dịch vụ">{money(chargesOf(b))}</KV>}
              {manual && b.discount && <KV label="Giảm giá">{money(-b.discount.amount)}</KV>}
              {manual ? (
                (b.payments || []).map((p, i) => (
                  <KV
                    key={i}
                    label={`${p.amount < 0 ? 'Hoàn tiền' : p.deposit ? 'Cọc' : 'Thu'} · ${PAY_METHOD[p.method].toLowerCase()} · ${fmtDate(p.at.slice(0, 10))}`}
                  >
                    {money(-p.amount)}
                  </KV>
                ))
              ) : (
                <KV label={`Thanh toán qua ${PROVIDER_NAME[b.provider || 'other']}`}>{money(-paid)}</KV>
              )}
              <KV label="Còn phải thu" total tone={due > 0 ? 'warn' : 'pos'}>
                {money(due)}
              </KV>
            </dl>
            {(due > 0 || manual) && (
              <div className="actions">
                {due > 0 && (
                  <button type="button" className="btn btn-sm" onClick={() => setSheet('pay')}>
                    Ghi nhận thanh toán
                  </button>
                )}
                {manual && (
                  <A className="btn btn-sm" to={`/bookings/${b.id}/folio`}>
                    Phiếu tính tiền · dịch vụ · hoá đơn
                  </A>
                )}
              </div>
            )}
          </div>
        </Sec>

        {b.note && (
          <Sec title="Ghi chú">
            <div className="panel note">{b.note}</div>
          </Sec>
        )}

        {log.length > 0 && (
          <Sec title="Lịch sử">
            <ol className="log panel">
              {log.map((a) => (
                <li key={a.id}>
                  <time>{fmtTime(a.at)}</time>
                  <span>
                    {a.actor}: {a.action.toLowerCase()}
                    {a.detail && ` · ${a.detail}`}
                  </span>
                </li>
              ))}
            </ol>
          </Sec>
        )}

        {owner && (isToday(b.checked_in_at) || isToday(b.checked_out_at)) && (
          <Sec>
            <button
              type="button"
              className="btn btn-block"
              onClick={() => setSheet(b.checked_out_at ? 'undo-out' : 'undo-in')}
            >
              {b.checked_out_at ? 'Hoàn tác trả phòng…' : 'Hoàn tác nhận phòng…'}
            </button>
          </Sec>
        )}

        {manual && !b.checked_in_at && b.status !== 'cancelled' && (
          <Sec>
            <button type="button" className="btn btn-block btn-danger-entry" onClick={() => setSheet('cancel')}>
              Huỷ đặt phòng…
            </button>
          </Sec>
        )}
        <div className="end" />
      </main>

      {main && (
        <div className="footer-bar">
          <button type="button" className="btn btn-primary btn-block" onClick={main.run}>
            {main.label}
          </button>
        </div>
      )}

      {(sheet === 'in' || sheet === 'out' || sheet === 'early') && (
        <StaySheet kind={sheet} booking={b} room={room} onClose={() => setSheet(undefined)} />
      )}
      {sheet === 'pay' && <PaySheet booking={b} room={room} onClose={() => setSheet(undefined)} />}
      {sheet === 'cancel' && <CancelSheet booking={b} room={room} owner={owner} onClose={() => setSheet(undefined)} />}
      {sheet === 'move' && <MoveSheet booking={b} room={room} onClose={() => setSheet(undefined)} />}
      {(sheet === 'undo-in' || sheet === 'undo-out') && (
        <UndoSheet booking={b} room={room} out={sheet === 'undo-out'} onClose={() => setSheet(undefined)} />
      )}
    </Screen>
  )
}

type SheetProps = { booking: Booking; room: Room; onClose: () => void }

function PaySheet({ booking: b, room, onClose }: SheetProps) {
  const actions = usePms((s) => s.actions)
  const record = useRecord()
  const due = dueOf(b, room)
  const [amount, setAmount] = useState<number | undefined>(due)
  const [method, setMethod] = useState<PayMethod>('cash')
  const [tried, setTried] = useState(false)
  const bad =
    !amount || amount <= 0 ? 'Nhập số tiền lớn hơn 0.' : amount > due && `Số tiền không được lớn hơn ${money(due)}.`

  function save() {
    if (bad) return setTried(true)
    record(() => actions.pay(b.id, amount!, method), `Đã ghi nhận ${money(amount!)}`)
    onClose()
  }

  return (
    <Sheet title="Ghi nhận thanh toán" onClose={onClose}>
      <Field label="Số tiền (đ)" error={tried && bad} help={`Còn phải thu ${money(due)}. Có thể thu một phần.`}>
        {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}
      </Field>
      <div className="field">
        <span className="lbl">Hình thức</span>
        <Segmented
          label="Hình thức"
          value={method}
          onChange={setMethod}
          options={Object.entries(PAY_METHOD) as [PayMethod, string][]}
        />
      </div>
      {method === 'bank' && <p className="help">Nội dung chuyển khoản: {bookingCode(b).replace('-', '')}</p>}
      <button type="button" className="btn btn-primary btn-block" onClick={save}>
        Ghi nhận {money(amount || 0)}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}

const REASONS = ['Khách huỷ', 'Khách không đến', 'Đặt trùng', 'Lý do khác']

function CancelSheet({ booking: b, room, owner, onClose }: SheetProps & { owner: boolean }) {
  const actions = usePms((s) => s.actions)
  const record = useRecord()
  const paid = paidOf(b, room)
  const [reason, setReason] = useState<string>()
  // No default: what happens to the deposit is a decision, not a pre-filled answer.
  const [refund, setRefund] = useState<boolean>()
  const [method, setMethod] = useState<PayMethod>('cash')
  const ready = !!reason && (!paid || refund !== undefined)

  function confirm() {
    if (!ready) return
    const dep = !paid
      ? ''
      : refund
        ? owner
          ? `hoàn cọc ${money(paid)} ${PAY_METHOD[method].toLowerCase()}`
          : `chờ duyệt hoàn cọc ${money(paid)}`
        : `giữ cọc ${money(paid)}`
    record(
      () => {
        if (refund && owner) actions.pay(b.id, -paid, method)
        return actions.cancel(b.id, [reason, dep].filter(Boolean).join(', '))
      },
      `Đã huỷ ${bookingCode(b)}${dep ? ` · ${dep}` : ''}`,
    )
    onClose()
  }

  return (
    <Sheet title={`Huỷ đặt phòng ${bookingCode(b)}?`} onClose={onClose}>
      <p className="help">
        Phòng {room.name} sẽ trống lại cho {fmtRange(b)}.
      </p>
      <div className="field">
        <span className="lbl" id="c-r">
          Lý do
        </span>
        <div className="panel" role="radiogroup" aria-labelledby="c-r">
          {REASONS.map((r) => (
            <label key={r} className="choice">
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
              {r}
            </label>
          ))}
        </div>
      </div>
      {paid > 0 && (
        <div className="field">
          <span className="lbl" id="c-d">
            Tiền cọc {money(paid)}
          </span>
          <div className="panel" role="radiogroup" aria-labelledby="c-d">
            <label className="choice">
              <input type="radio" name="dep" checked={refund === false} onChange={() => setRefund(false)} />
              Giữ lại tiền cọc
            </label>
            <label className="choice">
              <input type="radio" name="dep" checked={refund === true} onChange={() => setRefund(true)} />
              {owner ? `Hoàn lại ${money(paid)} cho khách` : 'Xin chủ cơ sở duyệt hoàn cọc'}
            </label>
          </div>
          {refund && owner && (
            <Segmented
              label="Hoàn bằng"
              value={method}
              onChange={setMethod}
              options={Object.entries(PAY_METHOD) as [PayMethod, string][]}
            />
          )}
          {refund && !owner && (
            <p className="help">
              Tài khoản Lễ tân không tự hoàn tiền. Chủ cơ sở sẽ nhận yêu cầu và hoàn cọc sau khi duyệt.
            </p>
          )}
        </div>
      )}
      {!ready && <p className="help">Chọn lý do{paid > 0 && ' và cách xử lý tiền cọc'} để huỷ.</p>}
      <button type="button" className="btn btn-danger btn-block" disabled={!ready} onClick={confirm}>
        Huỷ đặt phòng
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Không huỷ
      </button>
    </Sheet>
  )
}

function MoveSheet({ booking: b, room, onClose }: SheetProps) {
  const { rooms, bookings, actions } = usePms()
  const record = useRecord()
  const free = rooms.filter(
    (r) =>
      r.place_id === room.place_id &&
      r.id !== room.id &&
      r.active &&
      isRoomFree(bookings, r.id, today(), occupiedUntil(b), b.id),
  )
  const [to, setTo] = useState<number>()
  const target = free.find((r) => r.id === to)

  return (
    <Sheet title={`Đổi phòng cho ${guestLabel(b)}`} onClose={onClose}>
      <p className="help">Khách đang ở phòng {room.name}. Phòng cũ sẽ chuyển sang Cần dọn.</p>
      {free.length ? (
        <div className="panel" role="radiogroup" aria-label="Phòng trống">
          {free.map((r) => (
            <label key={r.id} className="choice">
              <input type="radio" name="move" checked={to === r.id} onChange={() => setTo(r.id)} />
              Phòng {r.name}
              {r.housekeeping === 'dirty' && ' · chưa dọn'}
            </label>
          ))}
        </div>
      ) : (
        <p className="help">Không còn phòng trống đến {fmtDate(occupiedUntil(b))}.</p>
      )}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!target}
        onClick={() => {
          record(() => actions.move(b.id, target!.id), `Đã đổi ${guestLabel(b)} sang phòng ${target!.name}`)
          onClose()
        }}
      >
        {target ? `Đổi sang phòng ${target.name}` : 'Chọn phòng'}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}

function UndoSheet({ booking: b, room, out, onClose }: SheetProps & { out: boolean }) {
  const actions = usePms((s) => s.actions)
  const record = useRecord()
  const [error, setError] = useState<string>()
  const what = out ? 'trả phòng' : 'nhận phòng'
  return (
    <Sheet title={`Hoàn tác ${what} ${room.name}?`} onClose={onClose}>
      <p className="help">
        {out
          ? `${guestLabel(b)} sẽ lại là khách đang ở phòng ${room.name}.`
          : `${guestLabel(b)} sẽ về lại chờ nhận phòng.`}
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => {
          const err = record(
            () => (out ? actions.undoCheckOut(b.id) : actions.undoCheckIn(b.id)),
            `Đã hoàn tác ${what} ${room.name}`,
          )
          if (err) setError(err)
          else onClose()
        }}
      >
        Hoàn tác {what}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Không hoàn tác
      </button>
    </Sheet>
  )
}
