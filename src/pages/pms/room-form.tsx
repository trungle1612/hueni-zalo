import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from 'zmp-ui'

import {
  A,
  AppBar,
  Field,
  KV,
  MoneyInput,
  Screen,
  Sec,
  Sheet,
  toast,
  useCurrent,
  useRecord,
} from '@/modules/pms/components/ui'
import {
  AMENITIES,
  can,
  fmtDate,
  fmtRange,
  guestLabel,
  money,
  Room,
  ROOM_KINDS,
  RoomDraft,
  upcomingOn,
  usePms,
} from '@/modules/pms/pms.store'

const LABELS: Record<keyof RoomDraft, string> = {
  place_id: 'Cơ sở',
  name: 'Số phòng',
  floor: 'Tầng',
  kind: 'Loại phòng',
  max_guests: 'Số khách tối đa',
  price: 'Giá mỗi đêm',
  weekend_price: 'Giá thứ 6, thứ 7',
  amenities: 'Tiện nghi',
  active: 'Nhận đặt phòng mới',
  note: 'Ghi chú nội bộ',
}

// Add (/rooms/new) and edit (/rooms/:id/edit) a room. Owner only; staff only change a room's status.
export default function RoomFormPage() {
  const { id } = useParams()
  const rooms = usePms((s) => s.rooms)
  const { place } = useCurrent()
  const room = id ? rooms.find((r) => r.id === Number(id)) : undefined

  if (!can(place, 'manage')) {
    return (
      <Screen>
        <AppBar lead="close" title={id ? 'Sửa phòng' : 'Thêm phòng'} sub="Cần quyền chủ cơ sở" />
        <main className="scroll">
          <div className="sec">
            <div className="panel msg">
              <h2>Chỉ chủ cơ sở được thêm hoặc sửa phòng</h2>
              <p>
                Tài khoản <b style={{ color: 'var(--text)' }}>Lễ tân</b> đổi được tình trạng phòng (cần dọn, sẵn sàng,
                bảo trì) nhưng không đổi được số phòng, loại phòng hay giá.
              </p>
              <p>Cần thay đổi, hãy báo chủ cơ sở hoặc nhờ cấp quyền trên trang quản trị hueni, mục Nhân viên.</p>
              <div style={{ marginTop: 4 }}>
                <A className="btn" to="/rooms" replace>
                  Về danh sách phòng
                </A>
              </div>
            </div>
          </div>
        </main>
      </Screen>
    )
  }
  if (id && !room) {
    return (
      <Screen>
        <AppBar lead="back" title="Sửa phòng" />
        <main className="scroll">
          <div className="empty">
            Không tìm thấy phòng này. Có thể đã bị xoá.
            <A className="btn" to="/rooms" replace>
              Về danh sách phòng
            </A>
          </div>
        </main>
      </Screen>
    )
  }
  return <Form key={id || 'new'} room={room} placeId={place.id} placeName={place.name} />
}

