import dayjs from 'dayjs'
import React from 'react'
import { Button, Header, Page, useNavigate, useSnackbar } from 'zmp-ui'

import { PageContainer } from '@/components'
import { fmtDate, RoomDay, roomDay, STATE_LABEL, usePms } from '@/modules/pms/pms.store'
import { PmsTabs } from '@/modules/pms/pms-tabs'

export default function TodayPage() {
  const { placeName, rooms, bookings } = usePms()
  const days = rooms.map((r) => roomDay(r, bookings))
  const count = (...states: RoomDay['state'][]) => days.filter((x) => states.includes(x.state)).length

  const stats = [
    { label: 'Khách đến', value: count('arriving', 'held') },
    { label: 'Trả phòng', value: count('leaving') },
    { label: 'Đang ở', value: count('occupied', 'leaving') },
    { label: 'Cần dọn', value: rooms.filter((r) => r.active && r.housekeeping === 'dirty').length },
  ]

  return (
    <>
      <Page restoreScroll>
        <Header title={placeName} showBackIcon={false} />
        <PageContainer withHeader withBottomNav>
          <div className="p-4 space-y-4">
            <div className="text-text-secondary text-sm">Hôm nay, {dayjs().format('dddd DD/MM/YYYY')}</div>
            <div className="grid grid-cols-4 gap-2">
              {stats.map((s) => (
                <div key={s.label} className="bg-white rounded-xl p-3 text-center">
                  <div className="text-2xl font-semibold">{s.value}</div>
                  <div className="text-xs text-text-secondary mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="font-semibold">Phòng</div>
            {days.map((day) => (
              <RoomCard key={day.room.id} day={day} />
            ))}
          </div>
        </PageContainer>
      </Page>
      <PmsTabs active="/" />
    </>
  )
}

function RoomCard({ day }: { day: RoomDay }) {
  const navigate = useNavigate()
  const { openSnackbar } = useSnackbar()
  const actions = usePms((s) => s.actions)
  const { room, state, booking, next } = day
  const badge = STATE_LABEL[state]
  const done = (text: string) => openSnackbar({ text, type: 'success', duration: 2000 })

  return (
    <div className="bg-white rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-base">{room.name}</div>
        <div className="flex gap-1">
          {room.housekeeping === 'dirty' && (
            <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">Cần dọn</span>
          )}
          <span className={`px-2 py-1 rounded-full text-xs ${badge.className}`}>{badge.label}</span>
        </div>
      </div>

      {booking ? (
        <button
          className="w-full text-left bg-ng-10 rounded-lg p-3 border-0"
          onClick={() => navigate(`/bookings/${booking.id}`)}
        >
          <div className="font-medium">{booking.guest_name || 'Khách'}</div>
          <div className="text-sm text-text-secondary">
            {fmtDate(booking.start_date)} → {fmtDate(booking.end_date)}
            {booking.guests ? ` · ${booking.guests} khách` : ''}
          </div>
          {booking.checked_in_at && !booking.declared_at && (
            <div className="text-xs text-amber-700 mt-1">Chưa khai báo lưu trú</div>
          )}
        </button>
      ) : (
        next && (
          <div className="text-sm text-text-secondary">
            Khách kế tiếp: {next.guest_name || 'Khách'} · {fmtDate(next.start_date)}
          </div>
        )
      )}

      <div className="flex gap-2">
        {(state === 'arriving' || state === 'held') && booking && (
          <Button size="small" fullWidth onClick={() => (actions.checkIn(booking.id), done('Đã nhận phòng'))}>
            Nhận phòng
          </Button>
        )}
        {(state === 'occupied' || state === 'leaving') && booking && (
          <Button
            size="small"
            fullWidth
            variant={state === 'leaving' ? 'primary' : 'secondary'}
            onClick={() => (actions.checkOut(booking.id), done('Đã trả phòng'))}
          >
            Trả phòng
          </Button>
        )}
        {room.housekeeping === 'dirty' && (
          <Button
            size="small"
            fullWidth
            variant="secondary"
            onClick={() => (actions.clean(room.id), done('Đã dọn xong'))}
          >
            Dọn xong
          </Button>
        )}
        {state === 'free' && (
          <Button size="small" fullWidth variant="tertiary" onClick={() => navigate(`/bookings/new?room=${room.id}`)}>
            Thêm đặt phòng
          </Button>
        )}
      </div>
    </div>
  )
}
