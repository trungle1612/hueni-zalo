import dayjs from 'dayjs'
import React, { useState } from 'react'
import { Header, Icon, Page, useNavigate } from 'zmp-ui'

import { PageContainer } from '@/components'
import {
  CheckInButton,
  CheckOutButton,
  CleanButton,
  DeclareButton,
  NoShowButton,
} from '@/modules/pms/components/stay-buttons'
import { CallButton, Card, Empty, LinkRow, RoleTag, Tag } from '@/modules/pms/components/ui'
import {
  arrivalDate,
  Booking,
  day,
  failingFeeds,
  guestLabel,
  isStaying,
  lateDays,
  overdueDays,
  Place,
  placeRooms,
  Room,
  roomDay,
  today,
  usePms,
  whenLabel,
} from '@/modules/pms/pms.store'
import { PmsTabs } from '@/modules/pms/pms-tabs'

export default function TodayPage() {
  const { places, rooms, bookings } = usePms()
  const multi = places.length > 1
  const roomOf = (b: Booking) => rooms.find((r) => r.id === b.room_id)!
  const placeOf = (r: Room) => places.find((p) => p.id === r.place_id)!
  const live = bookings.filter((b) => b.status !== 'cancelled' && roomOf(b).active)

  const leaving = live.filter((b) => isStaying(b) && b.end_date <= today())
  const dirty = rooms.filter((r) => r.active && r.housekeeping === 'dirty')
  const arriving = live
    .filter((b) => !b.checked_in_at && b.start_date <= today() && arrivalDate() < b.end_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const staying = live.filter((b) => isStaying(b) && b.end_date > today())
  const undeclared = staying.filter((b) => !b.declared_at)
  const holds = live.filter((b) => b.status === 'hold' && b.start_date > today() && b.start_date <= day(3))
  const nothingToDo = !leaving.length && !dirty.length && !arriving.length && !undeclared.length && !holds.length

  const where = (b: Booking) => `Phòng ${roomOf(b).name}${multi ? ` · ${placeOf(roomOf(b)).name}` : ''}`

  return (
    <>
      <Page restoreScroll>
        <Header title="Hôm nay" showBackIcon={false} />
        <PageContainer withHeader withBottomNav>
          <div className="p-4 space-y-6">
            <div className="text-text-secondary text-base first-letter:uppercase">
              {dayjs().format('dddd, DD/MM/YYYY')}
            </div>

            {/* Vacancy truth first: the answer hueni.me publishes. */}
            <div className="space-y-3">
              {places.map((p) => (
                <VacancyCard key={p.id} place={p} multi={multi} />
              ))}
            </div>

            <section className="space-y-5">
              <h2 className="text-xl font-semibold m-0 px-1">Việc hôm nay</h2>
              {nothingToDo && (
                <Card>
                  <Empty action={{ label: 'Xem lịch phòng', to: '/calendar' }}>
                    Hôm nay không có việc nào cần làm.
                  </Empty>
                </Card>
              )}

              <Group title="Trả phòng" count={leaving.length}>
                {leaving.map((b) => (
                  <TaskRow key={b.id} booking={b} where={where(b)} late={overdueDays(b) > 0}>
                    <CheckOutButton booking={b} room={roomOf(b)} fullWidth />
                  </TaskRow>
                ))}
              </Group>

              <Group title="Khách đến" count={arriving.length}>
                {arriving.map((b) => (
                  <TaskRow
                    key={b.id}
                    booking={b}
                    where={where(b)}
                    late={lateDays(b) > 0}
                    phone
                    tags={
                      <>
                        {b.status === 'hold' && <Tag tone="amber">Giữ chỗ</Tag>}
                        {roomOf(b).housekeeping === 'dirty' && <Tag tone="stone">Phòng chưa dọn</Tag>}
                      </>
                    }
                    secondary={lateDays(b) > 0 && <NoShowButton booking={b} />}
                  >
                    <CheckInButton booking={b} room={roomOf(b)} fullWidth />
                  </TaskRow>
                ))}
              </Group>

              <Group title="Cần dọn" count={dirty.length}>
                {dirty.map((r) => (
                  <Card key={r.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-lg font-semibold">Phòng {r.name}</div>
                      {multi && <div className="text-base text-text-secondary">{placeOf(r).name}</div>}
                    </div>
                    <CleanButton room={r} />
                  </Card>
                ))}
              </Group>

              <Group title="Chưa khai báo lưu trú" count={undeclared.length}>
                {undeclared.map((b) => (
                  <TaskRow key={b.id} booking={b} where={where(b)}>
                    <DeclareButton booking={b} fullWidth />
                  </TaskRow>
                ))}
              </Group>

              <HoldGroup holds={holds} where={where} />

              {staying.length > 0 && (
                <p className="text-base text-text-secondary px-1 m-0">
                  {staying.length} phòng có khách ở tiếp, không cần làm gì hôm nay.
                </p>
              )}
            </section>
          </div>
        </PageContainer>
      </Page>
      <PmsTabs active="/" />
    </>
  )
}

function VacancyCard({ place, multi }: { place: Place; multi: boolean }) {
  const navigate = useNavigate()
  const { rooms, bookings, feeds } = usePms()
  const days = placeRooms(rooms, place.id).map((r) => roomDay(r, bookings))
  const open = days.filter((d) => d.state !== 'off')
  const free = open.filter((d) => d.state === 'free')
  const failing = failingFeeds(feeds, rooms, place.id)

  const headline = !open.length
    ? 'Chưa có phòng nào nhận khách'
    : free.length
      ? `Còn ${free.length}/${open.length} phòng tối nay`
      : 'Hết phòng tối nay'

  return (
    <Card className="p-2 space-y-2">
      <button
        className="w-full text-left bg-transparent border-0 p-3 rounded-xl text-text active:bg-ng-10"
        onClick={() => navigate(`/places/${place.slug}`)}
        aria-label={`${place.name}: ${headline}. Xem từng phòng`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-base text-text-secondary font-medium truncate">{place.name}</span>
          {multi && <RoleTag role={place.role} />}
        </div>
        <div className={`text-2xl font-bold mt-1 ${free.length ? 'text-emerald-800' : 'text-stone-700'}`}>
          {headline}
        </div>
        <div className="flex items-end justify-between gap-2 mt-1">
          <span className="text-base text-text-secondary">
            {free.length ? `Trống: ${free.map((d) => d.room.name).join(', ')}` : 'hueni.me đang hiện hết phòng'}
          </span>
          <span className="flex items-center gap-1 text-base font-semibold text-primary-pressed shrink-0">
            Từng phòng <Icon icon="zi-chevron-right" size={20} />
          </span>
        </div>
      </button>
      {failing > 0 && (
        <LinkRow tone="red" onClick={() => navigate('/feeds')}>
          <Icon icon="zi-warning-solid" size={20} /> Lịch OTA lỗi ({failing}): phòng trống có thể sai
        </LinkRow>
      )}
    </Card>
  )
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold m-0 px-1">
        {title} <span className="text-text-secondary font-normal">· {count}</span>
      </h3>
      {children}
    </section>
  )
}

function HoldGroup({ holds, where }: { holds: Booking[]; where: (b: Booking) => string }) {
  const [open, setOpen] = useState(false)
  if (!holds.length) return null
  return (
    <section className="space-y-2">
      <button
        className="w-full min-h-[48px] flex items-center justify-between px-1 bg-transparent border-0 text-left text-text"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-lg font-semibold">
          Giữ chỗ 3 ngày tới <span className="text-text-secondary font-normal">· {holds.length}</span>
        </span>
        <Icon icon={open ? 'zi-chevron-up' : 'zi-chevron-down'} size={24} />
      </button>
      {open && holds.map((b) => <TaskRow key={b.id} booking={b} where={where(b)} phone />)}
    </section>
  )
}

type TaskRowProps = {
  booking: Booking
  where: string
  late?: boolean
  phone?: boolean
  tags?: React.ReactNode
  secondary?: React.ReactNode
  children?: React.ReactNode
}

// One row = one guest, one main action, full width. Rare actions sit apart, below a divider.
function TaskRow({ booking, where, late, phone, tags, secondary, children }: TaskRowProps) {
  const navigate = useNavigate()
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <button
          className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 text-text"
          onClick={() => navigate(`/bookings/${booking.id}`)}
        >
          <div className="text-lg font-semibold truncate">
            {guestLabel(booking)}
            {booking.guests ? <span className="text-text-secondary font-normal"> · {booking.guests} khách</span> : null}
          </div>
          <div className={late ? 'text-base font-semibold text-red-700' : 'text-base'}>{whenLabel(booking)}</div>
          <div className="text-base text-text-secondary">{where}</div>
        </button>
        {phone && <CallButton phone={booking.guest_phone} />}
      </div>
      {tags && <div className="flex flex-wrap gap-2 empty:hidden">{tags}</div>}
      {children}
      {secondary && <div className="pt-2 border-0 border-t border-solid border-border">{secondary}</div>}
    </Card>
  )
}