function Form({ room, placeId, placeName }: { room?: Room; placeId: number; placeName: string }) {
  const navigate = useNavigate()
  const { rooms, bookings, actions } = usePms()
  const record = useRecord()
  const editing = !!room
  const mine = rooms.filter((r) => r.place_id === placeId)
  const floors = Array.from(new Set(mine.map((r) => r.floor).filter((f): f is number => !!f))).sort((a, b) => a - b)
  const nextFloor = (floors[floors.length - 1] || 0) + 1

  const orig: RoomDraft = {
    place_id: placeId,
    name: room?.name || '',
    floor: room?.floor ?? floors[0] ?? 1,
    kind: room?.kind || ROOM_KINDS[0],
    max_guests: room?.max_guests ?? 2,
    price: room?.price,
    weekend_price: room?.weekend_price,
    amenities: room?.amenities || [],
    active: room?.active ?? true,
    note: room?.note || '',
  }
  const [f, setF] = useState(orig)
  const [tried, setTried] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saved, setSaved] = useState<{ name: string; changes: number }>()
  const set = (patch: Partial<RoomDraft>) => setF({ ...f, ...patch })

  const name = f.name.trim()
  const dup = !!name && mine.some((r) => r.id !== room?.id && r.name.toLowerCase() === name.toLowerCase())
  const err = {
    name: dup ? `Phòng ${name} đã có. Chọn số khác.` : tried && !name && 'Nhập số phòng.',
    price: tried && !(f.price && f.price > 0) && 'Nhập giá mỗi đêm lớn hơn 0.',
  }
  const keys = Object.keys(LABELS) as (keyof RoomDraft)[]
  const changed = keys.filter((k) => JSON.stringify(f[k] ?? '') !== JSON.stringify(orig[k] ?? ''))
  const dirty = editing ? changed.length > 0 : !!(name || f.price || f.note)
  const ahead = room ? upcomingOn(bookings, room.id) : []
  const keepPrice = ahead.filter((b) => b.price === undefined).length
  const tooMany = ahead.find((b) => (b.guests || 0) > f.max_guests)
  const priceChanged = editing && (changed.includes('price') || changed.includes('weekend_price'))
  const cls = (k: keyof RoomDraft) => editing && changed.includes(k)

  function save() {
    if (!name || dup || !(f.price && f.price > 0)) return setTried(true)
    const result = actions.saveRoom({ ...f, name, weekend_price: f.weekend_price || undefined }, room?.id)
    if (typeof result === 'string') return toast(result)
    setSaved({ name, changes: changed.length })
  }

  const close = () => (dirty && !saved ? setDiscard(true) : navigate(-1))
  const summary = (
    <dl className="panel">
      <KV label="Phòng">
        {name} · tầng {f.floor}
      </KV>
      <KV label="Loại">
        {f.kind} · tối đa {f.max_guests} khách
      </KV>
      <KV label="Giá">
        {money(f.price || 0)}
        {f.weekend_price ? ` · T6–T7 ${money(f.weekend_price)}` : ''}
      </KV>
      <KV label="Tiện nghi">{f.amenities?.length ? f.amenities.join(', ') : 'Chưa chọn'}</KV>
      <KV label="Nhận đặt mới">{f.active ? 'Có' : 'Tạm ngưng'}</KV>
    </dl>
  )

  if (saved) {
    return (
      <Screen>
        <AppBar
          lead="close"
          onLead={() => navigate('/rooms', { replace: true })}
          title={editing ? `Đã lưu phòng ${saved.name}` : 'Đã thêm phòng'}
        />
        <main className="scroll">
          <div className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="ok-box" role="status">
              <b>
                {editing ? `Đã lưu ${saved.changes} thay đổi cho phòng ${saved.name}` : `Đã thêm phòng ${saved.name}`}
              </b>
              <span>
                {editing
                  ? 'Lịch và danh sách phòng đã cập nhật.'
                  : `Phòng ${saved.name} đã có trên lịch và ${f.active ? 'sẵn sàng nhận đặt phòng' : 'đang tạm ngưng'}.`}
              </span>
            </div>
            {summary}
            <A className="btn btn-primary btn-block" to="/rooms" replace>
              Về danh sách phòng
            </A>
            {!editing && (
              <button
                type="button"
                className="btn btn-block"
                onClick={() => (setF(orig), setTried(false), setSaved(undefined))}
              >
                Thêm phòng khác
              </button>
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
        title={editing ? `Sửa phòng ${room!.name}` : 'Thêm phòng'}
        sub={
          editing && room!.updated_at
            ? `${placeName} · sửa lần cuối ${fmtDate(room!.updated_at.slice(0, 10))}`
            : placeName
        }
      />
      <main className="scroll">
        <form onSubmit={(e) => (e.preventDefault(), save())}>
          <Sec title="Thông tin phòng">
            <div className="panel form">
              <div className="grid2">
                <Field label="Số phòng" error={err.name} changed={cls('name')}>
                  {(p) => (
                    <input
                      {...p}
                      type="text"
                      maxLength={12}
                      placeholder="111"
                      value={f.name}
                      onChange={(e) => set({ name: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Tầng" changed={cls('floor')}>
                  {(p) => (
                    <select {...p} value={f.floor} onChange={(e) => set({ floor: Number(e.target.value) })}>
                      {[...floors, nextFloor].map((n) => (
                        <option key={n} value={n}>
                          Tầng {n}
                          {!floors.includes(n) && floors.length ? ' (mới)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
              <Field label="Loại phòng" changed={cls('kind')} help="Loại phòng dùng để lọc lịch và báo cáo.">
                {(p) => (
                  <select {...p} value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
                    {ROOM_KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                )}
              </Field>
              <div className="field">
                <span className="lbl" id="r-cap">
                  Số khách tối đa
                </span>
                <div className="stepper" role="group" aria-labelledby="r-cap" style={{ alignSelf: 'flex-start' }}>
                  <button
                    type="button"
                    aria-label="Giảm số khách"
                    disabled={f.max_guests <= 1}
                    onClick={() => set({ max_guests: f.max_guests - 1 })}
                  >
                    −
                  </button>
                  <output aria-live="polite">{f.max_guests} khách</output>
                  <button
                    type="button"
                    aria-label="Tăng số khách"
                    disabled={f.max_guests >= 8}
                    onClick={() => set({ max_guests: f.max_guests + 1 })}
                  >
                    +
                  </button>
                </div>
                {tooMany && (
                  <p className="help" style={{ color: 'var(--warn)', fontWeight: 500 }}>
                    Đặt phòng {fmtRange(tooMany)} có {tooMany.guests} khách. Giảm sức chứa không đổi đặt phòng đã có,
                    nhưng lần sau sẽ cảnh báo.
                  </p>
                )}
              </div>
            </div>
          </Sec>

          <Sec title="Giá">
            <div className="panel form">
              <div className="grid2">
                <Field label="Giá mỗi đêm (đ)" error={err.price} changed={cls('price')}>
                  {(p) => (
                    <MoneyInput {...p} placeholder="450.000" value={f.price} onChange={(v) => set({ price: v })} />
                  )}
                </Field>
                <Field label="Thứ 6, thứ 7 (đ)" changed={cls('weekend_price')}>
                  {(p) => (
                    <MoneyInput
                      {...p}
                      placeholder="Như thường"
                      value={f.weekend_price}
                      onChange={(v) => set({ weekend_price: v })}
                    />
                  )}
                </Field>
              </div>
              {priceChanged && (
                <div className="notice" role="status">
                  Giá mới áp dụng cho đặt phòng tạo sau khi lưu.
                  {keepPrice > 0 && ` ${keepPrice} đặt phòng sắp tới của phòng ${room!.name} giữ giá cũ.`}
                </div>
              )}
            </div>
          </Sec>

          <Sec title="Tiện nghi" aside={<span className="aside">hiện trong chi tiết đặt phòng</span>}>
            <div className="panel form" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <div className="checks">
                {AMENITIES.map((a) => {
                  const on = !!f.amenities?.includes(a)
                  return (
                    <label key={a} className="check">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          set({
                            amenities: on
                              ? f.amenities!.filter((x) => x !== a)
                              : AMENITIES.filter((x) => x === a || f.amenities?.includes(x)),
                          })
                        }
                      />
                      {a}
                    </label>
                  )
                })}
              </div>
            </div>
          </Sec>

          <Sec title="Vận hành">
            <div className="panel form">
              <div className="switch-row">
                <div>
                  <div style={{ fontWeight: 600 }} id="r-open">
                    Nhận đặt phòng mới
                  </div>
                  <p className="help">
                    {f.active
                      ? 'Phòng hiện trên lịch và trong lựa chọn khi đặt.'
                      : 'Phòng ẩn khỏi lựa chọn khi đặt mới; đặt phòng đã có vẫn giữ.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={f.active}
                  aria-labelledby="r-open"
                  onClick={() => set({ active: !f.active })}
                >
                  <span />
                </button>
              </div>
              <Field label="Ghi chú nội bộ" optional changed={cls('note')}>
                {(p) => (
                  <textarea
                    {...p}
                    maxLength={300}
                    placeholder="Ví dụ: cửa sổ nhìn ra hẻm, ồn buổi sáng"
                    value={f.note}
                    onChange={(e) => set({ note: e.target.value })}
                  />
                )}
              </Field>
            </div>
          </Sec>

          {editing && (
            <Sec title="Xoá phòng">
              <div className="panel form">
                {ahead.length ? (
                  <p className="help" style={{ color: 'var(--text)' }}>
                    Phòng {room!.name} còn <b>{ahead.length} đặt phòng sắp tới</b> (
                    {ahead
                      .slice(0, 2)
                      .map((b) => `${guestLabel(b)} ${fmtRange(b)}`)
                      .join(', ')}
                    {ahead.length > 2 && ', …'}). Chuyển hoặc huỷ các đặt phòng này trước khi xoá. Nếu chỉ muốn tạm
                    ngưng, hãy tắt “Nhận đặt phòng mới”.
                  </p>
                ) : (
                  <p className="help">Lịch sử đặt phòng cũ của phòng này vẫn được giữ.</p>
                )}
                <button
                  type="button"
                  className="btn btn-block btn-danger-entry"
                  disabled={ahead.length > 0}
                  onClick={() => setConfirmDelete(true)}
                >
                  Xoá phòng {room!.name}…
                </button>
              </div>
            </Sec>
          )}
          <div className="end" />
        </form>
      </main>

      <div className="footer-bar">
        <div className="sum">
          <b>
            {editing
              ? changed.length
                ? `${changed.length} thay đổi`
                : 'Chưa có thay đổi'
              : name
                ? `Phòng ${name} · tầng ${f.floor}`
                : 'Phòng mới'}
          </b>
          <span>
            {f.price ? `${money(f.price)}/đêm` : 'Chưa có giá'} · {f.max_guests} khách
          </span>
        </div>
        <button type="button" className="btn btn-primary" disabled={editing && !changed.length} onClick={save}>
          {editing ? 'Lưu thay đổi' : 'Thêm phòng'}
        </button>
      </div>

      {discard && (
        <Sheet
          title={editing ? `Bỏ ${changed.length} thay đổi chưa lưu?` : 'Bỏ phòng đang nhập?'}
          onClose={() => setDiscard(false)}
        >
          <p className="help">Thông tin đã nhập sẽ không được lưu.</p>
          <button type="button" className="btn btn-danger btn-block" onClick={() => navigate(-1)}>
            Bỏ và thoát
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setDiscard(false)}>
            Tiếp tục
          </button>
        </Sheet>
      )}
      {confirmDelete && room && (
        <Sheet title={`Xoá phòng ${room.name}?`} onClose={() => setConfirmDelete(false)}>
          <p className="help">
            Phòng biến mất khỏi lịch, danh sách phòng và trang hueni.me. Lịch sử đặt phòng cũ vẫn giữ.
          </p>
          <button
            type="button"
            className="btn btn-danger btn-block"
            onClick={async () => {
              if (await record(() => actions.deleteRoom(room.id), `Đã xoá phòng ${room.name}`)) return
              navigate('/rooms', { replace: true })
            }}
          >
            Xoá phòng {room.name}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setConfirmDelete(false)}>
            Không xoá
          </button>
        </Sheet>
      )}
    </Screen>
  )
}
