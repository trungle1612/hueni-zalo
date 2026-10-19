import dayjs from 'dayjs'
import { create } from 'zustand'

// Shapes mirror hueni-api db/schema.rb (rooms, bookings). Dates are 'YYYY-MM-DD', end_date exclusive.
// ponytail: in-memory mock data, swap actions for request() calls once hueni-api exposes JSON endpoints.

export type Room = {
  id: number
  name: string
  max_guests: number
  price: number
  active: boolean
  housekeeping: 'clean' | 'dirty'
}

export type Booking = {
  id: number
  room_id: number
  start_date: string
  end_date: string
  status: 'hold' | 'confirmed' | 'cancelled'
  source: 'manual' | 'ical'
  provider?: 'airbnb' | 'booking'
  guest_name?: string
  guest_phone?: string
  guests?: number
  note?: string
  checked_in_at?: string
  checked_out_at?: string
  declared_at?: string
}

export type RoomState = 'off' | 'leaving' | 'occupied' | 'arriving' | 'held' | 'free'

export type RoomDay = { room: Room; state: RoomState; booking?: Booking; next?: Booking }

const d = (offset: number) => dayjs().add(offset, 'day').format('YYYY-MM-DD')
const now = () => new Date().toISOString()

const rooms: Room[] = [
  { id: 1, name: 'Phòng 101', max_guests: 2, price: 450000, active: true, housekeeping: 'clean' },
  { id: 2, name: 'Phòng 102', max_guests: 2, price: 450000, active: true, housekeeping: 'dirty' },
  { id: 3, name: 'Phòng 201', max_guests: 4, price: 700000, active: true, housekeeping: 'clean' },
  { id: 4, name: 'Phòng 202', max_guests: 3, price: 600000, active: true, housekeeping: 'clean' },
  { id: 5, name: 'Gác mái', max_guests: 2, price: 350000, active: false, housekeeping: 'clean' },
]

const bookings: Booking[] = [
  {
    id: 1,
    room_id: 1,
    start_date: d(-2),
    end_date: d(0),
    status: 'confirmed',
    source: 'manual',
    guest_name: 'Nguyễn Văn An',
    guest_phone: '0912345678',
    guests: 2,
    checked_in_at: now(),
  },
  {
    id: 2,
    room_id: 1,
    start_date: d(2),
    end_date: d(5),
    status: 'confirmed',
    source: 'ical',
    provider: 'airbnb',
    guest_name: 'Airbnb',
  },
  {
    id: 3,
    room_id: 2,
    start_date: d(-1),
    end_date: d(2),
    status: 'confirmed',
    source: 'ical',
    provider: 'booking',
    guest_name: 'Booking.com',
    guests: 2,
    checked_in_at: now(),
  },
  {
    id: 4,
    room_id: 3,
    start_date: d(0),
    end_date: d(3),
    status: 'confirmed',
    source: 'manual',
    guest_name: 'Trần Thị Bình',
    guest_phone: '0987654321',
    note: 'Đến khoảng 21h',
  },
  {
    id: 5,
    room_id: 4,
    start_date: d(0),
    end_date: d(1),
    status: 'hold',
    source: 'manual',
    guest_name: 'Lê Minh',
    guest_phone: '0901234567',
  },
  {
    id: 6,
    room_id: 4,
    start_date: d(4),
    end_date: d(8),
    status: 'confirmed',
    source: 'manual',
    guest_name: 'Phạm Quốc Huy',
    guests: 3,
  },
  {
    id: 7,
    room_id: 3,
    start_date: d(5),
    end_date: d(7),
    status: 'cancelled',
    source: 'manual',
    guest_name: 'Võ Thanh',
  },
]

const blocking = (b: Booking) => b.status !== 'cancelled' && !b.checked_out_at

