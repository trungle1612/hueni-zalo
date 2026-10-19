import dayjs from 'dayjs'
import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Header, Input, Page, Select, useNavigate, useSnackbar } from 'zmp-ui'

import { PageContainer } from '@/components'
import { Booking, dateProblem, usePms } from '@/modules/pms/pms.store'
import { PmsTabs } from '@/modules/pms/pms-tabs'

export default function NewBookingPage() {
  const navigate = useNavigate()
  const { openSnackbar } = useSnackbar()
  const [params] = useSearchParams()
  const { rooms, bookings, actions } = usePms()
  const activeRooms = rooms.filter((r) => r.active)

  const [form, setForm] = useState({
    room_id: Number(params.get('room')) || activeRooms[0]?.id,
    start_date: dayjs().format('YYYY-MM-DD'),
    end_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    status: 'confirmed' as Booking['status'],
    guest_name: '',
    guest_phone: '',
    guests: '',
    note: '',
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value })
  const problem = dateProblem(bookings, form)

  function submit() {
    if (problem) return
    const id = actions.create({ ...form, guests: Number(form.guests) || undefined })
    openSnackbar({ text: 'Đã tạo đặt phòng', type: 'success', duration: 2000 })
    navigate(`/bookings/${id}`, { replace: true })
  }

  return (
    <>
      <Page restoreScroll>
        <Header title="Thêm đặt phòng" showBackIcon={false} />
        <PageContainer withHeader withBottomNav>
          <div className="p-4 space-y-4 bg-white min-h-full">
            <Select
              label="Phòng"
              value={form.room_id}
              onChange={(v) => setForm({ ...form, room_id: Number(v) })}
              closeOnSelect
            >
              {activeRooms.map((r) => (
                <Select.Option key={r.id} value={r.id} title={`${r.name} · tối đa ${r.max_guests} khách`} />
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" label="Ngày đến" value={form.start_date} onChange={set('start_date')} />
              <Input type="date" label="Ngày đi" value={form.end_date} onChange={set('end_date')} />
            </div>
            <div className={`text-sm font-medium ${problem ? 'text-red-600' : 'text-green-700'}`}>
              {problem || 'Còn trống'}
            </div>
            <Input label="Tên khách" placeholder="Nguyễn Văn A" value={form.guest_name} onChange={set('guest_name')} />
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="text"
                inputMode="tel"
                label="Điện thoại"
                value={form.guest_phone}
                onChange={set('guest_phone')}
              />
              <Input type="number" label="Số khách" value={form.guests} onChange={set('guests')} />
            </div>
            <Select
              label="Trạng thái"
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v as Booking['status'] })}
              closeOnSelect
            >
              <Select.Option value="confirmed" title="Đã xác nhận" />
              <Select.Option value="hold" title="Giữ chỗ" />
            </Select>
            <Input.TextArea label="Ghi chú" value={form.note} onChange={set('note')} />
            <Button fullWidth disabled={!!problem} onClick={submit}>
              Lưu đặt phòng
            </Button>
          </div>
        </PageContainer>
      </Page>
      <PmsTabs active="/bookings/new" />
    </>
  )
}
