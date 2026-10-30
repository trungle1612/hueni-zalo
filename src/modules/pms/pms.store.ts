import dayjs from 'dayjs'
import { create } from 'zustand'

import { API_URL } from '@/constants/common'

// Shapes mirror hueni-api db/schema.rb. Dates are 'YYYY-MM-DD'; end_date is exclusive (checkout day is free).
// ponytail: in-memory mock data + client-side copies of the API rules, so the UI can be built first.
// Swap each action for a request() call once hueni-api exposes JSON endpoints (#1); the server stays the source of truth.

export type Role = 'owner' | 'staff'
export type Place = { id: number; slug: string; name: string; role: Role }

export type Room = {
  id: number
  place_id: number
  name: string
  max_guests: number
  price?: number
  active: boolean
  housekeeping: 'clean' | 'dirty'
  maintenance?: { reason: string; until: string } // blocked from today until `until` (exclusive, like end_date)
  floor?: number
  kind?: string // loại phòng: Phòng đôi, Phòng gia đình…
  weekend_price?: number // Friday and Saturday nights, when different
  amenities?: string[]
  note?: string // internal, staff only
  damage_note?: string // Báo hỏng / thiếu đồ, until cleared (hueni-api#166)
  updated_at?: string
}

export type Provider = 'airbnb' | 'booking' | 'agoda' | 'other'

export type PayMethod = 'cash' | 'bank' | 'card'
// amount < 0 = a refund
export type Payment = {
  id?: number
  amount: number
  method: PayMethod
  at: string
  kind?: 'payment' | 'refund'
  note?: string
  deposit?: boolean
  by?: string
}
// A service added to the bill (Phiếu tính tiền): unit price × qty.
export type Charge = { id: number; name: string; unit: string; price: number; qty: number; at: string; amount?: number }
// One guest's papers for lưu trú: only what the declaration needs, never the photo.
export type GuestDoc = {
  name: string
  kind: 'vn' | 'foreign'
  id_tail: string // last 4 digits: the full number is never shown in lists
  status: 'ready' | 'sent' | 'ok' | 'error'
  problem?: string
  at?: string
}

export type Booking = {
  id: number
  room_id: number
  start_date: string
  end_date: string
  status: 'hold' | 'confirmed' | 'cancelled'
  source: 'manual' | 'ical'
  provider?: Provider
  guest_name?: string
  guest_phone?: string
  guests?: number
  note?: string
  origin?: string // how a manual booking came in: Trực tiếp, Điện thoại / Zalo…
  price?: number // per night, fixed when the room's price changes later; else the room's price
  weekend_price?: number // Friday/Saturday nights, fixed together with `price`
  payments?: Payment[]
  charges?: Charge[]
  discount?: { amount: number; reason: string }
  group_id?: number // Đặt phòng theo đoàn: one booking per room, one contact
  pays_own?: boolean // Khách tự trả: left out of the group's bill when it is one bill
  docs?: GuestDoc[]
  checked_in_at?: string
  checked_out_at?: string
  declared_at?: string
  removed_from_feed_at?: string
  // From hueni-api: code and label on every booking; the money only on a Booking detail (GET /bookings/:id).
  code?: string
  label?: string
  cancel_reason?: string
  awaiting_deposit?: boolean
  room_total?: number
  total?: number
  paid?: number
  due?: number
  guest_flag?: string // Cần lưu ý of this booking's guest (Hồ sơ khách, hueni-api#165)
}

export type Feed = {
  id: number
  room_id: number
  provider: Provider
  host: string // only the host is ever shown: the full iCal URL embeds OTA tokens
  last_synced_at?: string
  last_ok_at?: string
  last_error?: 'gone' | 'parse' | 'fetch'
  error_message?: string // hueni-api's sentence for last_error
}

export type ActivityKind = 'booking' | 'stay' | 'room' | 'sync' | 'error'
export type Activity = {
  id: number
  place_id: number
  room_id: number
  booking_id?: number
  at: string
  actor: string
  kind: ActivityKind
  action: string
  detail?: string
  ota_cancelled_start?: string // set when the iCal sync deleted a booking (OTA cancelled it): counted by the report
}

export type RoomState = 'off' | 'leaving' | 'occupied' | 'arriving' | 'held' | 'free'
export type RoomDay = { room: Room; state: RoomState; booking?: Booking; next?: Booking }

// ---------- dates ----------

