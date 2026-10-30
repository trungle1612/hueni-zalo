import dayjs from 'dayjs'
import { create } from 'zustand'

import { day, PayMethod, Perm, Role } from './pms.store'

// Owner setup mock for `vite dev`: seasons, surcharges, rules (#23), staff and refund requests (#28) are the
// server's with API_URL (see remote.ts). The owner's audit trail is still mock only.
// ponytail: in-memory mock like pms.store; each piece becomes an endpoint when the API grows one.

export type Season = { id: number; name: string; from: string; to: string; pct: number } // `to` inclusive
export type Policy = 'flex' | 'mid' | 'strict'
export type Surcharge = { id: number; name: string; price: number; unit?: string } // price 0 = Miễn phí

// hueni-api Member: id is the membership's. invited = has not linked Zalo yet.
export type Staff = {
  id: number
  user_id: number
  name: string
  phone: string
  role: Role
  permissions: Perm[]
  locked: boolean
  invited: boolean
  last_active_at?: string
}
// Chờ duyệt: a refund asked by staff without the refund right.
export type RefundRequest = {
  id: number
  amount: number
  payment_method: PayMethod
  note?: string
  at: string
  by?: string
  booking: { id: number; code: string; label: string; room_name: string; paid: number }
}

export type AuditKind = 'money' | 'cancel' | 'price' | 'other'
export type AuditEntry = {
  id: number
  k: AuditKind
  action: string
  before?: string
  after?: string
  note?: string
  who: string
  at: string
}

export const ROLE_NAME: Record<Role, string> = { owner: 'Chủ cơ sở', staff: 'Nhân viên' }
export const PERMS: [Perm, string, string][] = [
  ['discount', 'Giảm giá đến 10%', 'Cao hơn cần chủ cơ sở'],
  ['refund', 'Hoàn tiền không cần duyệt', 'Không có: gửi yêu cầu để chủ duyệt'],
  ['report', 'Xem báo cáo doanh thu', ''],
]
export const POLICY: Record<Policy, [string, string]> = {
  flex: ['Linh hoạt', 'Huỷ miễn phí trước 24 giờ. Sau đó mất cọc.'],
  mid: ['Vừa phải', 'Huỷ miễn phí trước 3 ngày. Sau đó mất cọc. Không đến: tính 1 đêm.'],
  strict: ['Không hoàn', 'Không hoàn cọc dù huỷ lúc nào. Nên kèm giá thấp hơn.'],
}
// Highest season markup covering a date (overlapping seasons take the higher one). For the Xem thử giá
// preview only: bookings are priced by hueni-api (#163), which keeps each night's % from when it was booked.
export const seasonOn = (seasons: Season[], date: string) =>
  seasons.filter((s) => s.from <= date && date <= s.to).sort((a, b) => b.pct - a.pct)[0]

const year = dayjs().year() + 1
const ago = (h: number) => dayjs().subtract(h, 'hour').toISOString()

type State = {
  seasons: Season[]
  surcharges: Surcharge[]
  longStay: boolean
  policy: Policy
  staff: Staff[]
  audit: AuditEntry[]
  refundRequests: RefundRequest[]
}

export const useSetup = create<State>(() => ({
  seasons: [
    { id: 1, name: 'Tết Nguyên đán', from: `${year}-02-04`, to: `${year}-02-12`, pct: 50 },
    { id: 2, name: 'Lễ 30/4 – 1/5', from: `${year}-04-29`, to: `${year}-05-03`, pct: 30 },
    { id: 3, name: 'Mùa hè', from: `${year}-06-01`, to: `${year}-08-31`, pct: 15 },
  ],
  surcharges: [
    { id: 1, name: 'Người lớn thêm', price: 150000, unit: 'đêm' },
    { id: 2, name: 'Trẻ 6 – 11 tuổi', price: 75000, unit: 'đêm' },
    { id: 3, name: 'Trẻ dưới 6 tuổi', price: 0, unit: 'đêm' },
  ],
  longStay: true,
  policy: 'mid',
  staff: [
    {
      id: 1,
      user_id: 1,
      name: 'Chị Hoa',
      phone: '0903111222',
      role: 'owner',
      permissions: ['discount', 'refund', 'report'],
      locked: false,
      invited: false,
      last_active_at: ago(0),
    },
    {
      id: 2,
      user_id: 2,
      name: 'Em Hằng',
      phone: '0912448210',
      role: 'staff',
      permissions: ['discount'],
      locked: false,
      invited: false,
      last_active_at: ago(1),
    },
    {
      id: 3,
      user_id: 3,
      name: 'Anh Tùng',
      phone: '0935222333',
      role: 'staff',
      permissions: [],
      locked: false,
      invited: false,
      last_active_at: ago(15),
    },
    {
      id: 4,
      user_id: 4,
      name: 'Chị Sáu',
      phone: '0978444555',
      role: 'staff',
      permissions: [],
      locked: false,
      invited: true,
    },
  ],
  audit: [
    {
      id: 1,
      k: 'money',
      action: 'Giảm giá đặt phòng của Chị Bình',
      before: '0đ',
      after: '−90.000đ',
      note: 'Lý do: khách quen lần thứ 4',
      who: 'Em Hằng',
      at: ago(20),
    },
    {
      id: 2,
      k: 'money',
      action: 'Chốt ca tối',
      before: 'Dự kiến 3.250.000đ',
      after: 'Đếm 3.200.000đ',
      note: 'Lệch −50.000đ · thối nhầm khách',
      who: 'Anh Tùng',
      at: ago(40),
    },
    { id: 3, k: 'other', action: 'Xem số CCCD · Chị Bình', note: 'Từ hồ sơ khách', who: 'Em Hằng', at: ago(52) },
  ],
  refundRequests: [
    {
      id: 1,
      amount: 200000,
      payment_method: 'bank',
      note: 'Khách đổi kế hoạch, báo trước 3 ngày',
      at: ago(2),
      by: 'Anh Tùng',
      booking: {
        id: 0,
        code: 'HN-0001',
        label: `Anh Dũng · ${dayjs(day(2)).format('DD/MM')}`,
        room_name: '102',
        paid: 200000,
      },
    },
  ],
}))

export const audit = (e: Omit<AuditEntry, 'id' | 'at'>) =>
  useSetup.setState((s) => ({
    audit: [...s.audit, { ...e, id: Math.max(0, ...s.audit.map((a) => a.id)) + 1, at: new Date().toISOString() }],
  }))
