import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigate } from 'zmp-ui'

import {
  A,
  AppBar,
  Badge,
  Field,
  Icon,
  PlaceSub,
  Screen,
  Sec,
  Sheet,
  Tone,
  useCurrent,
  useRecord,
} from '@/modules/pms/components/ui'
import {
  addDays,
  can,
  dueOf,
  failingFeeds,
  fmtDate,
  guestLabel,
  inMaintenance,
  money,
  needsCleaning,
  Room,
  RoomDay,
  roomDay,
  today,
  usePlaceOf,
  usePms,
  whenLabel,
} from '@/modules/pms/pms.store'

type Status = 'in' | 'clean' | 'ready' | 'maint'
const META: Record<Status, [string, Tone]> = {
  in: ['Có khách', 'info'],
  ready: ['Sẵn sàng', 'positive'],
  clean: ['Cần dọn', 'warning'],
  maint: ['Bảo trì', 'neutral'],
}
const FILTERS: ['all' | Status, string][] = [
  ['all', 'Tất cả'],
  ['in', 'Có khách'],
  ['clean', 'Cần dọn'],
  ['ready', 'Sẵn sàng'],
  ['maint', 'Bảo trì'],
]
const NOUN: Record<'all' | Status, string> = {
  all: 'phòng',
  in: 'phòng có khách',
  clean: 'phòng cần dọn',
  ready: 'phòng sẵn sàng',
  maint: 'phòng bảo trì',
}

const statusOf = (d: RoomDay): Status =>
  d.state === 'off'
    ? 'maint'
    : d.state === 'occupied' || d.state === 'leaving'
      ? 'in'
      : d.room.housekeeping === 'dirty'
        ? 'clean'
        : 'ready'

