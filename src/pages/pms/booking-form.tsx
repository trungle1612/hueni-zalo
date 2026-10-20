import React, { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Button, Icon, Input, Page, Select, useNavigate, useSnackbar } from 'zmp-ui'

import { PageContainer } from '@/components'
import { BackHeader, Empty, WarnIcon } from '@/modules/pms/components/ui'
import {
  addDays,
  Booking,
  dateProblem,
  fmtRange,
  isEditable,
  isRoomFree,
  nights,
  placeRooms,
  today,
  usePlace,
  usePms,
} from '@/modules/pms/pms.store'
import { clsx } from '@/utils/clsx'

// Phone must be callable: digits, spaces and + - . ( ), 8–15 digits (foreign numbers allowed).
const phoneError = (phone: string) => {
  if (!phone.trim()) return undefined
  const digits = phone.replace(/\D/g, '').length
  return /^[\d\s+\-.()]+$/.test(phone) && digits >= 8 && digits <= 15
    ? undefined
    : 'Số điện thoại không hợp lệ: cần 8–15 chữ số'
}

const STATUS_CHOICES = [
  { value: 'confirmed', title: 'Đã xác nhận', hint: 'Khách chắc chắn đến.' },
  { value: 'hold', title: 'Giữ chỗ', hint: 'Khách chưa chắc. Phòng vẫn được giữ cho tới khi xác nhận hoặc huỷ.' },
] as const