// Port of hueni-api RoomDay (minus the 06:00 late-arrival rule).
export function roomDay(room: Room, all: Booking[], date = d(0)): RoomDay {
  const mine = all
    .filter((b) => b.room_id === room.id && blocking(b))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const staying = mine.find((b) => b.checked_in_at)
  const waiting = mine.filter((b) => !b.checked_in_at && b.start_date <= date && date < b.end_date)
  const arriving = waiting.find((b) => b.status === 'confirmed') || waiting[0]
  const booking = staying || arriving
  const next = mine.find((b) => b !== booking && !b.checked_in_at && b.start_date >= date)
  let state: RoomState = 'free'
  if (!room.active) state = 'off'
  else if (staying) state = staying.end_date <= date ? 'leaving' : 'occupied'
  else if (arriving) state = arriving.status === 'confirmed' ? 'arriving' : 'held'
  return { room, state, booking, next }
}

// Mirrors Booking#date_problems: a manual hold/confirmed booking can't overlap another blocking one.
export function dateProblem(
  all: Booking[],
  draft: Pick<Booking, 'room_id' | 'start_date' | 'end_date'>,
  ignoreId?: number,
) {
  if (!draft.start_date || !draft.end_date) return 'Chọn ngày đến và ngày đi'
  if (draft.end_date <= draft.start_date) return 'Ngày đi phải sau ngày đến'
  const clash = all.find(
    (b) =>
      b.id !== ignoreId &&
      b.room_id === draft.room_id &&
      blocking(b) &&
      b.start_date < draft.end_date &&
      draft.start_date < b.end_date,
  )
  return clash ? `Trùng lịch với ${clash.guest_name || 'đặt phòng khác'}` : null
}

type State = {
  placeName: string
  rooms: Room[]
  bookings: Booking[]
  actions: {
    checkIn: (id: number, guests?: number) => void
    checkOut: (id: number) => void
    cancel: (id: number) => void
    declare: (id: number) => void
    clean: (roomId: number) => void
    create: (b: Omit<Booking, 'id' | 'source'>) => number
  }
}

export const usePms = create<State>((set, get) => {
  const patchBooking = (id: number, patch: Partial<Booking>) =>
    set((s) => ({ bookings: s.bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))

  return {
    placeName: 'Hueni Homestay',
    rooms,
    bookings,
    actions: {
      checkIn: (id, guests) => patchBooking(id, { checked_in_at: now(), ...(guests ? { guests } : {}) }),
      checkOut: (id) => {
        const roomId = get().bookings.find((b) => b.id === id)?.room_id
        patchBooking(id, { checked_out_at: now() })
        set((s) => ({ rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, housekeeping: 'dirty' } : r)) }))
      },
      cancel: (id) => patchBooking(id, { status: 'cancelled' }),
      declare: (id) => patchBooking(id, { declared_at: now() }),
      clean: (roomId) =>
        set((s) => ({ rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, housekeeping: 'clean' } : r)) })),
      create: (b) => {
        const id = Math.max(0, ...get().bookings.map((x) => x.id)) + 1
        set((s) => ({ bookings: [...s.bookings, { ...b, id, source: 'manual' }] }))
        return id
      },
    },
  }
})

export const STATE_LABEL: Record<RoomState, { label: string; className: string }> = {
  off: { label: 'Tạm ngưng', className: 'bg-gray-200 text-gray-600' },
  leaving: { label: 'Trả phòng hôm nay', className: 'bg-amber-100 text-amber-800' },
  occupied: { label: 'Đang ở', className: 'bg-blue-100 text-blue-800' },
  arriving: { label: 'Chờ khách', className: 'bg-green-100 text-green-800' },
  held: { label: 'Giữ chỗ', className: 'bg-purple-100 text-purple-800' },
  free: { label: 'Phòng trống', className: 'bg-gray-100 text-gray-700' },
}

export const STATUS_LABEL: Record<Booking['status'], string> = {
  hold: 'Giữ chỗ',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã huỷ',
}

export const sourceLabel = (b: Booking) =>
  b.source === 'manual'
    ? 'Trực tiếp'
    : b.provider === 'airbnb'
      ? 'Airbnb'
      : b.provider === 'booking'
        ? 'Booking.com'
        : 'OTA'

export const fmtDate = (s: string) => dayjs(s).format('DD/MM')
export const nights = (b: Booking) => dayjs(b.end_date).diff(b.start_date, 'day')
