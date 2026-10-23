import dayjs from 'dayjs'
import { create } from 'zustand'

import { day } from './pms.store'

// Owner setup that hueni-api doesn't model yet: seasons, rules, staff, the owner's audit trail.
// ponytail: in-memory mock like pms.store; each piece becomes an endpoint when the API grows one.

export type Season = { id: number; name: string; from: string; to: string; pct: number } // `to` inclusive
export type Policy = 'flex' | 'mid' | 'strict'

// ponytail: PRODUCT roles are owner/staff; Quản lý and Buồng phòng are design mocks until hueni-api has them.
export type StaffRole = 'owner' | 'mgr' | 'fd' | 'hk'
export type Perm = 'disc' | 'refund' | 'report' | 'rate'
export type Staff = {
  id: number
  name: string
  phone: string
  role: StaffRole
  sub: string
  perms: Partial<Record<Perm, boolean>>
  invited?: boolean
  locked?: boolean
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

export const ROLE_NAME: Record<StaffRole, string> = {
  owner: 'Chủ cơ sở',
  mgr: 'Quản lý',
  fd: 'Lễ tân',
  hk: 'Buồng phòng',
}
export const PERMS: [Perm, string, string][] = [
  ['disc', 'Giảm giá đến 10%', 'Cao hơn cần chủ duyệt'],
  ['refund', 'Hoàn cọc không cần duyệt', ''],
  ['report', 'Xem báo cáo doanh thu', ''],
  ['rate', 'Sửa giá và mùa', ''],
]
export const POLICY: Record<Policy, [string, string]> = {
  flex: ['Linh hoạt', 'Huỷ miễn phí trước 24 giờ. Sau đó mất cọc.'],
  mid: ['Vừa phải', 'Huỷ miễn phí trước 3 ngày. Sau đó mất cọc. Không đến: tính 1 đêm.'],
  strict: ['Không hoàn', 'Không hoàn cọc dù huỷ lúc nào. Nên kèm giá thấp hơn.'],
}
export const SURCHARGES: [string, string][] = [
  ['Người lớn thêm', '150.000đ / đêm'],
  ['Trẻ 6 – 11 tuổi', '75.000đ / đêm'],
  ['Trẻ dưới 6 tuổi', 'Miễn phí'],
]
export const SERVICES: [string, string][] = [
  ['Nước suối', '15.000đ / chai'],
  ['Giặt ủi', '30.000đ / kg'],
  ['Thuê xe máy', '150.000đ / ngày'],
  ['Nhận phòng sớm trước 12:00', '100.000đ'],
  ['Trả phòng muộn đến 15:00', '150.000đ'],
]

// Highest season markup covering a date (overlapping seasons take the higher one).
export const seasonOn = (seasons: Season[], date: string) =>
  seasons.filter((s) => s.from <= date && date <= s.to).sort((a, b) => b.pct - a.pct)[0]

const year = dayjs().year() + 1
const ago = (h: number) => dayjs().subtract(h, 'hour').toISOString()

type State = {
  seasons: Season[]
  longStay: boolean
  policy: Policy
  staff: Staff[]
  audit: AuditEntry[]
  refundRequest?: { booking: string; amount: number; who: string; text: string }
}

export const useSetup = create<State>(() => ({
  seasons: [
    { id: 1, name: 'Tết Nguyên đán', from: `${year}-02-04`, to: `${year}-02-12`, pct: 50 },
    { id: 2, name: 'Lễ 30/4 – 1/5', from: `${year}-04-29`, to: `${year}-05-03`, pct: 30 },
    { id: 3, name: 'Mùa hè', from: `${year}-06-01`, to: `${year}-08-31`, pct: 15 },
  ],
  longStay: true,
  policy: 'mid',
  staff: [
    { id: 1, name: 'Chị Hoa', phone: '0903111222', role: 'owner', sub: 'Chủ cơ sở · bạn', perms: {} },
    {
      id: 2,
      name: 'Em Hằng',
      phone: '0912448210',
      role: 'fd',
      sub: 'Ca sáng · hoạt động 5 phút trước',
      perms: { disc: true },
    },
    { id: 3, name: 'Anh Tùng', phone: '0935222333', role: 'fd', sub: 'Ca tối · hoạt động hôm qua 23:10', perms: {} },
    { id: 4, name: 'Chị Sáu', phone: '0978444555', role: 'hk', sub: 'Chỉ thấy việc dọn phòng', perms: {} },
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
  refundRequest: {
    booking: 'Anh Dũng',
    amount: 200000,
    who: 'Anh Tùng',
    text: `Anh Tùng huỷ đặt phòng của Anh Dũng (${dayjs(day(2)).format('DD/MM')}). Lý do: khách đổi kế hoạch, báo trước 3 ngày. Đúng chính sách huỷ miễn phí.`,
  },
}))

export const audit = (e: Omit<AuditEntry, 'id' | 'at'>) =>
  useSetup.setState((s) => ({
    audit: [...s.audit, { ...e, id: Math.max(0, ...s.audit.map((a) => a.id)) + 1, at: new Date().toISOString() }],
  }))
