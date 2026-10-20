import dayjs from 'dayjs'
import React, { useState } from 'react'
import { Button, Header, Icon, Page, useNavigate } from 'zmp-ui'

import { PageContainer } from '@/components'
import { Card, PlacePicker, WarnIcon } from '@/modules/pms/components/ui'
import {
  addDays,
  Booking,
  conflicts,
  daysBetween,
  fmtDate,
  fmtRange,
  guestLabel,
  isStaying,
  placeRooms,
  today,
  usePlace,
  usePms,
} from '@/modules/pms/pms.store'
import { PmsTabs } from '@/modules/pms/pms-tabs'
import { clsx } from '@/utils/clsx'

const DAYS = 14
const COL = 56 // px per day: a thumb-sized cell, and room for a short name on a one-night bar
const NAME_COL = 96
const ROW = 64

type BarKind = 'confirmed' | 'hold' | 'ota' | 'out' | 'overdue'

// Wiki §6c bar types, each with its own shape so colour is never the only cue.
const BAR: Record<BarKind, { className: string; legend: string }> = {
  confirmed: { className: 'bg-primary-pressed text-white', legend: 'Đã xác nhận' },
  hold: { className: 'bg-amber-100 text-amber-950 border-2 border-dashed border-amber-600', legend: 'Giữ chỗ' },
  ota: { className: 'bg-gray-200 text-gray-900', legend: 'OTA (chỉ xem)' },
  out: { className: 'bg-white text-gray-700 border border-solid border-gray-400', legend: 'Đã trả phòng' },
  overdue: { className: 'bg-red-50 text-red-900 border-2 border-solid border-red-600', legend: 'Quá hạn' },
}

