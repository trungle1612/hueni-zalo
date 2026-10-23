import dayjs from 'dayjs'
import React, { useState } from 'react'

import { needsSheet, StayKind, StaySheet, useStay } from '@/modules/pms/components/stay-sheet'
import { A, AppBar, Badge, Icon, PlaceSub, Screen, Sec, todayLine, useCurrent } from '@/modules/pms/components/ui'
import { undeclaredGuests } from '@/modules/pms/ops.store'
import {
  arrivalDate,
  Booking,
  canCheckIn,
  conflicts,
  day,
  dueOf,
  failingFeeds,
  fmtDay,
  guestLabel,
  isOpen,
  isStaying,
  lateDays,
  money,
  needsCleaning,
  nights,
  occupies,
  overdueDays,
  paidOf,
  sourceLabel,
  today,
  usePms,
  whenLabel,
} from '@/modules/pms/pms.store'

const sameDay = (iso?: string) => !!iso && dayjs(iso).isSame(dayjs(), 'day')

export default function TodayPage() {
  const { bookings, feeds, rooms: allRooms } = usePms()
  const { place, rooms, roomOf } = useCurrent()
  const stay = useStay()
  const [tomorrow, setTomorrow] = useState(false)
  const [sheet, setSheet] = useState<{ kind: StayKind; id: number }>()

  const ids = new Set(rooms.map((r) => r.id))
  const mine = bookings.filter((b) => ids.has(b.room_id) && b.status !== 'cancelled')
  const t = today()
  const t1 = day(1)
  const open = rooms.filter(isOpen)
  const dirty = rooms.filter(needsCleaning)

  // Today keeps the guests already handled, marked Đã nhận / Đã trả, so the count reads "x chờ / n".
  const arrivals = tomorrow
    ? mine.filter((b) => !b.checked_in_at && b.start_date === t1)
    : mine.filter(
        (b) =>
          (!b.checked_in_at && b.start_date <= t && arrivalDate() < b.end_date) ||
          (sameDay(b.checked_in_at) && !b.checked_out_at),
      )
  const departures = tomorrow
    ? mine.filter((b) => !b.checked_out_at && b.end_date === t1 && (isStaying(b) || b.start_date <= t1))
    : mine.filter((b) => (isStaying(b) && b.end_date <= t) || sameDay(b.checked_out_at))
  const byStart = (a: Booking, b: Booking) => a.start_date.localeCompare(b.start_date) || a.id - b.id
  arrivals.sort(byStart)
  departures.sort(byStart)

  const waitingIn = arrivals.filter((b) => !b.checked_in_at).length
  const waitingOut = departures.filter((b) => !b.checked_out_at).length
  const inHouse = mine.filter((b) => (tomorrow ? occupies(b, t1, day(2)) : isStaying(b))).length

  // Every open problem, not just the first: the OTA feed is pinned above, the rest listed here.
  const failing = failingFeeds(feeds, allRooms, place.id)
  const undeclared = undeclaredGuests(mine)
  const tasks: { key: string; text: string; to: string }[] = tomorrow
    ? []
    : [
        ...conflicts(mine).map((c) => ({
          key: `c${c.ota.id}-${c.manual.id}`,
          text: `Đặt phòng ${sourceLabel(c.ota)} trùng lịch phòng ${roomOf(c.ota.room_id)?.name} với ${guestLabel(c.manual)}.`,
          to: `/bookings/${c.manual.id}`,
        })),
        ...arrivals
          .filter((b) => !b.checked_in_at && roomOf(b.room_id)?.housekeeping === 'dirty')
          .map((b) => ({
            key: `d${b.id}`,
            text: `Phòng ${roomOf(b.room_id)?.name} chưa dọn, ${guestLabel(b)} đến hôm nay.`,
            to: '/rooms?f=clean',
          })),
        ...(undeclared
          ? [
              {
                key: 'decl',
                text: `${undeclared} khách chưa gửi khai báo lưu trú. Hạn 23:00 tối nay.`,
                to: '/registration',
              },
            ]
          : []),
      ]
  const [allTasks, setAllTasks] = useState(false)
  const shownTasks = allTasks ? tasks : tasks.slice(0, 3)

  function act(kind: StayKind, b: Booking) {
    const room = roomOf(b.room_id)!
    if (needsSheet(kind, b, room, bookings)) return setSheet({ kind, id: b.id })
    // A refused tap (e.g. the room still has a guest) opens the sheet, which says why.
    if (stay(kind, b, room)) setSheet({ kind, id: b.id })
  }

  function row(b: Booking, kind: 'in' | 'out') {
    const room = roomOf(b.room_id)!
    const done = kind === 'in' ? !!b.checked_in_at : !!b.checked_out_at
    const due = dueOf(b, room)
    const meta =
      kind === 'in'
        ? [
            `${nights(b)} đêm`,
            b.guests && `${b.guests} khách`,
            b.source === 'ical' ? b.guest_name && sourceLabel(b) : b.origin,
            lateDays(b) > 0 && `trễ ${lateDays(b)} ngày`,
            b.status === 'hold' ? 'giữ chỗ' : b.source === 'manual' && due > 0 && !paidOf(b, room) && 'chưa cọc',
          ]
        : [overdueDays(b) > 0 ? whenLabel(b) : `Ở từ ${fmtDay(b.start_date)}`, b.guests && `${b.guests} khách`]
    const canAct = !tomorrow && !done && (kind === 'in' ? canCheckIn(b) : isStaying(b))
    const verb = kind === 'in' ? 'Nhận' : 'Trả'
    return (
      <div className="row" key={b.id}>
        <A className="row-main" to={`/bookings/${b.id}`}>
          <span className="rn">{room.name}</span>
          <span className="grow">
            <span className="t1">{guestLabel(b)}</span>
            <span className="t2">{meta.filter(Boolean).join(' · ')}</span>
            {!done && due > 0 && <span className="due">Còn thu {money(due)}</span>}
          </span>
        </A>
        {canAct ? (
          <button
            type="button"
            className="btn btn-sm"
            aria-label={`${kind === 'in' ? 'Nhận phòng' : 'Trả phòng'} ${room.name}, ${guestLabel(b)}`}
            onClick={() => act(kind, b)}
          >
            {verb}
          </button>
        ) : done ? (
          <Badge tone="positive">{kind === 'in' ? 'Đã nhận' : 'Đã trả'}</Badge>
        ) : (
          tomorrow && <Badge tone="neutral">Ngày mai</Badge>
        )}
      </div>
    )
  }

  const open_ = sheet && bookings.find((b) => b.id === sheet.id)

  return (
    <Screen tab="/">
      <AppBar
        title="Hôm nay"
        sub={<PlaceSub prefix={tomorrow ? `Xem trước ${fmtDay(t1)}/${t1.slice(0, 4)}` : todayLine()} />}
      >
        <A className="icon-btn" to="/search" aria-label="Tìm đặt phòng">
          <Icon name="search" />
        </A>
        <A className="btn btn-sm" to="/bookings/new">
          + Đặt phòng
        </A>
      </AppBar>
      <div className="seg" role="group" aria-label="Chọn ngày">
        <button type="button" aria-pressed={!tomorrow} onClick={() => setTomorrow(false)}>
          Hôm nay
        </button>
        <button type="button" aria-pressed={tomorrow} onClick={() => setTomorrow(true)}>
          Ngày mai
        </button>
      </div>
      {failing > 0 && !tomorrow && (
        <A className="band" to="/channels" role="alert">
          <span>Lịch OTA lỗi ở {failing} kênh: phòng trống trên hueni.me có thể sai.</span>
          <b>Sửa</b>
        </A>
      )}

      <main className="scroll">
        <div className="sec">
          <div className="panel stats">
            <div className="stat">
              <b>{waitingIn}</b>
              <span>{tomorrow ? 'Sẽ đến' : 'Chờ đến'}</span>
            </div>
            <div className="stat">
              <b>{waitingOut}</b>
              <span>{tomorrow ? 'Sẽ đi' : 'Chờ đi'}</span>
            </div>
            <div className="stat">
              <b>
                {inHouse}
                <small>/{open.length}</small>
              </b>
              <span>{tomorrow ? 'Dự kiến ở' : 'Đang ở'}</span>
            </div>
            <A className="stat" to="/rooms?f=clean">
              <b>{tomorrow ? departures.length : dirty.length}</b>
              <span>{tomorrow ? 'Sẽ cần dọn' : 'Cần dọn'}</span>
            </A>
          </div>
        </div>

        {shownTasks.length > 0 && (
          <Sec title={`Cần xử lý · ${tasks.length}`}>
            <div className="tasks" role="list">
              {shownTasks.map((t) => (
                <A key={t.key} role="listitem" className="task" to={t.to}>
                  <span>{t.text}</span>
                  <b>Xem</b>
                </A>
              ))}
              {tasks.length > 3 && !allTasks && (
                <button type="button" className="task more-tasks" onClick={() => setAllTasks(true)}>
                  <span>Xem thêm {tasks.length - 3} việc khác</span>
                </button>
              )}
            </div>
          </Sec>
        )}

        <Sec
          title={tomorrow ? `Nhận phòng · ${arrivals.length}` : `Nhận phòng · ${waitingIn} chờ / ${arrivals.length}`}
          aside={
            <A className="link" to="/calendar">
              Lịch
            </A>
          }
        >
          <div className="panel">
            {arrivals.map((b) => row(b, 'in'))}
            {!arrivals.length && (
              <div className="empty-row">
                {tomorrow ? 'Ngày mai không có khách đến.' : 'Hôm nay không có khách đến. Khách đặt mới sẽ hiện ở đây.'}
              </div>
            )}
          </div>
        </Sec>

        <Sec
          title={tomorrow ? `Trả phòng · ${departures.length}` : `Trả phòng · ${waitingOut} chờ / ${departures.length}`}
        >
          <div className="panel">
            {departures.map((b) => row(b, 'out'))}
            {!departures.length && (
              <div className="empty-row">
                {tomorrow ? 'Ngày mai không có khách trả phòng.' : 'Hôm nay không có khách trả phòng.'}
              </div>
            )}
          </div>
        </Sec>
        <div className="end" />
      </main>

      {open_ && sheet && (
        <StaySheet
          kind={sheet.kind}
          booking={open_}
          room={roomOf(open_.room_id)!}
          onClose={() => setSheet(undefined)}
        />
      )}
    </Screen>
  )
}
