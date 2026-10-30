import './sales.scss'

import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from 'zmp-ui'

import {
  A,
  AppBar,
  Badge,
  Field,
  KV,
  phoneDigits,
  Screen,
  Sec,
  Segmented,
  Sheet,
  toast,
  useCurrent,
  useRecord,
} from '@/modules/pms/components/ui'
import {
  addDays,
  Booking,
  can,
  canCheckIn,
  dueOf,
  fmtRange,
  isOpen,
  isRoomFree,
  isStaying,
  money,
  nights,
  paidOf,
  Room,
  today,
  totalOf,
  usePms,
} from '@/modules/pms/pms.store'
import { groups, remote } from '@/modules/pms/remote'
import { Group, GROUP_ORIGINS, useSales } from '@/modules/pms/sales.store'

// /groups/new: one form for the group and its rooms. /groups/:id: the group's rooms, bill and check-in.
export default function GroupBookingPage() {
  const { id } = useParams()
  const group = useSales((s) => s.groups.find((g) => g.id === Number(id)))
  const [loading, setLoading] = useState(id !== undefined)
  useEffect(() => {
    if (id !== undefined) groups.load(Number(id)).finally(() => setLoading(false))
  }, [id])
  if (id === undefined) return <NewGroup />
  if (!group) {
    return (
      <Screen>
        <AppBar lead="back" title="Đặt phòng theo đoàn" />
        <main className="scroll">
          <div className="empty">{loading ? 'Đang tải…' : 'Không tìm thấy đoàn này.'}</div>
        </main>
      </Screen>
    )
  }
  return <GroupView group={group} />
}

// ponytail: free rooms from the loaded bookings (two months), only to narrow the list; hueni-api checks overlaps and
// names the room (#24). Ask the server for free rooms if far-off dates list rooms that are taken.
const freeFor = (rooms: Room[], all: Booking[], from: string, to: string, ignore: number[] = []) =>
  rooms.filter((r) => isOpen(r) && !ignore.includes(r.id) && isRoomFree(all, r.id, from, to))

