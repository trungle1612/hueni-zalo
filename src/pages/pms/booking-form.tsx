import React, { useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useNavigate } from 'zmp-ui'

import {
  A,
  AppBar,
  Field,
  KV,
  MoneyInput,
  PHONE_ERROR,
  phoneDigits,
  Screen,
  Sec,
  Segmented,
  Sheet,
  toast,
} from '@/modules/pms/components/ui'
import {
  addDays,
  Booking,
  bookingCode,
  can,
  daysBetween,
  fmtDate,
  inMaintenance,
  isEditable,
  isRoomFree,
  isStaying,
  money,
  paidOf,
  placeRooms,
  today,
  usePlace,
  usePms,
} from '@/modules/pms/pms.store'

const ORIGINS = ['Trực tiếp', 'Điện thoại / Zalo', 'Facebook', 'Khác']
const LABELS = {
  guest_phone: 'Số điện thoại',
  guest_name: 'Tên khách',
  guests: 'Số khách',
  origin: 'Nguồn',
  start_date: 'Nhận phòng',
  end_date: 'Trả phòng',
  room_id: 'Phòng',
  status: 'Trạng thái',
  price: 'Giá mỗi đêm',
  note: 'Ghi chú',
}
type Key = keyof typeof LABELS

// Create (/bookings/new?room=&start=) and edit (/bookings/:id/edit) share this form.
export default function BookingFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { rooms, bookings } = usePms()
  const editing = id ? bookings.find((b) => b.id === Number(id)) : undefined
  const fallback = usePlace()

  if (id && (!editing || !isEditable(editing))) {
    return (
      <Screen>
        <AppBar lead="back" title="Sửa đặt phòng" />
        <main className="scroll">
          <div className="empty">
            {editing ? 'Đặt phòng này không sửa được nữa.' : 'Không tìm thấy đặt phòng này.'}
            <A className="btn" to="/" replace>
              Về Hôm nay
            </A>
          </div>
        </main>
      </Screen>
    )
  }
  const paramRoom = rooms.find((r) => r.id === Number(params.get('room') || editing?.room_id))
  const placeId = paramRoom?.place_id ?? fallback.id
  return (
    <Form
      key={id || 'new'}
      editing={editing}
      placeId={placeId}
      roomId={paramRoom?.id}
      start={params.get('start') || undefined}
    />
  )
}

