import { API_URL } from '@/constants/common'

import { api, ApiError } from './api'
import { addDays, Booking, day, PayMethod, Room, usePms } from './pms.store'

// Booking and front-desk actions for the screens connected to hueni-api (#34, #35, wiki Mini-App-API).
// With API_URL every action is a request and the server's answer replaces the local copy; without it
// (`vite dev`), the mock actions in pms.store. Each returns the error sentence to show, or nothing.

type Result = string | void
type Draft = Omit<Booking, 'id' | 'source' | 'status'> & { status: 'hold' | 'confirmed' }

// hueni-api sends null for "no value"; the store's types use missing fields.
const strip = <T>(o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null)) as T

type ApiRoom = Omit<Room, 'housekeeping'> & { housekeeping: 'clean' | 'dirty' | 'maintenance' }
// Maintenance is a room state on the server and `until` is its last day; the store keeps it beside
// housekeeping with `until` exclusive, like end_date.
const toRoom = (r: ApiRoom): Room => {
  const x = strip<ApiRoom>(r)
  return {
    ...x,
    housekeeping: x.housekeeping === 'dirty' ? 'dirty' : 'clean',
    maintenance: x.maintenance && { ...x.maintenance, until: addDays(x.maintenance.until, 1) },
  }
}
const toBooking = (b: Booking): Booking => {
  const x = strip<Booking>(b)
  return x.payments ? { ...x, payments: x.payments.map((p) => strip(p)), charges: x.charges?.map((c) => strip(c)) } : x
}

const upsertBooking = (b: Booking) =>
  usePms.setState((s) => ({
    bookings: s.bookings.some((x) => x.id === b.id)
      ? s.bookings.map((x) => (x.id === b.id ? b : x))
      : [...s.bookings, b],
  }))

// Rooms, and bookings of 62 days from `from` (the calendar endpoint's widest range); by default a month
// back to a month ahead. Bookings of that window are replaced, the rest kept.
// ponytail: Hôm nay and Phòng are still derived from these bookings in the browser; switch to
// GET /today and /board if the numbers ever drift from the web.
export async function loadPlace(placeId: number, from = day(-31)) {
  const to = addDays(from, 62)
  const [{ rooms }, cal] = await Promise.all([
    api<{ rooms: ApiRoom[] }>(`/places/${placeId}/rooms`),
    api<{ bookings: Booking[] }>(`/places/${placeId}/calendar?from=${from}&to=${to}`),
  ])
  const ids = new Set(rooms.map((r) => r.id))
  const inWindow = (b: Booking) =>
    ids.has(b.room_id) && ((b.start_date < to && b.end_date > from) || (!!b.checked_in_at && !b.checked_out_at))
  usePms.setState((s) => ({
    rooms: [...s.rooms.filter((r) => r.place_id !== placeId), ...rooms.map(toRoom)],
    // Keep what a booking page fetched (money) until it fetches again.
    bookings: [
      ...s.bookings.filter((b) => !inWindow(b) && !cal.bookings.some((x) => x.id === b.id)),
      ...cal.bookings.map((b) => ({ ...s.bookings.find((x) => x.id === b.id), ...toBooking(b) })),
    ],
  }))
}

export async function load(): Promise<Result> {
  if (!API_URL) return
  try {
    await Promise.all(usePms.getState().places.map((p) => loadPlace(p.id)))
  } catch (e) {
    return e instanceof ApiError ? e.message : 'Không tải được dữ liệu.'
  }
}

// The booking as the server has it, money included. Falls back to what the store has.
export async function fetchBooking(id: number): Promise<Booking | undefined> {
  const local = () => usePms.getState().bookings.find((b) => b.id === id)
  if (!API_URL) return local()
  try {
    const b = toBooking(await api<Booking>(`/bookings/${id}`))
    upsertBooking(b)
    return b
  } catch {
    return local()
  }
}

const placeOfRoom = (roomId: number) => usePms.getState().rooms.find((r) => r.id === roomId)?.place_id

// Send, then reload the homestay (rooms turn dirty, nights free up) and keep the returned booking.
async function send(path: string, init: { method?: string; body?: unknown } = {}): Promise<Result> {
  try {
    const b = toBooking(await api<Booking>(path, { method: init.method || 'POST', body: init.body }))
    const placeId = placeOfRoom(b.room_id)
    if (placeId) await loadPlace(placeId).catch(() => {})
    upsertBooking(b)
  } catch (e) {
    return e instanceof ApiError ? e.message : 'Có lỗi, thử lại sau ít phút.'
  }
}

const mock = () => usePms.getState().actions

// The draft fields hueni-api takes; `origin` and `payments` are the mock's.
const bookingBody = (d: Partial<Draft>) => ({
  start_date: d.start_date,
  end_date: d.end_date,
  guest_name: d.guest_name,
  guest_phone: d.guest_phone,
  guests: d.guests,
  note: d.note,
  price: d.price,
  weekend_price: d.weekend_price,
})

