import { create } from 'zustand'

import { phoneDigits } from './components/ui'
import { ActivityKind, Booking, Charge, usePms } from './pms.store'

// Hồ sơ khách, Phiếu tính tiền extras and Tin nhắn tự động.
// ponytail: in-memory mock like pms.store; guest profiles, invoices and templates become hueni-api resources later.

// "Nguyễn Thị Lan" matches "nguyen thi lan".
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()

// One guest = one phone number; without a phone, the name. OTA bookings carry neither, so they have no profile.
export const guestKey = (b: Booking) =>
  b.source === 'manual' ? phoneDigits(b.guest_phone) || (b.guest_name ? fold(b.guest_name) : '') : ''

// Services that can go on the bill (the catalog is edited with Loại phòng và giá).
export const SERVICES: Omit<Charge, 'id' | 'qty' | 'at'>[] = [
  { name: 'Nước suối', price: 15000, unit: 'chai' },
  { name: 'Giặt ủi', price: 30000, unit: 'kg' },
  { name: 'Thuê xe máy', price: 150000, unit: 'ngày' },
  { name: 'Nhận phòng sớm trước 12:00', price: 100000, unit: 'lần' },
  { name: 'Trả phòng muộn đến 15:00', price: 150000, unit: 'lần' },
]
// Front desk can give up to this share of the room total; more is the owner's call.
export const STAFF_DISCOUNT = 0.1

export type Papers = { id_no: string; dob: string; nationality: string; email?: string }
export type Invoice = { buyer: string; tax_code?: string; email: string; at: string }

export type Template = {
  id: string
  name: string
  when: string
  on: boolean
  sms: boolean
  pending?: boolean // an edit waits for Zalo's approval; the old text keeps running
  body: string
}
export type Sent = { guest: string; tpl: string; detail: string; at: string; st: 'ok' | 'sms' | 'fail' }

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600e3).toISOString()

type State = {
  notes: Record<string, string>
  flags: Record<string, string> // "Cần lưu ý": every staff member sees it
  papers: Record<string, Papers>
  invoices: Record<number, Invoice>
  templates: Template[]
  sent: Sent[]
}

export const useGuests = create<State>(() => ({
  notes: { '0987654321': 'Thích phòng tầng 1, yên tĩnh. Thường xin nhận phòng sớm.' },
  flags: {},
  papers: {
    '0912345678': { id_no: '079091001234', dob: '12/05/1991', nationality: 'Việt Nam' },
    '0987654321': { id_no: '046188004471', dob: '03/09/1988', nationality: 'Việt Nam', email: 'binh@example.com' },
    '821012345678': { id_no: 'M12378447', dob: '20/02/1985', nationality: 'Hàn Quốc' },
  },
  invoices: {},
  templates: [
    {
      id: 'conf',
      name: 'Xác nhận đặt phòng',
      when: 'Ngay khi tạo đặt phòng',
      on: true,
      sms: true,
      body: 'Chào {tên khách}, {cơ sở} xác nhận đặt phòng {mã}: phòng {phòng}, nhận {ngày đến} 14:00, trả {ngày đi} 12:00. Đã cọc {đã trả}, còn {còn thu}.',
    },
    {
      id: 'rem',
      name: 'Nhắc trước ngày đến',
      when: '09:00 một ngày trước khi đến',
      on: true,
      sms: true,
      body: 'Chào {tên khách}, hẹn gặp bạn ngày mai {ngày đến}. Nhận phòng từ 14:00. Cần đổi giờ đến, trả lời tin này.',
    },
    {
      id: 'ci',
      name: 'Hướng dẫn nhận phòng',
      when: '12:00 ngày đến',
      on: true,
      sms: false,
      pending: true,
      body: 'Phòng {phòng} của bạn đã sẵn sàng. Wifi và số lễ tân có trong tin này.',
    },
    {
      id: 'thx',
      name: 'Cảm ơn và xin đánh giá',
      when: '2 giờ sau khi trả phòng',
      on: true,
      sms: false,
      body: 'Cảm ơn {tên khách} đã ở {cơ sở}. Bạn dành 1 phút đánh giá giúp chúng tôi nhé.',
    },
    {
      id: 'dep',
      name: 'Nhắc chuyển cọc',
      when: '12 giờ sau khi đặt nếu chưa cọc',
      on: false,
      sms: false,
      body: 'Đặt phòng {mã} đang chờ cọc. Sau 24 giờ chưa cọc, phòng sẽ được mở lại.',
    },
  ],
  sent: [
    { guest: 'Chị Bình', tpl: 'Nhắc trước ngày đến', detail: 'Zalo', at: hoursAgo(3), st: 'ok' },
    {
      guest: 'Mr. Kim',
      tpl: 'Xác nhận đặt phòng',
      detail: 'Số nước ngoài không dùng Zalo → đã gửi SMS',
      at: hoursAgo(5),
      st: 'sms',
    },
    {
      guest: 'Anh Minh',
      tpl: 'Xác nhận đặt phòng',
      detail: 'Zalo không gửi được tới số này. Sửa số trong đặt phòng rồi gửi lại.',
      at: hoursAgo(27),
      st: 'fail',
    },
    { guest: 'Anh Nam', tpl: 'Nhắc trước ngày đến', detail: 'Zalo · đã xem', at: hoursAgo(72), st: 'ok' },
  ],
}))

// Written to the booking's Lịch sử and to Nhân viên và nhật ký, like every pms.store action.
export function logActivity(b: Booking, kind: ActivityKind, action: string, detail?: string) {
  usePms.setState((s) => ({
    activities: [
      ...s.activities,
      {
        id: Math.max(0, ...s.activities.map((a) => a.id)) + 1,
        place_id: s.rooms.find((r) => r.id === b.room_id)?.place_id ?? 0,
        room_id: b.room_id,
        booking_id: b.id,
        at: new Date().toISOString(),
        actor: s.user.name,
        kind,
        action,
        detail,
      },
    ],
  }))
}

export function patchBooking(id: number, p: Partial<Booking>) {
  usePms.setState((s) => ({ bookings: s.bookings.map((b) => (b.id === id ? { ...b, ...p } : b)) }))
}