// Create (/bookings/new?room=&start=&place=) and edit (/bookings/:id/edit) share this form (wiki §6c).
export default function BookingFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { openSnackbar } = useSnackbar()
  const { rooms, bookings, actions } = usePms()

  const editing = id ? bookings.find((b) => b.id === Number(id)) : undefined
  const paramRoom = rooms.find((r) => r.id === Number(params.get('room') || editing?.room_id))
  const fallbackPlace = usePlace(params.get('place') || undefined)
  const placeId = paramRoom?.place_id ?? fallbackPlace.id
  const roomList = placeRooms(rooms, placeId).filter((r) => r.active)

  const start0 = editing?.start_date || params.get('start') || today()
  const firstFree = roomList.find((r) => isRoomFree(bookings, r.id, start0, addDays(start0, 1)))
  const [form, setForm] = useState({
    room_id: paramRoom?.id ?? firstFree?.id ?? roomList[0]?.id,
    start_date: start0,
    end_date: editing?.end_date || addDays(start0, 1),
    guest_name: editing?.guest_name || '',
    guest_phone: editing?.guest_phone || '',
    guests: editing?.guests ? String(editing.guests) : '',
    status: (editing?.status === 'hold' ? 'hold' : 'confirmed') as 'hold' | 'confirmed',
    note: editing?.note || '',
  })
  const [submitted, setSubmitted] = useState(false)

  if (id && (!editing || !isEditable(editing))) {
    return (
      <Page>
        <BackHeader title="Sửa đặt phòng" />
        <PageContainer withHeader>
          <Empty action={{ label: 'Về Hôm nay', to: '/' }}>
            {editing ? 'Đặt phòng này không sửa được nữa.' : 'Không tìm thấy đặt phòng này.'}
          </Empty>
        </PageContainer>
      </Page>
    )
  }

  const room = rooms.find((r) => r.id === form.room_id)
  const update = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  const setStart = (start: string) =>
    update({ start_date: start, end_date: form.end_date <= start ? addDays(start, 1) : form.end_date })

  const problem = room ? dateProblem(bookings, form, editing?.id) : 'Chọn phòng'
  const otherFree = problem
    ? roomList.filter(
        (r) => r.id !== form.room_id && isRoomFree(bookings, r.id, form.start_date, form.end_date, editing?.id),
      )
    : []
  const guests = Number(form.guests) || undefined
  const errors = {
    guest_phone: phoneError(form.guest_phone),
    guests:
      room && guests && guests > room.max_guests ? `Phòng ${room.name} tối đa ${room.max_guests} khách` : undefined,
  }
  const invalid = !!problem || Object.values(errors).some(Boolean)

  function submit() {
    setSubmitted(true)
    if (invalid) return
    const draft: Omit<Booking, 'id' | 'source' | 'status'> & { status: 'hold' | 'confirmed' } = {
      ...form,
      guests,
      guest_name: form.guest_name.trim() || undefined,
      guest_phone: form.guest_phone.trim() || undefined,
      note: form.note.trim() || undefined,
    }
    const result = editing ? (actions.update(editing.id, draft) ?? editing.id) : actions.create(draft)
    if (typeof result === 'string') return openSnackbar({ text: result, type: 'error', duration: 6000 })
    openSnackbar({ text: editing ? 'Đã lưu đặt phòng' : 'Đã đặt phòng', type: 'success', duration: 2000 })
    navigate(`/bookings/${result}`, { replace: true })
  }

  const status = (key: keyof typeof errors) => (errors[key] && (submitted || key === 'guests') ? 'error' : undefined)

  return (
    <Page restoreScroll className="bg-white">
      <BackHeader title={editing ? 'Sửa đặt phòng' : 'Đặt phòng mới'} />
      <PageContainer withHeader>
        <div className="p-4 space-y-5 pb-10">
          {roomList.length === 1 ? (
            <div>
              <div className="text-base text-text-secondary">Phòng</div>
              <div className="font-semibold text-lg">
                {roomList[0].name} · tối đa {roomList[0].max_guests} khách
              </div>
            </div>
          ) : (
            <Select label="Phòng" value={form.room_id} onChange={(v) => update({ room_id: Number(v) })} closeOnSelect>
              {roomList.map((r) => (
                <Select.Option key={r.id} value={r.id} title={`${r.name} · tối đa ${r.max_guests} khách`} />
              ))}
            </Select>
          )}

          <div className="grid grid-cols-2 gap-3">
            <DateField label="Nhận phòng" value={form.start_date} onChange={setStart} />
            <DateField label="Trả phòng" value={form.end_date} onChange={(end_date) => update({ end_date })} />
          </div>

          <div
            aria-live="polite"
            className={clsx(
              'rounded-xl px-3 py-3 text-base font-medium',
              problem ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-900',
            )}
          >
            <div className="flex gap-2 items-start">
              {problem ? (
                <WarnIcon label="Không đặt được" size={20} />
              ) : (
                <Icon icon="zi-check-circle-solid" size={20} className="shrink-0" />
              )}
              <span>
                {problem ||
                  (editing
                    ? `Không trùng lịch · ${nights(form)} đêm`
                    : `${room?.name} còn trống · ${nights(form)} đêm (${fmtRange(form)})`)}
              </span>
            </div>
            {otherFree.length > 0 && (
              <div className="mt-3 space-y-2 font-normal text-text">
                <div>Phòng khác còn trống, chạm để chọn:</div>
                <div className="flex flex-wrap gap-2">
                  {otherFree.map((r) => (
                    <Button key={r.id} size="medium" variant="secondary" onClick={() => update({ room_id: r.id })}>
                      Phòng {r.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Input
            label="Tên khách"
            maxLength={100}
            value={form.guest_name}
            onChange={(e) => update({ guest_name: e.target.value })}
          />
          <Input
            type="text"
            inputMode="tel"
            label="Số điện thoại"
            value={form.guest_phone}
            status={status('guest_phone')}
            errorText={errors.guest_phone}
            onChange={(e) => update({ guest_phone: e.target.value })}
          />
          <Input
            type="number"
            inputMode="numeric"
            label={room ? `Số khách (tối đa ${room.max_guests})` : 'Số khách'}
            value={form.guests}
            status={status('guests')}
            errorText={errors.guests}
            onChange={(e) => update({ guests: e.target.value })}
          />
          <fieldset className="border-0 p-0 m-0 space-y-2">
            <legend className="text-base mb-2 p-0">Khách đã chắc chắn chưa?</legend>
            {STATUS_CHOICES.map((c) => (
              <label
                key={c.value}
                className={clsx(
                  'flex gap-3 items-start rounded-xl border-2 border-solid p-3 min-h-[48px]',
                  form.status === c.value ? 'border-primary bg-primary-soft' : 'border-border bg-white',
                )}
              >
                <input
                  type="radio"
                  name="status"
                  value={c.value}
                  checked={form.status === c.value}
                  onChange={() => update({ status: c.value })}
                  className="mt-1 w-5 h-5 accent-[#C2410C] shrink-0"
                />
                <span>
                  <span className="block text-base font-semibold">{c.title}</span>
                  <span className="block text-base text-text-secondary">{c.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Input.TextArea label="Ghi chú" value={form.note} onChange={(e) => update({ note: e.target.value })} />

          <div className="space-y-2 pt-2">
            <Button fullWidth size="medium" disabled={!!problem} onClick={submit}>
              {editing ? 'Lưu thay đổi' : 'Đặt phòng'}
            </Button>
            <Button fullWidth size="medium" variant="tertiary" onClick={() => navigate(-1)}>
              Thôi, không {editing ? 'sửa' : 'đặt'}
            </Button>
          </div>
        </div>
      </PageContainer>
    </Page>
  )
}

// zmp-ui Input has no date type; the native picker is the best one on phones anyway.
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-base mb-2">{label}</span>
      <input
        type="date"
        required
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="w-full h-12 px-3 rounded-lg border border-solid border-[#8A8F94] bg-white text-base text-text font-[inherit] box-border"
      />
    </label>
  )
}
