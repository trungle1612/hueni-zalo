import dayjs from 'dayjs'
import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Page, Select, useNavigate } from 'zmp-ui'

import { PageContainer } from '@/components'
import { ActivityRow } from '@/modules/pms/components/activity-row'
import {
  CheckInButton,
  CheckOutButton,
  ConfirmButton,
  DeclareButton,
  EarlyCheckInButton,
  NoShowButton,
  useNotify,
} from '@/modules/pms/components/stay-buttons'
import { BackHeader, CallButton, Card, Empty, Tag } from '@/modules/pms/components/ui'
import {
  Booking,
  can,
  canCheckIn,
  canEarlyCheckIn,
  fmtDate,
  guestLabel,
  isEditable,
  isRoomFree,
  isStaying,
  lateDays,
  nights,
  occupiedUntil,
  overdueDays,
  Room,
  sourceLabel,
  STATUS_LABEL,
  today,
  usePlaceOf,
  usePms,
  whenLabel,
} from '@/modules/pms/pms.store'
import { formatMoney } from '@/utils/format'

const time = (iso: string) => dayjs(iso).format('HH:mm, DD/MM')
const isToday = (iso?: string) => !!iso && dayjs(iso).isSame(dayjs(), 'day')

export default function BookingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useNotify()
  const { rooms, bookings, activities, actions } = usePms()
  const booking = bookings.find((b) => b.id === Number(id))
  const room = rooms.find((r) => r.id === booking?.room_id)
  const place = usePlaceOf(room?.id)

  if (!booking || !room || !place) {
    return (
      <Page>
        <BackHeader title="Đặt phòng" />
        <PageContainer withHeader>
          <Empty action={{ label: 'Về Hôm nay', to: '/' }}>Không tìm thấy đặt phòng này.</Empty>
        </PageContainer>
      </Page>
    )
  }

  const owner = can(place, 'manage')
  const staying = isStaying(booking)
  const cancelled = booking.status === 'cancelled'
  const late = lateDays(booking) > 0 || overdueDays(booking) > 0
  const early = canEarlyCheckIn(booking) && isRoomFree(bookings, room.id, today(), booking.start_date, booking.id)
  const history = activities.filter((a) => a.booking_id === booking.id).reverse()

  const rows: [string, React.ReactNode][] = [
    ['Phòng', `${room.name} · ${place.name}`],
    ['Ngày ở', `${fmtDate(booking.start_date)} → ${fmtDate(booking.end_date)} · ${nights(booking)} đêm`],
    ['Số khách', booking.guests ?? 'Chưa có'],
    ['Điện thoại', booking.guest_phone || 'Chưa có'],
    ['Trạng thái', STATUS_LABEL[booking.status]],
    ['Đặt qua', sourceLabel(booking)],
    ...(owner && room.price
      ? [['Tiền phòng (tạm tính)', formatMoney(nights(booking) * room.price)] as [string, string]]
      : []),
    ['Ghi chú', booking.note || 'Không có'],
  ]

  return (
    <Page restoreScroll>
      <BackHeader title={guestLabel(booking)} />
      <PageContainer withHeader>
        <div className="p-4 space-y-4 pb-10">
          <div className="space-y-2 px-1">
            <div className={late && !cancelled ? 'text-xl font-bold text-red-700' : 'text-xl font-bold'}>
              {cancelled ? 'Đã huỷ' : whenLabel(booking)}
            </div>
            <div className="flex flex-wrap gap-2">
              {booking.status === 'hold' && <Tag tone="amber">Giữ chỗ</Tag>}
              {staying && <Tag tone="blue">Đang ở</Tag>}
              {booking.removed_from_feed_at && <Tag tone="red">OTA đã huỷ</Tag>}
              {booking.checked_in_at && (
                <Tag tone={booking.declared_at ? 'green' : 'amber'}>
                  {booking.declared_at ? 'Đã khai báo lưu trú' : 'Chưa khai báo lưu trú'}
                </Tag>
              )}
            </div>
          </div>

          {!cancelled && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <dl className="text-base space-y-1 m-0">
                  <div>
                    <dt className="inline text-text-secondary">Nhận phòng: </dt>
                    <dd className="inline m-0">{booking.checked_in_at ? time(booking.checked_in_at) : 'Chưa nhận'}</dd>
                  </div>
                  <div>
                    <dt className="inline text-text-secondary">Trả phòng: </dt>
                    <dd className="inline m-0">{booking.checked_out_at ? time(booking.checked_out_at) : 'Chưa trả'}</dd>
                  </div>
                </dl>
                <CallButton phone={booking.guest_phone} />
              </div>
              {(canCheckIn(booking) || early || staying) && (
                <div className="space-y-2">
                  <CheckInButton booking={booking} room={room} fullWidth />
                  {early && <EarlyCheckInButton booking={booking} room={room} fullWidth />}
                  <CheckOutButton booking={booking} room={room} fullWidth />
                  <DeclareButton booking={booking} fullWidth />
                </div>
              )}
              {owner && <UndoButtons booking={booking} />}
              {lateDays(booking) > 0 && booking.source === 'manual' && (
                <div className="pt-2 border-0 border-t border-solid border-border">
                  <NoShowButton booking={booking} />
                </div>
              )}
            </Card>
          )}

          {staying && booking.source === 'manual' && <MoveRoom booking={booking} room={room} />}

          <Card>
            <dl className="m-0 divide-y divide-border">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 px-4 py-3 text-base">
                  <dt className="text-text-secondary shrink-0">{label}</dt>
                  <dd className="m-0 text-right font-medium break-words min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {booking.source === 'ical' && (
            <p className="text-base text-text-secondary px-1 m-0">
              Đặt qua {sourceLabel(booking)} nên chỉ xem được. Đổi ngày, huỷ hay đổi phòng trên {sourceLabel(booking)}.
            </p>
          )}
          {booking.checked_out_at && (
            <p className="text-base text-text-secondary px-1 m-0">Khách đã trả phòng, đặt phòng không sửa được nữa.</p>
          )}

          <div className="space-y-2">
            {booking.status === 'hold' && (
              <Button
                fullWidth
                size="medium"
                onClick={() => notify(actions.confirm(booking.id), 'Đã xác nhận đặt phòng')}
              >
                Xác nhận đặt phòng
              </Button>
            )}
            {isEditable(booking) && (
              <Button
                fullWidth
                size="medium"
                variant="secondary"
                onClick={() => navigate(`/bookings/${booking.id}/edit`)}
              >
                Sửa đặt phòng
              </Button>
            )}
            {isEditable(booking) && !booking.checked_in_at && (
              <ConfirmButton
                label="Huỷ đặt phòng"
                title={`Huỷ đặt phòng của ${guestLabel(booking)}?`}
                success="Đã huỷ đặt phòng. Phòng trống lại"
                variant="tertiary"
                fullWidth
                danger
                onConfirm={() => actions.cancel(booking.id)}
              >
                <p className="text-base text-text-secondary m-0">
                  Đặt phòng được giữ lại làm lịch sử, phòng trống lại ngay.
                </p>
              </ConfirmButton>
            )}
          </div>

          {owner && history.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold m-0 px-1">Lịch sử</h2>
              <Card className="px-4 divide-y divide-border">
                {history.map((a) => (
                  <ActivityRow key={a.id} activity={a} />
                ))}
              </Card>
            </section>
          )}
        </div>
      </PageContainer>
    </Page>
  )
}