export default function RoomsPage() {
  const [params, setParams] = useSearchParams()
  const { bookings, feeds, rooms: allRooms } = usePms()
  const { place, rooms } = useCurrent()
  const record = useRecord()
  const actions = usePms((s) => s.actions)
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<number>()
  const filter = (params.get('f') as 'all' | Status) || 'all'

  const days = rooms.map((r) => roomDay(r, bookings))
  const line = (d: RoomDay) => {
    const s = statusOf(d)
    if (s === 'maint')
      return d.room.active
        ? `${d.room.maintenance?.reason} · đến ${fmtDate(d.room.maintenance!.until)}`
        : 'Tạm ngưng nhận khách'
    if (s === 'in') {
      const due = dueOf(d.booking!, d.room)
      return [whenLabel(d.booking!), due > 0 && `còn thu ${money(due)}`].filter(Boolean).join(' · ')
    }
    const next = d.booking || d.next
    if (!next) return 'Chưa có khách đặt'
    return `${guestLabel(next)} ${next.start_date <= today() ? 'đến hôm nay' : `đến ${fmtDate(next.start_date)}`}`
  }
  const q = query.trim().toLowerCase()
  const searched = days.filter(
    (d) =>
      !q ||
      d.room.name.toLowerCase().includes(q) ||
      [d.booking && guestLabel(d.booking), d.next && guestLabel(d.next)].join(' ').toLowerCase().includes(q),
  )
  // Cần dọn counts every dirty room, guest in or not, exactly like Hôm nay.
  const matches = (d: RoomDay, k: 'all' | Status) =>
    k === 'all' || (k === 'clean' ? needsCleaning(d.room) : statusOf(d) === k)
  const count = (k: 'all' | Status) => searched.filter((d) => matches(d, k)).length
  const shown = searched.filter((d) => matches(d, filter))
  const failing = failingFeeds(feeds, allRooms, place.id)
  // Grouped by floor once rooms have floors; one group otherwise.
  const floorsShown = Array.from(new Set(shown.map((d) => d.room.floor || 0))).sort((a, b) => a - b)
  const groups =
    floorsShown.length > 1
      ? floorsShown.map((fl) => {
          const list = shown.filter((d) => (d.room.floor || 0) === fl)
          return { key: fl, title: `${fl ? `Tầng ${fl}` : 'Chưa có tầng'} · ${list.length} phòng`, rooms: list }
        })
      : shown.length
        ? [{ key: 0, title: `${shown.length} ${NOUN[filter]}`, rooms: shown }]
        : []
  const open = sheet !== undefined ? days.find((d) => d.room.id === sheet) : undefined

  return (
    <Screen tab="/rooms">
      <AppBar title="Phòng" sub={<PlaceSub prefix={`${rooms.length} phòng`} />}>
        <A className="btn btn-sm" to="/rooms/new">
          + Thêm phòng
        </A>
      </AppBar>
      <div className="search">
        <label htmlFor="room-q" className="sr-only">
          Tìm phòng
        </label>
        <input
          id="room-q"
          className="input"
          type="search"
          placeholder="Tìm số phòng hoặc tên khách"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="seg" role="group" aria-label="Lọc theo tình trạng">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setParams(k === 'all' ? {} : { f: k }, { replace: true })}
          >
            {label}
            <small>{count(k)}</small>
          </button>
        ))}
      </div>

      <main className="scroll">
        {groups.map((g) => (
          <Sec key={g.key} title={g.title}>
            <div className="panel">
              {g.rooms.map((d) => {
                const s = statusOf(d)
                const dirty = needsCleaning(d.room)
                const name = s === 'in' ? guestLabel(d.booking!) : META[s][0]
                return (
                  <div className="row" key={d.room.id}>
                    <button
                      type="button"
                      className="row-main"
                      aria-label={`Phòng ${d.room.name}, ${META[s][0]}, ${line(d)}`}
                      onClick={() => setSheet(d.room.id)}
                    >
                      <span className="rn">{d.room.name}</span>
                      <span className="grow">
                        <span
                          className="t1"
                          style={
                            s === 'in'
                              ? undefined
                              : s === 'clean'
                                ? { color: 'var(--warn)' }
                                : { color: 'var(--text-2)', fontWeight: 500 }
                          }
                        >
                          {name}
                        </span>
                        <span className="t2">
                          {dirty && s === 'in' && 'Cần dọn · '}
                          {line(d)}
                        </span>
                      </span>
                      {!dirty && <Badge tone={META[s][1]}>{META[s][0]}</Badge>}
                    </button>
                    {dirty && (
                      <button
                        type="button"
                        className="btn"
                        aria-label={`Đánh dấu phòng ${d.room.name} đã dọn xong`}
                        onClick={() =>
                          record(() => actions.clean(d.room.id), `Phòng ${d.room.name} đã dọn, sẵn sàng đón khách`)
                        }
                      >
                        Đã dọn
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </Sec>
        ))}
        {!shown.length && (
          <div className="empty">
            <div>{q ? `Không có ${NOUN[filter]} khớp “${query.trim()}”.` : `Không có ${NOUN[filter]} lúc này.`}</div>
            {q && (
              <button type="button" className="btn" onClick={() => setQuery('')}>
                Xoá tìm kiếm
              </button>
            )}
          </div>
        )}
        <div className="sec">
          <A className="panel ota-link" to="/feeds">
            <span>
              <span className="t1">Kênh OTA</span>
              <span className="t2" style={failing ? { color: 'var(--danger)' } : undefined}>
                {failing ? `${failing} kênh lỗi: phòng trống có thể sai` : 'Lịch Airbnb / Booking.com tự đồng bộ'}
              </span>
            </span>
            <Icon name="next" />
          </A>
        </div>
        <p className="help" style={{ padding: '12px 16px 24px' }}>
          Chạm vào một phòng để đổi tình trạng, sửa thông tin hoặc mở đặt phòng.
        </p>
      </main>

      {open && <RoomSheet day={open} status={statusOf(open)} line={line(open)} onClose={() => setSheet(undefined)} />}
    </Screen>
  )
}

function RoomSheet({
  day: d,
  status,
  line,
  onClose,
}: {
  day: RoomDay
  status: Status
  line: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const actions = usePms((s) => s.actions)
  const record = useRecord()
  const room: Room = d.room
  const owner = can(usePlaceOf(room.id), 'manage')
  const occupied = status === 'in'
  const [sel, setSel] = useState<'ready' | 'dirty' | 'off' | undefined>(
    occupied ? undefined : status === 'maint' ? 'off' : status === 'clean' ? 'dirty' : 'ready',
  )
  const [reason, setReason] = useState(room.maintenance?.reason || '')
  const [until, setUntil] = useState(room.maintenance?.until || addDays(today(), 3))
  const [tried, setTried] = useState(false)
  const current = status === 'maint' ? 'off' : status === 'clean' ? 'dirty' : 'ready'
  const guest = d.booking || d.next

  function save() {
    if (!sel) return
    if (sel === 'off' && !reason.trim()) return setTried(true)
    const label = { ready: 'sẵn sàng', dirty: 'cần dọn', off: 'bảo trì' }[sel]
    record(
      () => actions.setRoomStatus(room.id, sel, sel === 'off' ? { reason: reason.trim(), until } : undefined),
      `Phòng ${room.name}: ${label}`,
    )
    onClose()
  }

  return (
    <Sheet title={`Phòng ${room.name}`} onClose={onClose}>
      <p className="help" style={{ marginTop: -8 }}>
        {META[status][0]} · {line}
      </p>
      {guest && (
        <button type="button" className="btn btn-block" onClick={() => (onClose(), navigate(`/bookings/${guest.id}`))}>
          Mở đặt phòng của {guestLabel(guest)}
        </button>
      )}
      {owner && (
        <button
          type="button"
          className="btn btn-block"
          style={{ borderColor: 'var(--border)' }}
          onClick={() => (onClose(), navigate(`/rooms/${room.id}/edit`))}
        >
          Sửa thông tin phòng {room.name}
        </button>
      )}
      {room.active ? (
        <>
          <div className="field">
            <span className="lbl" id="rs-s">
              Tình trạng
            </span>
            <div className="panel" role="radiogroup" aria-labelledby="rs-s">
              {(
                [
                  ['ready', 'Sẵn sàng đón khách'],
                  ['dirty', 'Cần dọn'],
                  ['off', 'Bảo trì'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className={occupied ? 'choice off' : 'choice'}>
                  <input
                    type="radio"
                    name="rs"
                    checked={sel === k}
                    disabled={occupied}
                    onChange={() => (setSel(k), setTried(false))}
                  />
                  {label}
                </label>
              ))}
            </div>
            {occupied && <p className="help">Phòng đang có khách. Đổi tình trạng được sau khi trả phòng.</p>}
          </div>
          {sel === 'off' && (
            <>
              <Field label="Lý do bảo trì" error={tried && !reason.trim() && 'Nhập lý do để nhân viên khác biết.'}>
                {(p) => (
                  <input
                    {...p}
                    type="text"
                    placeholder="Ví dụ: hỏng máy lạnh"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Dự kiến xong" help="Phòng bị khoá trên lịch đến ngày này.">
                {(p) => (
                  <input
                    {...p}
                    type="date"
                    min={addDays(today(), 1)}
                    value={until}
                    onChange={(e) => e.target.value && setUntil(e.target.value)}
                  />
                )}
              </Field>
            </>
          )}
          {!occupied && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={
                sel === current &&
                !(sel === 'off' && (reason !== room.maintenance?.reason || until !== room.maintenance?.until))
              }
              onClick={save}
            >
              Lưu tình trạng
            </button>
          )}
          {!occupied && sel !== 'off' && !inMaintenance(room) && !d.booking && (
            <button
              type="button"
              className="btn btn-block"
              onClick={() => (onClose(), navigate(`/bookings/new?room=${room.id}`))}
            >
              Đặt phòng {room.name}
            </button>
          )}
        </>
      ) : (
        <p className="help">Phòng đang tạm ngưng. Mở lại phòng trên trang quản trị hueni.</p>
      )}
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}
