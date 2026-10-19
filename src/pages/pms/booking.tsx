import React from 'react'
import { useParams } from 'react-router-dom'
import { Button, Header, Page, useSnackbar } from 'zmp-ui'

import { PageContainer } from '@/components'
import { fmtDate, nights, sourceLabel, STATUS_LABEL, usePms } from '@/modules/pms/pms.store'
import { formatMoney } from '@/utils/format'

export default function BookingPage() {
  const { id } = useParams()
  const { openSnackbar } = useSnackbar()
  const { rooms, bookings, actions } = usePms()
  const booking = bookings.find((b) => b.id === Number(id))
  const room = rooms.find((r) => r.id === booking?.room_id)

  if (!booking || !room) {
    return (
      <Page>
        <Header title="Đặt phòng" />
        <PageContainer withHeader>
          <div className="p-4 text-text-secondary">Không tìm thấy đặt phòng</div>
        </PageContainer>
      </Page>
    )
  }

  const done = (text: string) => openSnackbar({ text, type: 'success', duration: 2000 })
  const inHouse = booking.checked_in_at && !booking.checked_out_at
  const canCheckIn = booking.status !== 'cancelled' && !booking.checked_in_at

  const rows: [string, React.ReactNode][] = [
    ['Phòng', room.name],
    ['Ngày', `${fmtDate(booking.start_date)} → ${fmtDate(booking.end_date)} (${nights(booking)} đêm)`],
    ['Số khách', booking.guests ?? '—'],
    ['Điện thoại', booking.guest_phone ? <a href={`tel:${booking.guest_phone}`}>{booking.guest_phone}</a> : '—'],
    ['Trạng thái', STATUS_LABEL[booking.status]],
    ['Nguồn', sourceLabel(booking)],
    ['Tạm tính', formatMoney(nights(booking) * room.price)],
    ['Ghi chú', booking.note || '—'],
  ]

  return (
    <Page restoreScroll>
      <Header title={booking.guest_name || 'Đặt phòng'} />
      <PageContainer withHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {inHouse && <Tag className="bg-blue-100 text-blue-800">Đang ở</Tag>}
            {booking.checked_out_at && <Tag className="bg-gray-100 text-gray-700">Đã trả phòng</Tag>}
            {booking.checked_in_at && (
              <Tag className={booking.declared_at ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
                {booking.declared_at ? 'Đã khai báo lưu trú' : 'Chưa khai báo lưu trú'}
              </Tag>
            )}
          </div>

          <div className="bg-white rounded-xl divide-y divide-border">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <span className="text-text-secondary">{label}</span>
                <span className="text-right font-medium">{value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {canCheckIn && (
              <Button fullWidth onClick={() => (actions.checkIn(booking.id), done('Đã nhận phòng'))}>
                Nhận phòng
              </Button>
            )}
            {inHouse && (
              <Button fullWidth onClick={() => (actions.checkOut(booking.id), done('Đã trả phòng'))}>
                Trả phòng
              </Button>
            )}
            {booking.checked_in_at && !booking.declared_at && (
              <Button
                fullWidth
                variant="secondary"
                onClick={() => (actions.declare(booking.id), done('Đã khai báo lưu trú'))}
              >
                Đã khai báo lưu trú
              </Button>
            )}
            {canCheckIn && booking.source === 'manual' && (
              <Button
                fullWidth
                variant="tertiary"
                type="danger"
                onClick={() => (actions.cancel(booking.id), done('Đã huỷ đặt phòng'))}
              >
                Huỷ / khách không đến
              </Button>
            )}
          </div>
        </div>
      </PageContainer>
    </Page>
  )
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`px-2 py-1 rounded-full text-xs ${className}`}>{children}</span>
}