function Form({
  editing,
  placeId,
  roomId,
  start,
}: {
  editing?: Booking
  placeId: number
  roomId?: number
  start?: string
}) {
  const navigate = useNavigate()
  // From Hồ sơ khách: name and phone come as router state, never in the URL.
  const from = (useLocation().state || {}) as { guest_name?: string; guest_phone?: string }
  const { places, rooms, bookings, actions } = usePms()
  const owner = can(
    places.find((p) => p.id === placeId),
    'manage',
  )
  const roomList = placeRooms(rooms, placeId)
    .filter((r) => r.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))

  const start0 = editing?.start_date || start || today()
  const orig = {
    guest_phone: editing?.guest_phone || from.guest_phone || '',
    guest_name: editing?.guest_name || from.guest_name || '',
    guests: editing?.guests,
    origin: editing?.origin || 'Trực tiếp',
    start_date: start0,
    end_date: editing?.end_date || addDays(start0, 1),
    room_id:
      editing?.room_id ??
      roomId ??
      roomList.find((r) => !inMaintenance(r, start0) && isRoomFree(bookings, r.id, start0, addDays(start0, 1)))?.id,
    status: (editing?.status === 'hold' ? 'hold' : 'confirmed') as 'hold' | 'confirmed',
    price: editing?.price,
    note: editing?.note || '',
  }
  const [f, setF] = useState(orig)
  const [deposit, setDeposit] = useState<number>()
  const [tried, setTried] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [saved, setSaved] = useState<{ id: number; changes: [Key, string, string][] }>()
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch })

  const staying = !!editing && isStaying(editing)
  const n = daysBetween(f.start_date, f.end_date)
  const past = !editing && f.start_date < today()
  const datesOk = n > 0 && !past
  const busy = (roomId: number) => {
    const r = roomList.find((x) => x.id === roomId)!
    return (
      !datesOk || inMaintenance(r, f.start_date) || !isRoomFree(bookings, roomId, f.start_date, f.end_date, editing?.id)
    )
  }
  const free = roomList.filter((r) => !busy(r.id))
  const room = rooms.find((r) => r.id === f.room_id)
  const roomOk = !!room && !busy(room.id)
  const price = f.price ?? room?.price ?? 0
  const total = datesOk ? n * price : 0
  const paid = editing ? paidOf(editing, room) : deposit || 0
  const due = Math.max(0, total - paid)

  const err = {
    phone: tried && phoneDigits(f.guest_phone).length < 9 && PHONE_ERROR,
    name: tried && !f.guest_name.trim() && 'Nhập tên khách.',
    dates: (n <= 0 && 'Ngày trả phòng phải sau ngày nhận phòng.') || (past && 'Ngày nhận phòng đã qua.') || undefined,
    room:
      datesOk &&
      ((f.room_id !== undefined && !roomOk && `Phòng ${room?.name} đã kín trong các ngày này. Chọn phòng khác.`) ||
        (tried && f.room_id === undefined && free.length > 0 && 'Chọn một phòng.')),
    deposit: !!deposit && deposit > total && `Tiền cọc không được lớn hơn tổng ${money(total)}.`,
  }
  const invalid = !!(
    phoneDigits(f.guest_phone).length < 9 ||
    !f.guest_name.trim() ||
    err.dates ||
    !roomOk ||
    err.deposit
  )

  const show = (k: Key, v: unknown) =>
    k === 'start_date' || k === 'end_date'
      ? fmtDate(String(v))
      : k === 'room_id'
        ? rooms.find((r) => r.id === v)?.name || ''
        : k === 'price'
          ? money(Number(v ?? room?.price ?? 0))
          : k === 'status'
            ? v === 'hold'
              ? 'Giữ chỗ'
              : 'Đã xác nhận'
            : k === 'note' && String(v).length > 18
              ? `${String(v).slice(0, 18)}…`
              : String(v ?? '')
  const changed = (Object.keys(LABELS) as Key[]).filter((k) => String(f[k] ?? '') !== String(orig[k] ?? ''))
  const dirty = editing ? changed.length > 0 : !!(f.guest_name || f.guest_phone || deposit || f.note)

  // Same phone as an earlier booking: offer that guest's name.
  const digits = phoneDigits(f.guest_phone)
  const before =
    digits.length >= 9
      ? bookings.filter((b) => b.id !== editing?.id && b.guest_name && phoneDigits(b.guest_phone) === digits)
      : []
  const match = before[0]?.guest_name !== f.guest_name ? before[0] : undefined

  function save() {
    if (invalid) return setTried(true)
    const draft = {
      ...f,
      guest_name: f.guest_name.trim(),
      room_id: f.room_id!,
      payments: editing
        ? editing.payments
        : deposit
          ? [{ amount: deposit, method: 'cash' as const, at: new Date().toISOString(), deposit: true }]
          : [],
    }
    const result = editing ? actions.update(editing.id, draft) : actions.create(draft)
    if (typeof result === 'string') return toast(result)
    setSaved({
      id: editing?.id ?? (result as number),
      changes: changed.map((k) => [k, show(k, orig[k]), show(k, f[k])]),
    })
  }

  const close = () => (dirty && !saved ? setDiscard(true) : navigate(-1))
  const code = editing && bookingCode(editing)

  if (saved) {
    return (
      <Screen>
        <AppBar lead="close" onLead={() => navigate(-1)} title={editing ? `Đã lưu ${code}` : 'Đã lưu'} />
        <main className="scroll">
          <div className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {editing ? (
              <>
                <div className="ok-box" role="status">
                  <b>Đã lưu {saved.changes.length} thay đổi</b>
                  <span>Lịch phòng và số tiền còn thu đã được cập nhật.</span>
                </div>
                <dl className="panel">
                  {saved.changes.map(([k, from, to]) => (
                    <KV key={k} label={LABELS[k]}>
                      {from} → {to}
                    </KV>
                  ))}
                </dl>
                <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(-1)}>
                  Về đặt phòng
                </button>
              </>
            ) : (
              <>
                <div className="ok-box" role="status">
                  <b>Đã lưu đặt phòng {bookingCode({ id: saved.id })}</b>
                  <span>Lịch phòng đã được cập nhật.</span>
                </div>
                <dl className="panel">
                  <KV label="Khách">{f.guest_name}</KV>
                  <KV label="Phòng">Phòng {room?.name}</KV>
                  <KV label="Ngày ở">
                    {fmtDate(f.start_date)} – {fmtDate(f.end_date)} · {n} đêm
                  </KV>
                  <KV label="Tổng tiền">{money(total)}</KV>
                  <KV label="Đã cọc">{money(paid)}</KV>
                  <KV label="Còn phải thu" total>
                    {money(due)}
                  </KV>
                </dl>
                <A className="btn btn-primary btn-block" to="/calendar" replace>
                  Xem trên lịch
                </A>
                <A className="btn btn-block" to={`/bookings/${saved.id}`} replace>
                  Mở đặt phòng
                </A>
              </>
            )}
          </div>
        </main>
      </Screen>
    )
  }

  return (
    <Screen>
      <AppBar
        lead="close"
        onLead={close}
        title={editing ? `Sửa ${code}` : 'Đặt phòng mới'}
        sub={editing && `${editing.guest_name} · Phòng ${rooms.find((r) => r.id === editing.room_id)?.name}`}
      />
      <main className="scroll">
        <form onSubmit={(e) => (e.preventDefault(), save())}>
          <Sec title="Khách">
            <div className="panel form">
              <Field label="Số điện thoại" error={err.phone} changed={changed.includes('guest_phone')}>
                {(p) => (
                  <input
                    {...p}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="09xx xxx xxx"
                    value={f.guest_phone}
                    onChange={(e) => set({ guest_phone: e.target.value })}
                  />
                )}
              </Field>
              {match && (
                <div className="match">
                  <span>
                    Khách cũ: {match.guest_name} · đã đặt {before.length} lần
                  </span>
                  <button type="button" className="btn btn-sm" onClick={() => set({ guest_name: match.guest_name! })}>
                    Dùng thông tin
                  </button>
                </div>
              )}
              <Field label="Tên khách" error={err.name} changed={changed.includes('guest_name')}>
                {(p) => (
                  <input
                    {...p}
                    type="text"
                    autoComplete="name"
                    value={f.guest_name}
                    onChange={(e) => set({ guest_name: e.target.value })}
                  />
                )}
              </Field>
              <div className="grid2">
                <Field label="Số khách" optional={!f.guests} changed={changed.includes('guests')}>
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={f.guests ?? ''}
                      onChange={(e) => set({ guests: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  )}
                </Field>
                <Field label="Nguồn" changed={changed.includes('origin')}>
                  {(p) => (
                    <select {...p} value={f.origin} onChange={(e) => set({ origin: e.target.value })}>
                      {ORIGINS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
            </div>
          </Sec>

          <Sec title="Lưu trú">
            <div className="panel form">
              <div className="grid2">
                <Field label="Nhận phòng" changed={changed.includes('start_date')} error={err.dates && ' '}>
                  {(p) => (
                    <input
                      {...p}
                      type="date"
                      value={f.start_date}
                      disabled={staying}
                      onChange={(e) =>
                        e.target.value &&
                        set({
                          start_date: e.target.value,
                          end_date: f.end_date <= e.target.value ? addDays(e.target.value, 1) : f.end_date,
                        })
                      }
                    />
                  )}
                </Field>
                <Field label="Trả phòng" changed={changed.includes('end_date')} error={err.dates && ' '}>
                  {(p) => (
                    <input
                      {...p}
                      type="date"
                      value={f.end_date}
                      onChange={(e) => e.target.value && set({ end_date: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              {err.dates && (
                <div className="error" style={{ marginTop: -6 }}>
                  {err.dates}
                </div>
              )}
              <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                <legend className="lbl" style={{ padding: 0, marginBottom: 6 }}>
                  Phòng{' '}
                  {datesOk && (
                    <span className="opt">
                      · {free.length} phòng trống {fmtDate(f.start_date)} – {fmtDate(f.end_date)}
                    </span>
                  )}
                </legend>
                <div className="rooms">
                  {roomList.map((r) => {
                    const isBusy = busy(r.id)
                    const on = r.id === f.room_id
                    const why = !datesOk ? '' : inMaintenance(r, f.start_date) ? 'bảo trì' : 'có khách'
                    return (
                      <label
                        key={r.id}
                        className={['room', on && (isBusy ? 'clash' : 'on'), isBusy && !on && 'busy']
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <input
                          type="radio"
                          name="room"
                          checked={on}
                          disabled={isBusy && !on}
                          aria-label={`Phòng ${r.name}${isBusy ? `, ${why || 'chưa chọn được ngày'}` : ', trống'}`}
                          onChange={() => !isBusy && set({ room_id: r.id })}
                        />
                        <span>{r.name}</span>
                        {isBusy && why && <small>{why}</small>}
                      </label>
                    )
                  })}
                </div>
                {datesOk && !free.length && (
                  <div className="help" style={{ marginTop: 8 }}>
                    Không còn phòng trống trong các ngày này. Thử đổi ngày.
                  </div>
                )}
                {err.room && (
                  <div className="error" style={{ marginTop: 6 }}>
                    {err.room}
                  </div>
                )}
              </fieldset>
              {!staying && (
                <div className="field">
                  <span className="lbl">Trạng thái</span>
                  <Segmented
                    label="Trạng thái"
                    value={f.status}
                    onChange={(status) => set({ status })}
                    options={[
                      ['confirmed', 'Đã xác nhận'],
                      ['hold', 'Giữ chỗ'],
                    ]}
                  />
                  {f.status === 'hold' && (
                    <div className="help">Khách chưa chắc. Phòng vẫn được giữ tới khi xác nhận hoặc huỷ.</div>
                  )}
                </div>
              )}
            </div>
          </Sec>

          <Sec title="Thanh toán">
            <div className="panel form">
              <div className={editing ? undefined : 'grid2'}>
                <Field
                  label="Giá mỗi đêm (đ)"
                  changed={changed.includes('price')}
                  help={!owner && 'Chỉ chủ cơ sở đổi giá.'}
                >
                  {(p) => (
                    <MoneyInput
                      {...p}
                      value={price || undefined}
                      disabled={!owner}
                      onChange={(v) => set({ price: v })}
                    />
                  )}
                </Field>
                {!editing && (
                  <Field label="Đã cọc (đ)" optional error={err.deposit}>
                    {(p) => <MoneyInput {...p} placeholder="0" value={deposit} onChange={setDeposit} />}
                  </Field>
                )}
              </div>
              {editing && (
                <>
                  <dl className="panel">
                    <KV label="Tổng mới">{money(total)}</KV>
                    <KV label="Đã thanh toán">{money(paid)}</KV>
                    <KV label="Còn phải thu" total tone={due > 0 ? 'warn' : 'pos'}>
                      {money(due)}
                    </KV>
                  </dl>
                  <div className="help">Tiền đã thu được sửa ở phần Thanh toán của đặt phòng.</div>
                </>
              )}
              <Field
                label="Ghi chú"
                optional
                changed={changed.includes('note')}
                help={<span style={{ display: 'block', textAlign: 'right' }}>{f.note.length}/500</span>}
              >
                {(p) => (
                  <textarea {...p} maxLength={500} value={f.note} onChange={(e) => set({ note: e.target.value })} />
                )}
              </Field>
            </div>
          </Sec>
          <div className="end" />
        </form>
      </main>

      <div className="footer-bar">
        <div className="sum">
          {editing ? (
            <>
              <b>{changed.length ? `${changed.length} thay đổi` : 'Chưa có thay đổi'}</b>
              <span>
                Tổng {money(total)} · còn thu {money(due)}
              </span>
            </>
          ) : (
            <>
              <b>{money(total)}</b>
              <span>
                {datesOk ? n : 0} đêm × {money(price)} · còn thu {money(due)}
              </span>
            </>
          )}
        </div>
        <button type="button" className="btn btn-primary" disabled={!!editing && !changed.length} onClick={save}>
          {editing ? 'Lưu thay đổi' : 'Lưu đặt phòng'}
        </button>
      </div>

      {discard && (
        <Sheet
          title={editing ? `Bỏ ${changed.length} thay đổi chưa lưu?` : 'Bỏ đặt phòng đang nhập?'}
          onClose={() => setDiscard(false)}
        >
          <p className="help">
            {editing
              ? `Đặt phòng ${code} sẽ giữ nguyên như trước khi sửa.`
              : 'Thông tin bạn đã nhập sẽ không được lưu.'}
          </p>
          <button type="button" className="btn btn-danger btn-block" onClick={() => navigate(-1)}>
            {editing ? 'Bỏ thay đổi' : 'Bỏ và thoát'}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setDiscard(false)}>
            {editing ? 'Tiếp tục sửa' : 'Tiếp tục nhập'}
          </button>
        </Sheet>
      )}
    </Screen>
  )
}
