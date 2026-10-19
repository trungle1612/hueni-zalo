import dayjs from 'dayjs'
import React from 'react'
import { Header, Page, useNavigate } from 'zmp-ui'

import { PageContainer } from '@/components'
import { Booking, usePms } from '@/modules/pms/pms.store'
import { PmsTabs } from '@/modules/pms/pms-tabs'

const DAYS = 14
const COL = 44 // px per day
const NAME_COL = 88

const barClass = (b: Booking) =>
  b.status === 'hold'
    ? 'bg-purple-200 text-purple-900'
    : b.source === 'ical'
      ? 'bg-sky-200 text-sky-900'
      : 'bg-green-200 text-green-900'

export default function CalendarPage() {
  const navigate = useNavigate()
  const { rooms, bookings } = usePms()
  const start = dayjs().startOf('day')
  const days = Array.from({ length: DAYS }, (_, i) => start.add(i, 'day'))
  const visible = bookings.filter((b) => b.status !== 'cancelled')

  return (
    <>
      <Page restoreScroll>
        <Header title="Lịch phòng" showBackIcon={false} />
        <PageContainer withHeader withBottomNav>
          <div className="p-4 space-y-3">
            <div className="bg-white rounded-xl overflow-x-auto">
              <div style={{ width: NAME_COL + DAYS * COL }}>
                <div className="flex border-b border-border">
                  <div className="shrink-0 sticky left-0 bg-white z-10" style={{ width: NAME_COL }} />
                  {days.map((day) => (
                    <div key={day.valueOf()} className="shrink-0 text-center py-2 text-xs" style={{ width: COL }}>
                      <div className="text-text-secondary">{day.format('dd')}</div>
                      <div className={day.isSame(start) ? 'font-bold text-primary' : 'font-medium'}>
                        {day.format('DD')}
                      </div>
                    </div>
                  ))}
                </div>
                {rooms.map((room) => (
                  <div key={room.id} className="flex relative h-12 border-b border-border last:border-0">
                    <div
                      className="shrink-0 sticky left-0 bg-white z-10 px-3 flex items-center text-sm font-medium"
                      style={{ width: NAME_COL }}
                    >
                      <span className={room.active ? '' : 'text-text-subtle line-through'}>{room.name}</span>
                    </div>
                    {visible
                      .filter((b) => b.room_id === room.id)
                      .map((b) => {
                        const from = Math.max(0, dayjs(b.start_date).diff(start, 'day'))
                        const to = Math.min(DAYS, dayjs(b.end_date).diff(start, 'day'))
                        if (to <= from) return null
                        return (
                          <button
                            key={b.id}
                            onClick={() => navigate(`/bookings/${b.id}`)}
                            className={`absolute top-2 h-8 rounded-md px-2 text-xs font-medium truncate border-0 text-left ${barClass(b)}`}
                            style={{ left: NAME_COL + from * COL + 2, width: (to - from) * COL - 4 }}
                          >
                            {b.guest_name || 'Khách'}
                          </button>
                        )
                      })}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-4 text-xs text-text-secondary">
              <Legend className="bg-green-200" label="Trực tiếp" />
              <Legend className="bg-sky-200" label="OTA" />
              <Legend className="bg-purple-200" label="Giữ chỗ" />
            </div>
          </div>
        </PageContainer>
      </Page>
      <PmsTabs active="/calendar" />
    </>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block w-3 h-3 rounded ${className}`} />
      {label}
    </span>
  )
}
