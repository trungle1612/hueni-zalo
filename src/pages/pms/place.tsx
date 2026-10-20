import React, { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Button, Icon, Page, useNavigate } from 'zmp-ui'

import { PageContainer } from '@/components'
import {
  CheckInButton,
  CheckOutButton,
  CleanButton,
  EarlyCheckInButton,
  NoShowButton,
} from '@/modules/pms/components/stay-buttons'
import { BackHeader, CallButton, Card, Empty, LinkRow, RoleTag, Tag } from '@/modules/pms/components/ui'
import {
  can,
  canEarlyCheckIn,
  failingFeeds,
  guestLabel,
  isRoomFree,
  lateDays,
  overdueDays,
  placeRooms,
  RoomDay,
  roomDay,
  STATE_STYLE,
  today,
  usePms,
  whenLabel,
} from '@/modules/pms/pms.store'
import { clsx } from '@/utils/clsx'

export default function PlacePage() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { places, rooms, bookings, feeds, actions } = usePms()
  const place = places.find((p) => p.slug === slug)
  const focus = params.get('room')

  useEffect(() => {
    if (place) actions.setPlace(place.slug)
    if (focus) document.getElementById(`room-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [place, focus, actions])

  if (!place) {
    return (
      <Page>
        <BackHeader title="Không tìm thấy" />
        <PageContainer withHeader>
          <Empty action={{ label: 'Về Hôm nay', to: '/' }}>Không tìm thấy homestay này.</Empty>
        </PageContainer>
      </Page>
    )
  }

  const days = placeRooms(rooms, place.id).map((r) => roomDay(r, bookings))
  const open = days.filter((d) => d.state !== 'off')
  const free = open.filter((d) => d.state === 'free').length
  const failing = failingFeeds(feeds, rooms, place.id)

  return (
    <Page restoreScroll>
      <BackHeader title={place.name} />
      <PageContainer withHeader>
        <div className="p-4 space-y-4 pb-10">
          <div className="space-y-1 px-1">
            {places.length > 1 && <RoleTag role={place.role} />}
            <div className={`text-2xl font-bold ${free ? 'text-emerald-800' : 'text-stone-700'}`}>
              {free ? `Còn ${free}/${open.length} phòng tối nay` : 'Hết phòng tối nay'}
            </div>
          </div>
          {failing > 0 && (
            <LinkRow tone="red" onClick={() => navigate('/feeds')}>
              <Icon icon="zi-warning-solid" size={20} /> Lịch OTA lỗi ({failing}): phòng trống có thể sai
            </LinkRow>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button size="medium" variant="secondary" onClick={() => navigate('/calendar')}>
              Lịch phòng
            </Button>
            {can(place, 'manage') && (
              <Button size="medium" variant="secondary" onClick={() => navigate(`/places/${place.slug}/activity`)}>
                Hoạt động
              </Button>
            )}
          </div>
          {days.map((d) => (
            <RoomCard key={d.room.id} day={d} highlight={String(d.room.id) === focus} />
          ))}
        </div>
      </PageContainer>
    </Page>
  )
}

function RoomCard({ day, highlight }: { day: RoomDay; highlight: boolean }) {
  const navigate = useNavigate()
  const bookings = usePms((s) => s.bookings)
  const { room, state, booking, next } = day
  const style = STATE_STYLE[state]
  const early =
    state === 'free' &&
    next &&
    canEarlyCheckIn(next) &&
    isRoomFree(bookings, room.id, today(), next.start_date, next.id)
  const late = !!booking && (lateDays(booking) > 0 || overdueDays(booking) > 0)

  return (
    <Card
      className={clsx(
        'p-4 space-y-3 scroll-mt-20',
        state === 'off' && 'opacity-70',
        highlight && 'ring-2 ring-primary',
      )}
    >
      <div id={`room-${room.id}`} className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold m-0">Phòng {room.name}</h2>
        <Tag className={style.badge}>
          <span className={clsx('w-2 h-2 rounded-full', style.dot)} aria-hidden />
          {style.label}
        </Tag>
      </div>
      {room.housekeeping === 'dirty' && (
        <div>
          <Tag tone="stone">Chưa dọn</Tag>
        </div>
      )}

      {booking && (
        <div className="flex items-center gap-3">
          <button
            className="flex-1 min-w-0 text-left bg-ng-10 rounded-xl p-3 border-0 text-text"
            onClick={() => navigate(`/bookings/${booking.id}`)}
          >
            <div className="text-lg font-semibold truncate">
              {guestLabel(booking)}
              {booking.guests ? (
                <span className="font-normal text-text-secondary"> · {booking.guests} khách</span>
              ) : null}
            </div>
            <div className={late ? 'text-base font-semibold text-red-700' : 'text-base'}>{whenLabel(booking)}</div>
          </button>
          <CallButton phone={booking.guest_phone} />
        </div>
      )}
      {next && (
        <LinkRow onClick={() => navigate(`/bookings/${next.id}`)}>
          <span className="truncate">
            <span className="text-text-secondary font-normal">Tiếp theo: </span>
            {guestLabel(next)} · {whenLabel(next)}
          </span>
        </LinkRow>
      )}

      <div className="space-y-2 empty:hidden">
        {booking && <CheckOutButton booking={booking} room={room} fullWidth />}
        {booking && <CheckInButton booking={booking} room={room} fullWidth />}
        {next && early && <EarlyCheckInButton booking={next} room={room} fullWidth />}
        <CleanButton room={room} fullWidth />
      </div>
      {booking && lateDays(booking) > 0 && booking.source === 'manual' && (
        <div className="pt-2 border-0 border-t border-solid border-border">
          <NoShowButton booking={booking} />
        </div>
      )}
    </Card>
  )
}