export const remote = {
  checkIn: async (id: number, guests?: number): Promise<Result> =>
    API_URL ? send(`/bookings/${id}/check_in`, { body: { guests } }) : mock().checkIn(id, guests),
  // The server moves the start to today when the guest comes early.
  earlyCheckIn: async (id: number): Promise<Result> =>
    API_URL ? send(`/bookings/${id}/check_in`) : mock().earlyCheckIn(id),
  checkOut: async (id: number): Promise<Result> => (API_URL ? send(`/bookings/${id}/check_out`) : mock().checkOut(id)),
  undoCheckIn: async (id: number): Promise<Result> =>
    API_URL ? send(`/bookings/${id}/undo_check_in`) : mock().undoCheckIn(id),
  undoCheckOut: async (id: number): Promise<Result> =>
    API_URL ? send(`/bookings/${id}/undo_check_out`) : mock().undoCheckOut(id),
  declare: async (id: number): Promise<Result> => (API_URL ? send(`/bookings/${id}/declare`) : mock().declare(id)),
  move: async (id: number, roomId: number): Promise<Result> =>
    API_URL ? send(`/bookings/${id}/move`, { body: { room_id: roomId } }) : mock().move(id, roomId),
  noShow: async (id: number): Promise<Result> =>
    API_URL ? send(`/bookings/${id}/no_show`) : mock().cancel(id, 'Không đến'),

  // refund: the owner gives back everything paid, by this method; else the money is kept.
  cancel: async (id: number, reason: string, refund?: PayMethod): Promise<Result> => {
    if (API_URL)
      return send(`/bookings/${id}`, {
        method: 'PATCH',
        body: { booking: { status: 'cancelled', cancel_reason: reason.slice(0, 200) }, refund_method: refund },
      })
    const b = usePms.getState().bookings.find((x) => x.id === id)!
    const paid = (b.payments || []).reduce((n, p) => n + p.amount, 0)
    if (refund && paid > 0) mock().pay(id, -paid, refund)
    return mock().cancel(id, reason)
  },
  uncancel: async (id: number): Promise<Result> =>
    API_URL
      ? send(`/bookings/${id}`, { method: 'PATCH', body: { booking: { status: 'confirmed' } } })
      : mock().uncancel(id),
  // hold is gone on the server (hueni-api#127): only the mock still has it.
  confirm: async (id: number): Promise<Result> => (API_URL ? undefined : mock().confirm(id)),

  // amount < 0 = a refund (owner only on the server).
  pay: async (id: number, amount: number, method: PayMethod): Promise<Result> =>
    API_URL
      ? send(`/bookings/${id}/payments`, {
          body: {
            payment: { amount: Math.abs(amount), payment_method: method, kind: amount < 0 ? 'refund' : 'payment' },
          },
        })
      : mock().pay(id, amount, method),

  create: async (draft: Draft): Promise<number | string> => {
    if (!API_URL) return mock().create(draft)
    const placeId = placeOfRoom(draft.room_id)
    const deposit = draft.payments?.find((p) => p.amount > 0)
    try {
      const b = toBooking(
        await api<Booking>(`/places/${placeId}/bookings`, {
          body: {
            booking: {
              ...bookingBody(draft),
              room_id: draft.room_id,
              deposit: deposit?.amount,
              deposit_method: deposit?.method,
            },
          },
        }),
      )
      if (placeId) await loadPlace(placeId).catch(() => {})
      upsertBooking(b)
      return b.id
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Có lỗi, thử lại sau ít phút.'
    }
  },

  update: async (id: number, draft: Draft): Promise<Result> => {
    if (!API_URL) return mock().update(id, draft)
    const b = usePms.getState().bookings.find((x) => x.id === id)
    // ponytail: the API edits dates and guest, not the room; moving a future booking stays on the web.
    if (b && b.room_id !== draft.room_id)
      return b.checked_in_at
        ? remote.move(id, draft.room_id)
        : 'Đổi phòng cho đặt phòng chưa đến: làm trên trang quản trị hueni, hoặc huỷ rồi đặt lại.'
    return send(`/bookings/${id}`, { method: 'PATCH', body: { booking: bookingBody(draft) } })
  },

  clean: async (roomId: number): Promise<Result> => {
    if (!API_URL) return mock().clean(roomId)
    try {
      await api(`/rooms/${roomId}/clean`, { method: 'POST' })
      const placeId = placeOfRoom(roomId)
      if (placeId) await loadPlace(placeId)
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Có lỗi, thử lại sau ít phút.'
    }
  },

  // ready = Dọn xong / Xong bảo trì; off = Bảo trì to the day before `until` (the store's until is exclusive).
  setRoomStatus: async (
    roomId: number,
    status: 'ready' | 'dirty' | 'off',
    maintenance?: Room['maintenance'],
  ): Promise<Result> => {
    if (!API_URL) return mock().setRoomStatus(roomId, status, maintenance)
    if (status === 'ready') return remote.clean(roomId)
    if (status === 'dirty') return 'Phòng tự chuyển sang Cần dọn khi khách trả phòng.'
    try {
      await api(`/rooms/${roomId}/maintenance`, {
        method: 'PATCH',
        body: {
          room: { maintenance_reason: maintenance?.reason, maintenance_until: addDays(maintenance!.until, -1) },
        },
      })
      const placeId = placeOfRoom(roomId)
      if (placeId) await loadPlace(placeId)
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Có lỗi, thử lại sau ít phút.'
    }
  },
}