function RoomPick({ rooms, picked, onPick }: { rooms: Room[]; picked: number[]; onPick: (id: number) => void }) {
  return (
    <div className="list">
      {rooms.map((r) => (
        <button
          key={r.id}
          type="button"
          className="pick"
          aria-pressed={picked.includes(r.id)}
          onClick={() => onPick(r.id)}
        >
          <span className="rn">{r.name}</span>
          <span className="grow">
            <span className="t1">{r.kind || 'Phòng'}</span>
            <span className="t2">
              {r.max_guests} khách{r.price ? ` · ${money(r.price)}/đêm` : ''}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

function NewGroup() {
  const navigate = useNavigate()
  const bookings = usePms((s) => s.bookings)
  const { place, rooms } = useCurrent()
  const owner = can(place, 'manage')
  const [f, setF] = useState({
    name: '',
    contact: '',
    phone: '',
    origin: GROUP_ORIGINS[0],
    start: today(),
    end: addDays(today(), 1),
    pct: 10,
  })
  const [picked, setPicked] = useState<number[]>([])
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string>()
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p })

  const badDates = f.end <= f.start
  const free = badDates ? [] : freeFor(rooms, bookings, f.start, f.end)
  const chosen = free.filter((r) => picked.includes(r.id))
  const phoneBad = !!f.phone && phoneDigits(f.phone).length < 9
  const errors = {
    name: !f.name.trim() && 'Nhập tên đoàn.',
    contact: !f.contact.trim() && 'Nhập tên trưởng đoàn.',
    phone: phoneBad && 'Số điện thoại cần ít nhất 9 chữ số.',
    dates: badDates && 'Ngày trả phòng phải sau ngày nhận phòng.',
  }

  async function save() {
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    const made = await groups.create(
      place.id,
      {
        name: f.name.trim(),
        contact: f.contact.trim(),
        phone: f.phone.trim() || undefined,
        origin: f.origin,
        discount_pct: owner ? f.pct : 0,
      },
      chosen,
      { start_date: f.start, end_date: f.end },
    )
    if (typeof made === 'string') return setError(made)
    toast(`Đã tạo đoàn ${f.name.trim()} · ${chosen.length} phòng`)
    navigate(`/groups/${made}`, { replace: true })
  }

  return (
    <Screen>
      <AppBar lead="close" title="Đặt phòng theo đoàn" sub={place.name} />
      <main className="scroll">
        <form onSubmit={(e) => (e.preventDefault(), save())}>
          <Sec title="Đoàn">
            <div className="panel form">
              <Field label="Tên đoàn" error={tried && errors.name}>
                {(p) => (
                  <input
                    {...p}
                    value={f.name}
                    placeholder="Ví dụ: Đoàn du lịch Hội An"
                    onChange={(e) => set({ name: e.target.value })}
                  />
                )}
              </Field>
              <div className="grid2">
                <Field label="Trưởng đoàn" error={tried && errors.contact}>
                  {(p) => <input {...p} value={f.contact} onChange={(e) => set({ contact: e.target.value })} />}
                </Field>
                <Field label="Điện thoại" optional error={tried && errors.phone}>
                  {(p) => (
                    <input
                      {...p}
                      type="tel"
                      inputMode="tel"
                      value={f.phone}
                      onChange={(e) => set({ phone: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              <Field label="Nguồn">
                {(p) => (
                  <select {...p} value={f.origin} onChange={(e) => set({ origin: e.target.value })}>
                    {GROUP_ORIGINS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                )}
              </Field>
              <div className="grid2">
                <Field label="Nhận phòng">
                  {(p) => <input {...p} type="date" value={f.start} onChange={(e) => set({ start: e.target.value })} />}
                </Field>
                <Field label="Trả phòng" error={tried && errors.dates}>
                  {(p) => <input {...p} type="date" value={f.end} onChange={(e) => set({ end: e.target.value })} />}
                </Field>
              </div>
              {owner && (
                <Field label="Giá đoàn · giảm (%)" help="Áp vào giá mỗi đêm của từng phòng khi tạo.">
                  {(p) => (
                    <input
                      {...p}
                      type="text"
                      inputMode="numeric"
                      value={f.pct}
                      onChange={(e) => set({ pct: Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 0) })}
                    />
                  )}
                </Field>
              )}
            </div>
          </Sec>
          <Sec
            title="Phòng"
            aside={
              <span className="aside">
                {free.length
                  ? `${free.length} phòng trống cả ${badDates ? 0 : nights({ start_date: f.start, end_date: f.end })} đêm`
                  : ''}
              </span>
            }
          >
            {free.length ? (
              <RoomPick
                rooms={free}
                picked={picked}
                onPick={(rid) => setPicked(picked.includes(rid) ? picked.filter((x) => x !== rid) : [...picked, rid])}
              />
            ) : (
              <div className="notice">Không còn phòng trống cho những ngày này.</div>
            )}
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
          </Sec>
          <div className="end" />
        </form>
      </main>
      <div className="footer-bar">
        <button type="button" className="btn btn-primary btn-block" onClick={save}>
          {chosen.length ? `Tạo đoàn · ${chosen.length} phòng` : 'Tạo đoàn'}
        </button>
      </div>
    </Screen>
  )
}

function GroupView({ group }: { group: Group }) {
  const { bookings, rooms: allRooms } = usePms()
  const { rooms } = useCurrent()
  const record = useRecord()
  const [sheet, setSheet] = useState<number | 'add'>()
  const [sel, setSel] = useState<number>()
  const [own, setOwn] = useState(false)
  const reload = () => groups.load(group.id)

  const mine = bookings
    .filter((b) => b.group_id === group.id && b.status !== 'cancelled')
    .sort((a, b) => a.room_id - b.room_id)
  const roomOf = (b: Booking) => allRooms.find((r) => r.id === b.room_id)
  const first = mine[0]
  const head = (
    <AppBar
      lead="back"
      title={group.name}
      sub={first ? `${group.code} · ${fmtRange(first)} · ${nights(first)} đêm` : group.code}
    />
  )
  if (!first) {
    return (
      <Screen>
        {head}
        <main className="scroll">
          <div className="empty">
            Đoàn không còn phòng nào. Các đặt phòng đã huỷ vẫn ở trong Lịch sử của từng phòng.
          </div>
        </main>
      </Screen>
    )
  }

  const billed = mine.filter((b) => group.bill === 'split' || !b.pays_own)
  const sum = (fn: (b: Booking) => number) => billed.reduce((n, b) => n + fn(b), 0)
  // With hueni-api the server sums the billed rooms.
  const total = group.total ?? sum((b) => totalOf(b, roomOf(b)))
  const paid = group.paid ?? sum((b) => paidOf(b, roomOf(b)))
  const due = group.due ?? sum((b) => dueOf(b, roomOf(b)))
  const guests = mine.reduce((n, b) => n + (b.guests || 0), 0)
  const docs = mine.reduce((n, b) => n + (b.docs?.length || 0), 0)
  const waiting = mine.filter(canCheckIn)
  const allIn = mine.every((b) => isStaying(b) || b.checked_out_at)

  const editing = typeof sheet === 'number' ? mine.find((b) => b.id === sheet) : undefined
  const editRoom = editing && roomOf(editing)
  const options = freeFor(
    rooms.filter((r) => !editRoom || (r.kind || '') === (editRoom.kind || '')),
    bookings,
    first.start_date,
    first.end_date,
    mine.map((b) => b.room_id),
  )

  function open(b: Booking) {
    setSheet(b.id)
    setSel(undefined)
    setOwn(!!b.pays_own)
  }

  async function save() {
    if (sheet === 'add') {
      const room = rooms.find((r) => r.id === sel)!
      const error = await record(() => groups.addRoom(group, room, first), `Đã thêm phòng ${room.name}`)
      if (!error) setSheet(undefined)
      return
    }
    const b = editing!
    const change = { room_id: sel, pays_own: own === !!b.pays_own ? undefined : own }
    const error = await record(
      () => groups.setRoom(group.id, b, change),
      sel === undefined
        ? `Đã lưu phòng ${editRoom?.name}`
        : `Đã đổi sang phòng ${allRooms.find((r) => r.id === sel)?.name}`,
    )
    if (!error) setSheet(undefined)
  }

  function checkInAll() {
    record(
      () => groups.checkIn(group.id, waiting),
      `Đã nhận ${waiting.length} phòng${docs < guests ? ` · ${guests - docs} khách còn thiếu giấy tờ` : ''}`,
    )
  }

  return (
    <Screen>
      {head}
      <main className="scroll">
        <div className="sec">
          <dl className="panel">
            <KV label="Trưởng đoàn">{[group.contact, group.phone].filter(Boolean).join(' · ')}</KV>
            <KV label="Nguồn">{group.origin}</KV>
            <KV label="Số khách">
              {guests} người · {mine.length} phòng
            </KV>
            <KV label="Khai báo lưu trú">
              {docs} / {guests} khách có giấy tờ
            </KV>
          </dl>
        </div>

        <Sec title="Phòng của đoàn" aside={<span className="aside">{mine.length} phòng</span>}>
          <div className="panel">
            {mine.map((b) => {
              const r = roomOf(b)
              return (
                <button
                  key={b.id}
                  type="button"
                  className="row"
                  aria-label={`Phòng ${r?.name}, ${r?.kind || 'Phòng'}`}
                  onClick={() => open(b)}
                >
                  <span className="rn">{r?.name}</span>
                  <span className="grow">
                    <span className="t1">{r?.kind || 'Phòng'}</span>
                    <span className="t2">
                      {b.guests || 0} khách{b.price ? ` · ${money(b.price)}/đêm` : ''}
                      {isStaying(b) ? ' · đang ở' : b.checked_out_at ? ' · đã trả phòng' : ''}
                    </span>
                  </span>
                  {group.bill === 'one' && b.pays_own && <Badge tone="neutral">Tự trả</Badge>}
                </button>
              )
            })}
          </div>
        </Sec>

        <Sec title="Thanh toán">
          <div className="seg" role="group" aria-label="Ai thanh toán">
            {(
              [
                ['one', 'Một hoá đơn cho đoàn'],
                ['split', 'Tách theo phòng'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={group.bill === v}
                onClick={() =>
                  record(() => groups.setBill(group.id, v), v === 'one' ? 'Một hoá đơn cho đoàn' : 'Tách theo phòng')
                }
              >
                {label}
              </button>
            ))}
          </div>
          <p className="help" style={{ marginTop: 8 }}>
            {group.bill === 'one'
              ? `Trưởng đoàn thanh toán ${billed.length} phòng. Phòng đánh dấu "Tự trả" có phiếu riêng.`
              : 'Mỗi phòng một phiếu tính tiền, thu trên từng đặt phòng.'}
          </p>
          <dl className="panel" style={{ marginTop: 8 }}>
            <KV label={`Tiền phòng${group.discount_pct ? ` · giá đoàn −${group.discount_pct}%` : ''}`}>
              {money(total)}
            </KV>
            <KV label="Đã thu">{money(-paid)}</KV>
            <KV label="Còn phải thu" total tone={due > 0 ? 'warn' : 'pos'}>
              {money(due)}
            </KV>
          </dl>
        </Sec>
        <div className="end" />
      </main>

      <div className="footer-bar">
        {!allIn && (
          <button type="button" className="btn" onClick={() => (setSheet('add'), setSel(undefined))}>
            + Thêm phòng
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={!waiting.length}
          onClick={checkInAll}
        >
          {allIn
            ? 'Đã nhận phòng'
            : waiting.length
              ? `Nhận phòng cả đoàn · ${waiting.length}`
              : `Nhận phòng từ ${fmtRange(first).slice(0, 5)}`}
        </button>
      </div>

      {sheet !== undefined && (
        <Sheet title={editing ? `Phòng ${editRoom?.name}` : 'Thêm phòng cho đoàn'} onClose={() => setSheet(undefined)}>
          {(!editing || !editing.checked_in_at) && (
            <>
              {options.length ? (
                <p className="help">
                  {editing
                    ? `Đổi sang ${(editRoom?.kind || 'phòng cùng loại').toLowerCase()} khác, còn trống ${fmtRange(first)}.`
                    : `Còn trống ${fmtRange(first)}.${group.discount_pct ? ' Giá đoàn áp dụng tự động.' : ''}`}
                </p>
              ) : null}
              {options.length ? (
                <RoomPick
                  rooms={options}
                  picked={sel === undefined ? [] : [sel]}
                  onPick={(rid) => setSel(sel === rid ? undefined : rid)}
                />
              ) : (
                <div className="notice">
                  Không còn phòng {editRoom ? 'cùng loại ' : ''}trống {fmtRange(first)}.
                </div>
              )}
            </>
          )}
          {editing && group.bill === 'one' && (
            <Segmented
              label="Phòng này thanh toán"
              value={own ? 'own' : 'group'}
              options={[
                ['group', 'Tính vào đoàn'],
                ['own', 'Khách tự trả'],
              ]}
              onChange={(v) => setOwn(v === 'own')}
            />
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={sheet === 'add' ? sel === undefined : sel === undefined && own === !!editing!.pays_own}
            onClick={save}
          >
            {editing ? 'Lưu' : sel === undefined ? 'Chọn phòng' : `Thêm phòng ${rooms.find((r) => r.id === sel)?.name}`}
          </button>
          {editing && (
            <A className="btn btn-block" to={`/bookings/${editing.id}`}>
              Mở đặt phòng
            </A>
          )}
          {editing && !editing.checked_in_at && (
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={async () => {
                const error = await record(
                  () => remote.cancel(editing.id, `Bỏ khỏi đoàn ${group.name}`),
                  `Đã bỏ phòng ${editRoom?.name} khỏi đoàn`,
                )
                if (!error) {
                  setSheet(undefined)
                  reload()
                }
              }}
            >
              Bỏ phòng khỏi đoàn
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setSheet(undefined)}>
            Đóng
          </button>
        </Sheet>
      )}
    </Screen>
  )
}