function barOf(b: Booking): { kind: BarKind; until: string } {
  if (b.checked_out_at) return { kind: 'out', until: b.end_date }
  if (isStaying(b) && b.end_date < today()) return { kind: 'overdue', until: addDays(today(), 1) }
  if (b.source === 'ical') return { kind: 'ota', until: b.end_date }
  return { kind: b.status === 'hold' ? 'hold' : 'confirmed', until: b.end_date }
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const place = usePlace()
  const { rooms, bookings } = usePms()
  const [offset, setOffset] = useState(0)
  const start = addDays(today(), offset)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i))
  const end = addDays(start, DAYS)

  const roomList = placeRooms(rooms, place.id).filter((r) => r.active)
  const roomIds = new Set(roomList.map((r) => r.id))
  const clashes = conflicts(bookings).filter((c) => roomIds.has(c.ota.room_id))
  const conflictIds = new Set(clashes.flatMap((c) => [c.ota.id, c.manual.id]))

  return (
    <>
      <Page restoreScroll>
        <Header title="Lịch phòng" showBackIcon={false} />
        <PageContainer withHeader withBottomNav>
          <div className="p-4 space-y-4">
            <PlacePicker />

            {clashes.map(({ ota, manual }) => (
              <div
                key={`${ota.id}-${manual.id}`}
                className="flex gap-2 items-start text-base bg-red-50 text-red-900 rounded-xl px-3 py-3"
              >
                <WarnIcon label="Trùng lịch" size={20} />
                <span>
                  <b>Trùng lịch phòng {rooms.find((r) => r.id === ota.room_id)?.name}:</b> {guestLabel(ota)}{' '}
                  {fmtRange(ota)} trùng với {guestLabel(manual)}. Đổi ngày, đổi phòng hoặc huỷ đặt phòng nhập tay.
                </span>
              </div>
            ))}

            <div className="text-base font-semibold px-1">
              {fmtDate(start)} – {fmtDate(addDays(end, -1))}
            </div>

            <Card className="overflow-x-auto">
              <div style={{ width: NAME_COL + DAYS * COL }}>
                <div className="flex border-0 border-b border-solid border-border">
                  <div className="shrink-0 sticky left-0 bg-white z-20" style={{ width: NAME_COL }} />
                  {days.map((d) => (
                    <div key={d} className="shrink-0 text-center py-2" style={{ width: COL }}>
                      <div className="text-sm text-text-secondary">{dayjs(d).format('dd')}</div>
                      <div className={d === today() ? 'text-sm font-bold text-primary-pressed' : 'text-sm font-medium'}>
                        {dayjs(d).format('DD/MM')}
                      </div>
                    </div>
                  ))}
                </div>

                {roomList.map((room) => {
                  const mine = bookings.filter(
                    (b) => b.room_id === room.id && b.status !== 'cancelled' && b.start_date < end,
                  )
                  const leavingToday = mine.find((b) => isStaying(b) && b.end_date === today())
                  const hasConflict = mine.some((b) => conflictIds.has(b.id))
                  return (
                    <div
                      key={room.id}
                      className="flex relative border-0 border-b border-solid border-border last:border-b-0"
                      style={{ height: ROW }}
                    >
                      <div
                        className="shrink-0 sticky left-0 bg-white z-20 px-3 flex flex-col justify-center border-0 border-r border-solid border-border"
                        style={{ width: NAME_COL }}
                      >
                        <span className="flex items-center gap-1 text-base font-semibold truncate">
                          {hasConflict && <WarnIcon label="Trùng lịch" />}
                          {room.name}
                        </span>
                        {leavingToday && (
                          <span className="text-sm text-text-secondary truncate">Trả: {guestLabel(leavingToday)}</span>
                        )}
                      </div>
                      {/* Empty cells are a mouse/thumb shortcut; keyboard and screen readers use "Đặt phòng". */}
                      {days.map((d) => (
                        <button
                          key={d}
                          tabIndex={-1}
                          aria-hidden
                          disabled={d < today()}
                          className={clsx(
                            'shrink-0 h-full border-0 border-l border-solid border-border bg-transparent p-0',
                            d === today() && 'bg-primary/5',
                          )}
                          style={{ width: COL }}
                          onClick={() => navigate(`/bookings/new?room=${room.id}&start=${d}`)}
                        />
                      ))}
                      {mine.map((b) => {
                        const { kind, until } = barOf(b)
                        const from = Math.max(0, daysBetween(start, b.start_date))
                        const to = Math.min(DAYS, daysBetween(start, until))
                        if (to <= from) return null
                        const conflict = conflictIds.has(b.id)
                        // Conflicting bars split the row (manual top, OTA bottom) so neither hides the other.
                        const vertical = conflict
                          ? b.source === 'ical'
                            ? { top: ROW / 2 + 1, bottom: 4 }
                            : { top: 4, bottom: ROW / 2 + 1 }
                          : { top: 8, bottom: 8 }
                        return (
                          <button
                            key={b.id}
                            onClick={() => navigate(`/bookings/${b.id}`)}
                            aria-label={`${guestLabel(b)}, ${fmtRange(b)}, ${BAR[kind].legend}${conflict ? ', trùng lịch' : ''}`}
                            className={clsx(
                              'absolute flex items-center gap-1 rounded-lg px-2 text-sm font-semibold text-left z-10 overflow-hidden whitespace-nowrap',
                              BAR[kind].className,
                              kind !== 'out' && kind !== 'overdue' && kind !== 'hold' && 'border-0',
                              conflict && 'ring-2 ring-red-600 ring-offset-1',
                            )}
                            style={{ left: NAME_COL + from * COL + 2, width: (to - from) * COL - 4, ...vertical }}
                          >
                            {(conflict || b.removed_from_feed_at) && (
                              <Icon icon="zi-warning-solid" size={14} className="shrink-0" />
                            )}
                            {kind === 'out' && <Icon icon="zi-check" size={14} className="shrink-0" />}
                            <span className="truncate">
                              {/* A one-night bar fits a given name (last word in Vietnamese), not "Anh M…". */}
                              {to - from === 1 ? guestLabel(b).split(' ').pop() : guestLabel(b)}
                              {kind === 'overdue' && ' · quá hạn'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Navigation sits low, within thumb reach. */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="medium"
                variant="secondary"
                prefixIcon={<Icon icon="zi-chevron-left" />}
                onClick={() => setOffset(offset - DAYS)}
              >
                Trước
              </Button>
              <Button size="medium" variant={offset ? 'secondary' : 'tertiary'} onClick={() => setOffset(0)}>
                Hôm nay
              </Button>
              <Button
                size="medium"
                variant="secondary"
                suffixIcon={<Icon icon="zi-chevron-right" />}
                onClick={() => setOffset(offset + DAYS)}
              >
                Sau
              </Button>
            </div>
            <Button
              fullWidth
              size="medium"
              prefixIcon={<Icon icon="zi-plus" />}
              onClick={() => navigate(`/bookings/new?place=${place.slug}`)}
            >
              Đặt phòng
            </Button>

            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-text-secondary px-1 list-none m-0">
              {(Object.keys(BAR) as BarKind[]).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className={clsx('inline-block w-6 h-4 rounded shrink-0', BAR[k].className)} aria-hidden />
                  {BAR[k].legend}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <WarnIcon label="Trùng lịch" /> Trùng lịch
              </li>
            </ul>
            <p className="text-base text-text-secondary px-1 m-0">Chạm ô trống trên lịch để đặt phòng ngày đó.</p>
          </div>
        </PageContainer>
      </Page>
      <PmsTabs active="/calendar" />
    </>
  )
}