// Owner only, same day (wiki §6g).
function UndoButtons({ booking }: { booking: Booking }) {
  const actions = usePms((s) => s.actions)
  if (isToday(booking.checked_out_at)) {
    return (
      <ConfirmButton
        label="Hoàn tác trả phòng"
        title="Hoàn tác trả phòng?"
        success="Khách về Đang ở"
        variant="tertiary"
        fullWidth
        onConfirm={() => actions.undoCheckOut(booking.id)}
      >
        <p className="text-base text-text-secondary m-0">Khách về Đang ở. Trạng thái dọn phòng giữ nguyên.</p>
      </ConfirmButton>
    )
  }
  if (isStaying(booking) && isToday(booking.checked_in_at)) {
    return (
      <ConfirmButton
        label="Hoàn tác nhận phòng"
        title="Hoàn tác nhận phòng?"
        success="Khách về Chờ khách"
        variant="tertiary"
        fullWidth
        onConfirm={() => actions.undoCheckIn(booking.id)}
      >
        <p className="text-base text-text-secondary m-0">Khách về Chờ khách. Ngày đến không tự đổi lại.</p>
      </ConfirmButton>
    )
  }
  return null
}

// Free rooms of the same homestay, big enough, free until departure (Booking#move_to).
function MoveRoom({ booking, room }: { booking: Booking; room: Room }) {
  const { rooms, bookings, actions } = usePms()
  const candidates = rooms.filter(
    (r) =>
      r.place_id === room.place_id &&
      r.id !== room.id &&
      r.active &&
      r.max_guests >= (booking.guests || 1) &&
      isRoomFree(bookings, r.id, today(), occupiedUntil(booking), booking.id),
  )
  const [target, setTarget] = useState<number | undefined>()
  const picked = candidates.find((r) => r.id === target)

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-lg font-semibold m-0">Đổi phòng</h2>
      {candidates.length ? (
        <>
          <Select
            label="Đổi sang phòng"
            placeholder="Chọn phòng trống"
            value={target}
            onChange={(v) => setTarget(Number(v))}
            closeOnSelect
          >
            {candidates.map((r) => (
              <Select.Option key={r.id} value={r.id} title={`${r.name} · tối đa ${r.max_guests} khách`} />
            ))}
          </Select>
          {picked && (
            <ConfirmButton
              label={`Đổi sang ${picked.name}`}
              title={`Đổi ${guestLabel(booking)} sang ${picked.name}?`}
              success={`Đã đổi sang ${picked.name}. Phòng ${room.name} cần dọn`}
              variant="secondary"
              fullWidth
              onConfirm={() => actions.move(booking.id, picked.id)}
            >
              <p className="text-base text-text-secondary m-0">Phòng {room.name} chuyển sang Chưa dọn.</p>
            </ConfirmButton>
          )}
        </>
      ) : (
        <p className="text-base text-text-secondary m-0">Không có phòng nào trống tới ngày trả phòng.</p>
      )}
    </Card>
  )
}
