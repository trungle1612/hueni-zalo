import dayjs from 'dayjs'
import { create } from 'zustand'

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
}

export type Provider = 'airbnb' | 'booking' | 'other'

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
  checked_in_at?: string
  checked_out_at?: string
  declared_at?: string
  removed_from_feed_at?: string
}

export type Feed = {
  id: number
  room_id: number
  provider: Provider
  host: string // only the host is ever shown: the full iCal URL embeds OTA tokens
  last_synced_at?: string
  last_ok_at?: string
  last_error?: 'gone' | 'parse' | 'fetch'
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
  `${fmtDate(b.start_date)}–${fmtDate(b.end_date)}`
export const nights = (b: Pick<Booking, 'start_date' | 'end_date'>) => daysBetween(b.start_date, b.end_date)
const isToday = (iso?: string) => !!iso && dayjs(iso).isSame(dayjs(), 'day')
const nowIso = () => new Date().toISOString()
const hoursAgo = (h: number) => dayjs().subtract(h, 'hour').toISOString()

// ---------- booking rules (copies of hueni-api Booking) ----------

export const PROVIDER_NAME: Record<Provider, string> = { airbnb: 'Airbnb', booking: 'Booking.com', other: 'iCal' }
export const sourceLabel = (b: Booking) => (b.source === 'manual' ? 'Trực tiếp' : PROVIDER_NAME[b.provider || 'other'])
export const guestLabel = (b: Booking) => b.guest_name || b.note || (b.source === 'ical' ? sourceLabel(b) : 'Khách')
export const isStaying = (b: Booking) => !!b.checked_in_at && !b.checked_out_at
const isBlocking = (b: Booking) => b.status !== 'cancelled'

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
  if (!room.active) state = 'off'
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

// Colour meaning (one job per hue): green free, blue guest in, violet expected, amber hold,
// stone needs cleaning / off, red only for overdue, late, conflict and errors.
export const STATE_STYLE: Record<RoomState, { label: string; badge: string; dot: string }> = {
  free: { label: 'Trống', badge: 'bg-emerald-100 text-emerald-900', dot: 'bg-emerald-600' },
  occupied: { label: 'Đang có khách', badge: 'bg-sky-100 text-sky-900', dot: 'bg-sky-600' },
  leaving: { label: 'Trả phòng hôm nay', badge: 'bg-sky-100 text-sky-900', dot: 'bg-sky-600' },
  arriving: { label: 'Chờ khách', badge: 'bg-violet-100 text-violet-900', dot: 'bg-violet-600' },
  held: { label: 'Giữ chỗ', badge: 'bg-amber-100 text-amber-900', dot: 'bg-amber-500' },
  off: { label: 'Tạm ngưng', badge: 'bg-stone-200 text-stone-800', dot: 'bg-stone-400' },
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
  { id: 1, place_id: 1, name: '101', max_guests: 2, price: 450000, active: true, housekeeping: 'clean' },
  { id: 2, place_id: 1, name: '102', max_guests: 2, price: 450000, active: true, housekeeping: 'dirty' },
  { id: 3, place_id: 1, name: 'Garden', max_guests: 4, price: 700000, active: true, housekeeping: 'clean' },
  { id: 4, place_id: 1, name: 'Sen', max_guests: 3, price: 600000, active: true, housekeeping: 'clean' },
  { id: 5, place_id: 1, name: 'Gác mái', max_guests: 2, price: 350000, active: false, housekeeping: 'clean' },
  { id: 6, place_id: 2, name: 'Limdim', max_guests: 4, price: 800000, active: true, housekeeping: 'clean' },
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

type State = {
  user: { name: string }
  places: Place[]
  rooms: Room[]
  bookings: Booking[]
  feeds: Feed[]
  activities: Activity[]
  currentSlug: string
  actions: {
    setPlace: (slug: string) => void
    checkIn: (id: number, guests?: number) => Result
    earlyCheckIn: (id: number) => Result
    checkOut: (id: number) => Result
    undoCheckIn: (id: number) => Result
    undoCheckOut: (id: number) => Result
    noShow: (id: number) => Result
    cancel: (id: number) => Result
    confirm: (id: number) => Result
    declare: (id: number) => Result
    undeclare: (id: number) => Result
    move: (id: number, roomId: number) => Result
    clean: (roomId: number) => Result
    unclean: (roomId: number) => Result
    create: (draft: Draft) => number | string
    update: (id: number, draft: Draft) => Result
    sync: (feedId: number) => Result
  }
}

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
          id: s.activities.length + 1,
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
    user: { name: 'Chị Hoa' },
    places,
    rooms,
    bookings,
    feeds,
    activities,
    currentSlug: places[0].slug,
    actions: {
      setPlace: (slug) => set({ currentSlug: slug }),

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

      noShow: (id) => {
        const b = booking(id)
        if (b.source !== 'manual' || b.checked_in_at) return 'Chỉ dùng cho đặt phòng nhập tay chưa nhận phòng'
        patch(id, { status: 'cancelled', note: [b.note, 'Không đến'].filter(Boolean).join(' · ') })
        log(b.room_id, 'booking', 'Huỷ', `${guestLabel(b)} · Không đến`, id)
      },

      cancel: (id) => {
        const b = booking(id)
        if (b.checked_in_at) return 'Khách đã nhận phòng, không huỷ được'
        patch(id, { status: 'cancelled' })
        log(b.room_id, 'booking', 'Huỷ', `${guestLabel(b)} ${fmtRange(b)}`, id)
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

      // Snackbar "Hoàn tác" for one-tap records, open to staff too.
      undeclare: (id) => {
        const b = booking(id)
        patch(id, { declared_at: undefined })
        stayLog(b, 'Hoàn tác khai báo lưu trú')
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

      unclean: (roomId) => {
        patchRoom(roomId, { housekeeping: 'dirty' })
        log(roomId, 'room', 'Hoàn tác dọn xong')
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