export const LATE_ARRIVAL_UNTIL = 6 // 06:00: guests arriving after midnight still count for the previous day
const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD')
export const day = (offset = 0) => fmt(dayjs().add(offset, 'day'))
export const today = () => day(0)
export const arrivalDate = () => (dayjs().hour() < LATE_ARRIVAL_UNTIL ? day(-1) : day(0))
export const addDays = (date: string, n: number) => fmt(dayjs(date).add(n, 'day'))
export const daysBetween = (from: string, to: string) => dayjs(to).diff(from, 'day')
export const fmtDate = (s: string) => dayjs(s).format('DD/MM')
export const fmtRange = (b: Pick<Booking, 'start_date' | 'end_date'>) =>
  `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
export const weekday = (s: string) => WEEKDAY[dayjs(s).day()]
export const fmtDay = (s: string) => `${weekday(s)} ${fmtDate(s)}` // T4 21/10
export const fmtTime = (iso: string) => dayjs(iso).format('DD/MM HH:mm')
export const nights = (b: Pick<Booking, 'start_date' | 'end_date'>) => daysBetween(b.start_date, b.end_date)
const isToday = (iso?: string) => !!iso && dayjs(iso).isSame(dayjs(), 'day')
const nowIso = () => new Date().toISOString()
const hoursAgo = (h: number) => dayjs().subtract(h, 'hour').toISOString()

// ---------- booking rules (copies of hueni-api Booking) ----------

export const PROVIDER_NAME: Record<Provider, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  agoda: 'Agoda',
  other: 'iCal',
}
export const sourceLabel = (b: Booking) => (b.source === 'manual' ? 'Trực tiếp' : PROVIDER_NAME[b.provider || 'other'])
export const guestLabel = (b: Booking) => b.guest_name || b.note || (b.source === 'ical' ? sourceLabel(b) : 'Khách')
export const isStaying = (b: Booking) => !!b.checked_in_at && !b.checked_out_at
const isBlocking = (b: Booking) => b.status !== 'cancelled'
export const bookingCode = (b: Pick<Booking, 'id' | 'code'>) => b.code || `DP-${String(b.id).padStart(4, '0')}`
export const money = (n: number) => `${n < 0 ? '−' : ''}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`
export const inMaintenance = (r: Room, from = today()) => !!r.maintenance && from < r.maintenance.until
// One definition for every screen: rooms that take guests tonight, and rooms that need cleaning (guest in or not).
export const isOpen = (r: Room) => r.active && !inMaintenance(r)
export const needsCleaning = (r: Room) => isOpen(r) && r.housekeeping === 'dirty'

// Money: OTA bookings are paid on the OTA; manual ones by the payments recorded here.
// ponytail: total = nights + services − discount; taxes come with the API.
export const nightPrice = (b: Booking, room?: Room) => b.price ?? room?.price ?? 0
const isWeekendNight = (date: string) => [5, 6].includes(dayjs(date).day()) // Fri, Sat
// The price of one night: Friday and Saturday use the weekend price when there is one.
export const priceOn = (b: Booking, room: Room | undefined, date: string) => {
  const weekend = b.price !== undefined ? b.weekend_price : room?.weekend_price
  return isWeekendNight(date) && weekend ? weekend : nightPrice(b, room)
}
const nightDates = (b: Pick<Booking, 'start_date' | 'end_date'>) =>
  Array.from({ length: Math.max(0, nights(b)) }, (_, i) => fmt(dayjs(b.start_date).add(i, 'day')))
// With hueni-api the server does the money: a Booking detail (it has `payments`) carries it; a list booking has
// none, so it shows no amount owed (open the booking for that).
const detail = (b: Booking) => !!API_URL && !!b.payments
export const roomTotalOf = (b: Booking, room?: Room) =>
  detail(b) ? b.room_total || 0 : nightDates(b).reduce((n, d) => n + priceOn(b, room, d), 0)
export const chargesOf = (b: Booking) => (b.charges || []).reduce((n, c) => n + c.price * c.qty, 0)
export const totalOf = (b: Booking, room?: Room) =>
  detail(b) ? b.total || 0 : roomTotalOf(b, room) + (b.source === 'ical' ? 0 : chargesOf(b) - (b.discount?.amount || 0))
export const hasWeekendPrice = (b: Booking, room?: Room) =>
  nightDates(b).some((d) => priceOn(b, room, d) !== nightPrice(b, room))
export const paidOf = (b: Booking, room?: Room) =>
  b.source === 'ical' ? totalOf(b, room) : (b.payments || []).reduce((n, p) => n + p.amount, 0)
export const dueOf = (b: Booking, room?: Room) =>
  API_URL ? b.due || 0 : b.status === 'cancelled' ? 0 : Math.max(0, totalOf(b, room) - paidOf(b, room))
// Chưa cọc: a direct booking, not checked in, nothing paid yet.
export const awaitingDeposit = (b: Booking, room?: Room) =>
  b.awaiting_deposit ?? (b.source === 'manual' && dueOf(b, room) > 0 && !paidOf(b, room))
export const PAY_METHOD: Record<PayMethod, string> = { cash: 'Tiền mặt', bank: 'Chuyển khoản', card: 'Thẻ' }
// hueni-api's room_type and amenity codes (wiki Mini-App-API, Phòng) → the labels shown and kept in the store.
export const ROOM_TYPE: Record<string, string> = {
  single: 'Phòng đơn',
  double: 'Phòng đôi',
  family: 'Phòng gia đình',
  dorm: 'Dorm',
  studio: 'Studio',
  villa: 'Villa',
}
export const AMENITY: Record<string, string> = {
  ac: 'Máy lạnh',
  window: 'Cửa sổ',
  balcony: 'Ban công',
  bathtub: 'Bồn tắm',
  kitchen: 'Bếp nhỏ',
  desk: 'Bàn làm việc',
}
export const ROOM_KINDS = Object.values(ROOM_TYPE)
export const AMENITIES = Object.values(AMENITY)
// Bookings still ahead (or in house) on a room: they block deleting it and keep their price when it changes.
export const upcomingOn = (all: Booking[], roomId: number) =>
  all
    .filter((b) => b.room_id === roomId && b.status !== 'cancelled' && !b.checked_out_at && b.end_date > today())
    .sort((a, b) => a.start_date.localeCompare(b.start_date))

// Booking#occupied_until: checked out → free from the checkout day; still in after departure → through today.
export function occupiedUntil(b: Booking) {
  if (b.checked_out_at) {
    const out = fmt(dayjs(b.checked_out_at))
    return out > b.start_date ? (out < b.end_date ? out : b.end_date) : b.start_date
  }
  if (isStaying(b) && b.end_date < today()) return day(1)
  return b.end_date
}

// Booking.occupying(from, to)
export const occupies = (b: Booking, from: string, to: string) =>
  isBlocking(b) && b.start_date < to && from < occupiedUntil(b)

export const lateDays = (b: Booking) => (b.checked_in_at ? 0 : Math.max(0, daysBetween(b.start_date, arrivalDate())))
export const overdueDays = (b: Booking) => (isStaying(b) ? Math.max(0, daysBetween(b.end_date, today())) : 0)
export const canCheckIn = (b: Booking) =>
  isBlocking(b) && !b.checked_in_at && b.start_date <= today() && arrivalDate() < b.end_date
export const canEarlyCheckIn = (b: Booking) =>
  isBlocking(b) && b.source === 'manual' && !b.checked_in_at && b.start_date > today()
export const isEditable = (b: Booking) => b.source === 'manual' && !b.checked_out_at && b.status !== 'cancelled'

// RoomDay.for: the single "room state today".
export function roomDay(room: Room, all: Booking[]): RoomDay {
  const date = today()
  const arrival = arrivalDate()
  const mine = all
    .filter(
      (b) => b.room_id === room.id && isBlocking(b) && !b.checked_out_at && (b.end_date > arrival || isStaying(b)),
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id)
  const staying = mine.find(isStaying)
  const waiting = mine.filter((b) => !b.checked_in_at && b.start_date <= date && arrival < b.end_date)
  const arriving = waiting.find((b) => b.status === 'confirmed') || waiting[0]
  const booking = staying || arriving
  const next = mine.find((b) => b !== booking && !b.checked_in_at && b.start_date >= date)
  let state: RoomState = 'free'
  if (!room.active || inMaintenance(room)) state = 'off'
  else if (staying) state = staying.end_date <= date ? 'leaving' : 'occupied'
  else if (arriving) state = arriving.status === 'confirmed' ? 'arriving' : 'held'
  return { room, state, booking, next }
}

// Booking#date_problems: a manual hold/confirmed booking can't overlap another blocking booking on its room.
export function dateProblem(
  all: Booking[],
  draft: Pick<Booking, 'room_id' | 'start_date' | 'end_date'>,
  ignoreId?: number,
) {
  if (!draft.start_date || !draft.end_date || draft.end_date <= draft.start_date)
    return 'Ngày trả phòng phải sau ngày nhận phòng (ít nhất 1 đêm)'
  const clash = all
    .filter((b) => b.id !== ignoreId && b.room_id === draft.room_id && occupies(b, draft.start_date, draft.end_date))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
  if (!clash) return null
  const night = clash.start_date > draft.start_date ? clash.start_date : draft.start_date
  return `Trùng lịch đêm ${fmtDate(night)} với ${guestLabel(clash)} (${fmtRange(clash)}). Đổi ngày hoặc huỷ đặt phòng bị trùng.`
}

export const isRoomFree = (all: Booking[], roomId: number, from: string, to: string, ignoreId?: number) =>
  !all.some((b) => b.id !== ignoreId && b.room_id === roomId && occupies(b, from, to))

// OTA bookings overlapping a manual one: shown as conflicts, never rejected.
export function conflicts(all: Booking[]) {
  const live = all.filter((b) => isBlocking(b) && !b.checked_out_at)
  return live.flatMap((ota) =>
    ota.source !== 'ical'
      ? []
      : live
          .filter(
            (m) => m.source === 'manual' && m.room_id === ota.room_id && occupies(m, ota.start_date, ota.end_date),
          )
          .map((manual) => ({ ota, manual })),
  )
}

export const FEED_ERROR: Record<NonNullable<Feed['last_error']>, string> = {
  gone: 'Link iCal không còn dùng được. Lấy link mới trên Airbnb / Booking.com rồi thêm lại kênh.',
  parse: 'Link này không đọc được thành lịch iCal (.ics). Kiểm tra lại link.',
  fetch: 'Không tải được lịch lúc này. hueni tự thử lại mỗi giờ.',
}

// Plain-language "when" so nobody has to do date arithmetic.
export function whenLabel(b: Booking) {
  const t = today()
  if (b.checked_out_at) return `Đã trả phòng ${fmtDate(occupiedUntil(b))}`
  if (isStaying(b)) {
    if (b.end_date === t) return 'Trả phòng hôm nay'
    if (b.end_date < t) return `Quá hạn ${daysBetween(b.end_date, t)} ngày`
    const left = daysBetween(t, b.end_date)
    return `Ở đến ${fmtDate(b.end_date)} · còn ${left} đêm`
  }
  const n = `${nights(b)} đêm`
  if (b.start_date === t) return `Đến hôm nay · ${n}`
  if (b.start_date < t) return `Trễ ${lateDays(b) || daysBetween(b.start_date, t)} ngày · ${n}`
  if (b.start_date === day(1)) return `Đến ngày mai · ${n}`
  return `Đến ${fmtDate(b.start_date)} · ${n}`
}

export const STATUS_LABEL: Record<Booking['status'], string> = {
  hold: 'Giữ chỗ',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã huỷ',
}

// ---------- mock data (made-up) ----------

const places: Place[] = [
  { id: 1, slug: 'nha-sen', name: 'Nhà Sen Homestay', role: 'owner' },
  { id: 2, slug: 'limdim', name: 'Limdim House', role: 'staff' },
]

const rooms: Room[] = [
  {
    id: 1,
    place_id: 1,
    name: '101',
    floor: 1,
    kind: 'Phòng đôi',
    amenities: ['Máy lạnh', 'Cửa sổ'],
    max_guests: 2,
    price: 450000,
    active: true,
    housekeeping: 'clean',
  },
  {
    id: 2,
    place_id: 1,
    name: '102',
    floor: 1,
    kind: 'Phòng đôi',
    amenities: ['Máy lạnh'],
    max_guests: 2,
    price: 450000,
    active: true,
    housekeeping: 'dirty',
  },
  {
    id: 3,
    place_id: 1,
    name: 'Garden',
    floor: 1,
    kind: 'Phòng gia đình',
    weekend_price: 850000,
    amenities: ['Máy lạnh', 'Cửa sổ', 'Bếp nhỏ'],
    note: 'Cửa ra sân vườn, hợp khách có trẻ nhỏ.',
    max_guests: 4,
    price: 700000,
    active: true,
    housekeeping: 'clean',
  },
  {
    id: 4,
    place_id: 1,
    name: 'Sen',
    floor: 2,
    kind: 'Phòng đôi',
    amenities: ['Máy lạnh', 'Ban công'],
    max_guests: 3,
    price: 600000,
    active: true,
    housekeeping: 'clean',
  },
  {
    id: 5,
    place_id: 1,
    name: 'Gác mái',
    floor: 3,
    kind: 'Phòng đôi',
    amenities: ['Cửa sổ'],
    max_guests: 2,
    price: 350000,
    active: true,
    housekeeping: 'clean',
    maintenance: { reason: 'Thay máy lạnh', until: day(3) },
  },
  {
    id: 6,
    place_id: 2,
    name: 'Limdim',
    max_guests: 4,
    price: 800000,
    active: true,
    housekeeping: 'clean',
  },
  { id: 7, place_id: 2, name: 'Mây', max_guests: 2, active: true, housekeeping: 'clean' },
]

const bookings: Booking[] = [
  // Last month, so the report has something to compare with.
  {
    id: 101,
    room_id: 1,
    start_date: day(-30),
    end_date: day(-27),
    status: 'confirmed',
    source: 'manual',
    guest_name: 'Chị Mai',
    guests: 2,
    payments: [{ amount: 1350000, method: 'cash', at: hoursAgo(648) }],
    checked_in_at: hoursAgo(720),
    checked_out_at: hoursAgo(648),
  },
  {
    id: 102,
    room_id: 3,
    start_date: day(-26),
    end_date: day(-22),
    status: 'confirmed',
    source: 'ical',
    provider: 'airbnb',
    guests: 3,
    checked_in_at: hoursAgo(624),
    checked_out_at: hoursAgo(528),
  },
  {
    id: 103,
    room_id: 2,
    start_date: day(-25),
    end_date: day(-24),
    status: 'cancelled',
    source: 'manual',
    guest_name: 'Anh Dũng',
    note: 'Không đến',
  },
  {
    id: 1,
    room_id: 1,
    start_date: day(-2),
    end_date: day(0),
    status: 'confirmed',
    source: 'manual',
    guest_name: 'Anh Nam',
    guest_phone: '0912345678',
    guests: 2,
    origin: 'Điện thoại / Zalo',
    payments: [{ amount: 300000, method: 'cash', at: hoursAgo(120), deposit: true }],
    checked_in_at: hoursAgo(48),
    declared_at: hoursAgo(47),
  },
  { id: 2, room_id: 1, start_date: day(2), end_date: day(5), status: 'confirmed', source: 'ical', provider: 'airbnb' },
  {
    id: 3,
    room_id: 2,
    start_date: day(-1),
    end_date: day(2),
    status: 'confirmed',
    source: 'ical',
    provider: 'booking',
    guests: 2,
    checked_in_at: hoursAgo(20),
  },
  {
    id: 4,
    room_id: 3,
    start_date: day(0),
    end_date: day(3),
    status: 'confirmed',
    source: 'manual',
    guest_name: 'Chị Bình',
    guest_phone: '0987654321',
    guests: 2,
    payments: [{ amount: 500000, method: 'bank', at: hoursAgo(50), deposit: true }],
    note: 'Đến khoảng 21h',
  },
  {
    id: 5,
    room_id: 4,
    start_date: day(1),
    end_date: day(2),
    status: 'hold',
    source: 'manual',
    guest_name: 'Anh Minh',
    guest_phone: '0901234567',
  },
  {
    id: 6,
    room_id: 4,
    start_date: day(4),
    end_date: day(8),
    status: 'confirmed',
    source: 'manual',
    guest_name: 'Chị Hoa',
    guests: 3,
    guest_phone: '0905111222',
    payments: [{ amount: 1000000, method: 'bank', at: hoursAgo(26), deposit: true }],
  },
  { id: 7, room_id: 4, start_date: day(5), end_date: day(7), status: 'confirmed', source: 'ical', provider: 'airbnb' },
  {
    id: 8,
    room_id: 3,
    start_date: day(6),
    end_date: day(9),
    status: 'cancelled',
    source: 'manual',
    guest_name: 'Võ Thanh',
  },
  {
    id: 9,
    room_id: 6,
    start_date: day(-4),
    end_date: day(-1),
    status: 'confirmed',
    source: 'manual',
    guest_name: 'Mr. Kim',
    guest_phone: '+82 10-1234-5678',
    guests: 2,
    payments: [{ amount: 2400000, method: 'card', at: hoursAgo(96) }],
    checked_in_at: hoursAgo(96),
  },
  {
    id: 10,
    room_id: 7,
    start_date: day(-1),
    end_date: day(1),
    status: 'confirmed',
    source: 'manual',
    guest_name: 'Em Lan',
    guests: 1,
    price: 300000,
  },
  {
    id: 11,
    room_id: 3,
    start_date: day(-6),
    end_date: day(-3),
    status: 'confirmed',
    source: 'manual',
    guest_name: 'Cô Thu',
    guests: 2,
    payments: [{ amount: 2100000, method: 'cash', at: hoursAgo(72) }],
    checked_in_at: hoursAgo(144),
    checked_out_at: hoursAgo(72),
  },
  {
    id: 12,
    room_id: 7,
    start_date: day(2),
    end_date: day(4),
    status: 'hold',
    source: 'manual',
    guest_name: 'Anh Tuấn',
  },
]

const feeds: Feed[] = [
  {
    id: 1,
    room_id: 1,
    provider: 'airbnb',
    host: 'www.airbnb.com',
    last_synced_at: hoursAgo(0.1),
    last_ok_at: hoursAgo(0.1),
  },
  {
    id: 2,
    room_id: 2,
    provider: 'booking',
    host: 'admin.booking.com',
    last_synced_at: hoursAgo(0.5),
    last_ok_at: hoursAgo(0.5),
  },
  {
    id: 3,
    room_id: 4,
    provider: 'airbnb',
    host: 'www.airbnb.com',
    last_synced_at: hoursAgo(2),
    last_ok_at: hoursAgo(30),
    last_error: 'gone',
  },
  { id: 4, room_id: 6, provider: 'booking', host: 'admin.booking.com' },
]

const activities: Activity[] = [
  {
    id: 90,
    place_id: 1,
    room_id: 2,
    at: hoursAgo(100),
    actor: 'Booking.com',
    kind: 'sync',
    action: 'Xoá đặt phòng',
    detail: `${fmtDate(day(-3))}–${fmtDate(day(-1))}`,
    ota_cancelled_start: day(-3),
  },
  {
    id: 1,
    place_id: 1,
    room_id: 3,
    booking_id: 11,
    at: hoursAgo(144),
    actor: 'Chị Hoa',
    kind: 'stay',
    action: 'Nhận phòng',
    detail: 'Cô Thu',
  },
  {
    id: 2,
    place_id: 1,
    room_id: 3,
    booking_id: 11,
    at: hoursAgo(72),
    actor: 'Em Hằng',
    kind: 'stay',
    action: 'Trả phòng',
    detail: 'Cô Thu',
  },
  {
    id: 3,
    place_id: 1,
    room_id: 1,
    booking_id: 1,
    at: hoursAgo(48),
    actor: 'Em Hằng',
    kind: 'stay',
    action: 'Nhận phòng',
    detail: 'Anh Nam',
  },
  {
    id: 4,
    place_id: 1,
    room_id: 4,
    at: hoursAgo(30),
    actor: 'Airbnb',
    kind: 'error',
    action: 'Đồng bộ lỗi',
    detail: 'HTTP 404',
  },
  {
    id: 5,
    place_id: 1,
    room_id: 4,
    booking_id: 6,
    at: hoursAgo(26),
    actor: 'Chị Hoa',
    kind: 'booking',
    action: 'Đặt phòng',
    detail: `Chị Hoa ${fmtRange(bookings[5])}`,
  },
  {
    id: 6,
    place_id: 1,
    room_id: 2,
    booking_id: 3,
    at: hoursAgo(20),
    actor: 'Em Hằng',
    kind: 'stay',
    action: 'Nhận phòng',
    detail: `Khách ${fmtRange(bookings[2])}`,
  },
  {
    id: 7,
    place_id: 1,
    room_id: 1,
    booking_id: 2,
    at: hoursAgo(6),
    actor: 'Airbnb',
    kind: 'sync',
    action: 'Đặt phòng',
    detail: fmtRange(bookings[1]),
  },
  {
    id: 8,
    place_id: 1,
    room_id: 4,
    booking_id: 5,
    at: hoursAgo(3),
    actor: 'Chị Hoa',
    kind: 'booking',
    action: 'Giữ chỗ',
    detail: `Anh Minh ${fmtRange(bookings[4])}`,
  },
]

// ---------- store ----------

type Result = string | void // error message; nothing = ok
type Draft = Omit<Booking, 'id' | 'source' | 'status'> & { status: 'hold' | 'confirmed' }
export type RoomDraft = Pick<
  Room,
  'place_id' | 'name' | 'floor' | 'kind' | 'max_guests' | 'price' | 'weekend_price' | 'amenities' | 'active' | 'note'
>

type Snapshot = Pick<State, 'bookings' | 'rooms' | 'activities'>

type State = {
  user: Session['user']
  token: string // hueni-api bearer; '' in mock mode
  signedIn: boolean
  recent: number[] // booking ids opened lately, newest first (Tìm đặt phòng)
  places: Place[]
  rooms: Room[]
  bookings: Booking[]
  feeds: Feed[]
  activities: Activity[]
  currentSlug: string
  actions: {
    signIn: (session?: Session) => void
    signOut: () => void
    setPlace: (slug: string) => void
    opened: (id: number) => void
    snapshot: () => Snapshot
    restore: (snap: Snapshot) => void
    checkIn: (id: number, guests?: number) => Result
    earlyCheckIn: (id: number) => Result
    checkOut: (id: number) => Result
    undoCheckIn: (id: number) => Result
    undoCheckOut: (id: number) => Result
    cancel: (id: number, reason: string) => Result
    uncancel: (id: number) => Result
    confirm: (id: number) => Result
    pay: (id: number, amount: number, method: PayMethod) => Result
    declare: (id: number) => Result
    move: (id: number, roomId: number) => Result
    clean: (roomId: number) => Result
    setRoomStatus: (roomId: number, status: 'ready' | 'dirty' | 'off', maintenance?: Room['maintenance']) => Result
    create: (draft: Draft) => number | string
    update: (id: number, draft: Draft) => Result
    saveRoom: (draft: RoomDraft, id?: number) => number | string
    deleteRoom: (id: number) => Result
    sync: (feedId: number) => Result
  }
}

// POST /api/v1/session's answer; without VITE_API_URL a mock one over the mock places.
export type Session = { token: string; expires_at?: string; user: { id?: number; name: string }; places: Place[] }
const MOCK_SESSION: Session = { token: '', user: { name: 'Chị Hoa' }, places }

const SESSION = 'pms.session'
const remembered = (): Session | undefined => {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION) || 'null') as Session | null
    if (s?.places.length && !(s.expires_at && new Date(s.expires_at) <= new Date())) return s
  } catch {
    // nothing stored, or private mode
  }
}
const saved = remembered()

export const usePms = create<State>((set, get) => {
  const booking = (id: number) => get().bookings.find((b) => b.id === id)!
  const room = (id: number) => get().rooms.find((r) => r.id === id)!
  const patch = (id: number, p: Partial<Booking>) =>
    set((s) => ({ bookings: s.bookings.map((b) => (b.id === id ? { ...b, ...p } : b)) }))
  const patchRoom = (id: number, p: Partial<Room>) =>
    set((s) => ({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...p } : r)) }))
  const log = (roomId: number, kind: ActivityKind, action: string, detail?: string, bookingId?: number) =>
    set((s) => ({
      activities: [
        ...s.activities,
        {
          id: Math.max(0, ...s.activities.map((a) => a.id)) + 1,
          place_id: room(roomId).place_id,
          room_id: roomId,
          booking_id: bookingId,
          at: nowIso(),
          actor: s.user.name,
          kind,
          action,
          detail,
        },
      ],
    }))
  const stayLog = (b: Booking, action: string) =>
    log(b.room_id, 'stay', action, b.guest_name || `Khách ${fmtRange(b)}`, b.id)

  return {
    user: (saved || MOCK_SESSION).user,
    token: saved?.token || '',
    signedIn: !!saved,
    recent: [],
    places: (saved || MOCK_SESSION).places,
    // With hueni-api, rooms and bookings come from remote.ts load(); feeds and activities stay mock until #37, #38.
    rooms: API_URL ? [] : rooms,
    bookings: API_URL ? [] : bookings,
    feeds: API_URL ? [] : feeds,
    activities: API_URL ? [] : activities,
    currentSlug: (saved || MOCK_SESSION).places[0].slug,
    actions: {
      signIn: (session = MOCK_SESSION) => {
        try {
          localStorage.setItem(SESSION, JSON.stringify(session))
        } catch {
          // private mode: signed in for this session only
        }
        set((s) => ({
          signedIn: true,
          token: session.token,
          user: session.user,
          places: session.places,
          // Keep the chosen homestay across a quiet re-login or /me refresh.
          currentSlug: session.places.some((p) => p.slug === s.currentSlug) ? s.currentSlug : session.places[0].slug,
        }))
      },
      signOut: () => {
        try {
          localStorage.removeItem(SESSION)
        } catch {
          // nothing stored
        }
        set({ signedIn: false, token: '' })
      },
      setPlace: (slug) => set({ currentSlug: slug }),
      opened: (id) => set((s) => ({ recent: [id, ...s.recent.filter((x) => x !== id)].slice(0, 5) })),

      // Hoàn tác puts everything back as it was, history included.
      // ponytail: mock-only; with the API each undo becomes its own request.
      snapshot: () => {
        const { bookings, rooms, activities } = get()
        return { bookings, rooms, activities }
      },
      restore: (snap) => set(snap),

      checkIn: (id, guests) => {
        const b = booking(id)
        if (!canCheckIn(b)) return 'Không nhận phòng được đặt phòng này'
        if (get().bookings.some((x) => x.id !== id && x.room_id === b.room_id && isStaying(x)))
          return 'Phòng đang có khách chưa trả phòng'
        if (!b.guests && !guests) return 'Nhập số khách'
        patch(id, { checked_in_at: nowIso(), status: 'confirmed', guests: b.guests || guests })
        stayLog(b, 'Nhận phòng')
      },

      earlyCheckIn: (id) => {
        const b = booking(id)
        if (!canEarlyCheckIn(b)) return 'Không nhận phòng sớm được đặt phòng này'
        if (!isRoomFree(get().bookings, b.room_id, today(), b.start_date, id)) return 'Phòng chưa trống từ hôm nay'
        patch(id, { start_date: today(), checked_in_at: nowIso(), status: 'confirmed' })
        stayLog(b, 'Nhận phòng sớm')
      },

      checkOut: (id) => {
        const b = booking(id)
        if (!isStaying(b)) return 'Khách chưa nhận phòng'
        patch(id, { checked_out_at: nowIso() })
        patchRoom(b.room_id, { housekeeping: 'dirty' })
        stayLog(b, 'Trả phòng')
      },

      // Owner-only, same day: the API's undo, beyond the 6-second Hoàn tác.
      undoCheckIn: (id) => {
        const b = booking(id)
        if (!isStaying(b) || !isToday(b.checked_in_at)) return 'Chỉ hoàn tác được trong ngày'
        patch(id, { checked_in_at: undefined })
        stayLog(b, 'Hoàn tác nhận phòng')
      },

      undoCheckOut: (id) => {
        const b = booking(id)
        if (!isToday(b.checked_out_at)) return 'Chỉ hoàn tác được trong ngày'
        const others = get().bookings.filter((x) => x.id !== id && x.room_id === b.room_id)
        if (others.some(isStaying)) return 'Phòng đang có khách khác'
        if (b.end_date > today() && others.some((x) => occupies(x, today(), b.end_date)))
          return 'Các đêm còn lại đã có khách khác'
        patch(id, { checked_out_at: undefined })
        stayLog(b, 'Hoàn tác trả phòng')
      },

      cancel: (id, reason) => {
        const b = booking(id)
        if (b.checked_in_at) return 'Khách đã nhận phòng, không huỷ được'
        patch(id, { status: 'cancelled' })
        log(b.room_id, 'booking', 'Huỷ', `${guestLabel(b)} ${fmtRange(b)} · ${reason}`, id)
      },

      uncancel: (id) => {
        const b = booking(id)
        if (b.status !== 'cancelled' || b.source !== 'manual') return 'Không khôi phục được đặt phòng này'
        const problem = dateProblem(get().bookings, b, id)
        if (problem) return problem
        patch(id, { status: 'confirmed' })
        log(b.room_id, 'booking', 'Khôi phục', `${guestLabel(b)} ${fmtRange(b)}`, id)
      },

      pay: (id, amount, method) => {
        const b = booking(id)
        if (!amount) return 'Nhập số tiền khác 0.'
        patch(id, { payments: [...(b.payments || []), { amount, method, at: nowIso() }] })
        log(
          b.room_id,
          'booking',
          amount > 0 ? 'Thu tiền' : 'Hoàn tiền',
          `${money(Math.abs(amount))}, ${PAY_METHOD[method].toLowerCase()}`,
          id,
        )
      },

      confirm: (id) => {
        const b = booking(id)
        patch(id, { status: 'confirmed' })
        log(b.room_id, 'booking', 'Xác nhận', `${guestLabel(b)} ${fmtRange(b)}`, id)
      },

      declare: (id) => {
        const b = booking(id)
        patch(id, { declared_at: nowIso() })
        stayLog(b, 'Khai báo lưu trú')
      },

      move: (id, roomId) => {
        const b = booking(id)
        const target = room(roomId)
        if (!isStaying(b) || b.source !== 'manual') return 'Chỉ đổi phòng cho khách đang ở, đặt phòng nhập tay'
        if (!isRoomFree(get().bookings, roomId, today(), occupiedUntil(b), id)) return 'Phòng này không trống'
        patch(id, { room_id: roomId })
        patchRoom(b.room_id, { housekeeping: 'dirty' })
        log(roomId, 'stay', 'Đổi phòng', `${guestLabel(b)}: ${room(b.room_id).name} → ${target.name}`, id)
      },

      clean: (roomId) => {
        patchRoom(roomId, { housekeeping: 'clean' })
        log(roomId, 'room', 'Dọn xong')
      },

      setRoomStatus: (roomId, status, maintenance) => {
        if (get().bookings.some((b) => b.room_id === roomId && isStaying(b)))
          return 'Phòng đang có khách. Đổi tình trạng được sau khi trả phòng.'
        if (status === 'off' && !maintenance?.reason.trim()) return 'Nhập lý do để nhân viên khác biết.'
        patchRoom(roomId, {
          housekeeping: status === 'dirty' ? 'dirty' : 'clean',
          maintenance: status === 'off' ? maintenance : undefined,
        })
        log(roomId, 'room', { ready: 'Sẵn sàng', dirty: 'Cần dọn', off: 'Bảo trì' }[status], maintenance?.reason)
      },

      create: (draft) => {
        const problem = dateProblem(get().bookings, draft)
        if (problem) return problem
        const id = Math.max(0, ...get().bookings.map((x) => x.id)) + 1
        set((s) => ({ bookings: [...s.bookings, { ...draft, id, source: 'manual' }] }))
        log(
          draft.room_id,
          'booking',
          draft.status === 'hold' ? 'Giữ chỗ' : 'Đặt phòng',
          `${guestLabel(booking(id))} ${fmtRange(draft)}`,
          id,
        )
        return id
      },

      update: (id, draft) => {
        const b = booking(id)
        if (!isEditable(b)) return 'Đặt phòng này không sửa được nữa'
        const problem = dateProblem(get().bookings, draft, id)
        if (problem) return problem
        patch(id, draft)
        log(draft.room_id, 'booking', 'Sửa đặt phòng', guestLabel(booking(id)), id)
      },

      // Owner-only setup (a copy of the web admin's rules until the API takes over).
      saveRoom: (draft, id) => {
        const name = draft.name.trim()
        if (!name) return 'Nhập số phòng.'
        const taken = get().rooms.some(
          (r) => r.id !== id && r.place_id === draft.place_id && r.name.toLowerCase() === name.toLowerCase(),
        )
        if (taken) return `Phòng ${name} đã có. Chọn số khác.`
        if (!draft.price || draft.price <= 0) return 'Nhập giá mỗi đêm lớn hơn 0.'
        if (id === undefined) {
          const newId = Math.max(0, ...get().rooms.map((r) => r.id)) + 1
          set((s) => ({
            rooms: [...s.rooms, { ...draft, name, id: newId, housekeeping: 'clean', updated_at: nowIso() }],
          }))
          log(newId, 'room', 'Thêm phòng', name)
          return newId
        }
        const old = room(id)
        // A new price is for bookings made after saving: the ones ahead keep what they were quoted.
        if (old.price !== draft.price || old.weekend_price !== draft.weekend_price) {
          const keep = new Set(
            upcomingOn(get().bookings, id)
              .filter((b) => b.price === undefined)
              .map((b) => b.id),
          )
          set((s) => ({
            bookings: s.bookings.map((b) =>
              keep.has(b.id) ? { ...b, price: old.price, weekend_price: old.weekend_price } : b,
            ),
          }))
        }
        patchRoom(id, { ...draft, name, updated_at: nowIso() })
        log(id, 'room', 'Sửa phòng', name)
        return id
      },

      deleteRoom: (id) => {
        const ahead = upcomingOn(get().bookings, id)
        if (ahead.length) return `Phòng còn ${ahead.length} đặt phòng sắp tới. Chuyển hoặc huỷ trước khi xoá.`
        log(id, 'room', 'Xoá phòng', room(id).name)
        set((s) => ({ rooms: s.rooms.filter((r) => r.id !== id) }))
      },

      sync: (feedId) => {
        const feed = get().feeds.find((f) => f.id === feedId)!
        if (feed.last_synced_at && dayjs().diff(feed.last_synced_at, 'second') < 60)
          return 'Vừa đồng bộ, thử lại sau 1 phút.'
        const ok = feed.last_error !== 'gone' // mock: an expired link keeps failing
        set((s) => ({
          feeds: s.feeds.map((f) =>
            f.id === feedId
              ? { ...f, last_synced_at: nowIso(), ...(ok ? { last_ok_at: nowIso(), last_error: undefined } : {}) }
              : f,
          ),
        }))
        if (!ok) return `Đồng bộ lỗi. ${FEED_ERROR.gone}`
      },
    },
  }
})

// ---------- selectors ----------

export const can = (place: Place | undefined, action: 'manage' | 'operate') =>
  !!place && (action === 'operate' || place.role === 'owner')

export function usePlace(slug?: string) {
  const { places, currentSlug } = usePms()
  return places.find((p) => p.slug === (slug || currentSlug)) || places[0]
}

export function usePlaceOf(roomId?: number) {
  const { places, rooms } = usePms()
  const room = rooms.find((r) => r.id === roomId)
  return places.find((p) => p.id === room?.place_id)
}

export const placeRooms = (rooms: Room[], placeId: number) =>
  rooms.filter((r) => r.place_id === placeId).sort((a, b) => Number(b.active) - Number(a.active))

export const failingFeeds = (feeds: Feed[], rooms: Room[], placeId: number) =>
  feeds.filter((f) => f.last_error && rooms.find((r) => r.id === f.room_id)?.place_id === placeId).length
