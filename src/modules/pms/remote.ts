import { useCallback, useEffect, useState } from 'react'

import { API_URL } from '@/constants/common'

import { api, ApiError } from './api'
import { Guest, GuestProfile, mockGuests, mockProfile } from './guests.store'
import { mockCleaning, mockHousekeeping } from './ops.store'
import { addDays, AMENITY, Booking, day, Feed, PayMethod, Room, ROOM_TYPE, RoomDraft, usePms } from './pms.store'
import { addGroupRooms, createGroup, Group, useSales } from './sales.store'

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

// GET /places/:id/calendar_feeds: last_synced_at is the last success there; the store's is the last attempt.
type ApiFeed = Omit<Feed, 'last_synced_at' | 'last_ok_at' | 'last_error'> & {
  last_synced_at: string | null
  last_error_at: string | null
  error: Feed['last_error'] | null
  error_message: string | null
}
const toFeed = (f: ApiFeed): Feed =>
  strip<Feed>({
    id: f.id,
    room_id: f.room_id,
    provider: f.provider,
    host: f.host,
    last_synced_at: [f.last_synced_at, f.last_error_at].filter(Boolean).sort().pop() || null,
    last_ok_at: f.last_synced_at,
    last_error: f.error,
    error_message: f.error_message,
  })
const upsertFeed = (f: Feed) => usePms.setState((s) => ({ feeds: s.feeds.map((x) => (x.id === f.id ? f : x)) }))

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
  const [{ rooms }, cal, channels] = await Promise.all([
    api<{ rooms: ApiRoom[] }>(`/places/${placeId}/rooms`),
    api<{ bookings: Booking[] }>(`/places/${placeId}/calendar?from=${from}&to=${to}`),
    api<{ rooms: { feeds: ApiFeed[] }[] }>(`/places/${placeId}/calendar_feeds`),
  ])
  const ids = new Set(rooms.map((r) => r.id))
  const inWindow = (b: Booking) =>
    ids.has(b.room_id) && ((b.start_date < to && b.end_date > from) || (!!b.checked_in_at && !b.checked_out_at))
  usePms.setState((s) => ({
    rooms: [...s.rooms.filter((r) => r.place_id !== placeId), ...rooms.map(toRoom)],
    feeds: [...s.feeds.filter((f) => !ids.has(f.room_id)), ...channels.rooms.flatMap((r) => r.feeds.map(toFeed))],
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

  // Đồng bộ ngay (#37): waits for the OTA, at most once a minute per feed. A failed sync still updates the feed.
  sync: async (feedId: number): Promise<Result> => {
    if (!API_URL) return mock().sync(feedId)
    try {
      upsertFeed(toFeed(await api<ApiFeed>(`/calendar_feeds/${feedId}/sync`, { method: 'POST' })))
      const roomId = usePms.getState().feeds.find((f) => f.id === feedId)?.room_id
      const placeId = roomId && placeOfRoom(roomId)
      if (placeId) await loadPlace(placeId).catch(() => {})
    } catch (e) {
      if (!(e instanceof ApiError)) return 'Có lỗi, thử lại sau ít phút.'
      if (e.body.feed) upsertFeed(toFeed(e.body.feed as ApiFeed))
      return e.message
    }
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

// Hoạt động / Lịch sử (#38): lines written by the server, newest first, 50 a page. Owners only.
export type Line = {
  id: number
  at: string
  kind: string
  action: string
  detail?: string
  actor: string
  room_id?: number
  room_name?: string
}

// path: /places/:id/activity or /bookings/:id/history; none = don't ask (mock mode, or not an owner).
// version: ask again from the first page when it changes (the booking was changed).
export function useActivity(path?: string, version?: string) {
  const [lines, setLines] = useState<Line[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [error, setError] = useState<string>()
  const page = useCallback(
    async (before?: number) => {
      if (!path) return
      try {
        const res = await api<{ activities: Line[]; next_before: number | null }>(
          before ? `${path}?before=${before}` : path,
        )
        setLines((l) => [...(before ? l : []), ...res.activities.map((a) => strip<Line>(a))])
        setNext(res.next_before)
        setError(undefined)
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Không tải được lịch sử.')
      }
    },
    [path],
  )
  useEffect(() => {
    page()
  }, [page, version])
  return { lines: path ? lines : [], error, more: next ? () => page(next) : undefined }
}

// ---------- homestay setup (#22, hueni-api#162): owner-only writes, the API enforces ----------

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Có lỗi, thử lại sau ít phút.')
const codeOf = (map: Record<string, string>, label?: string) => Object.keys(map).find((k) => map[k] === label) || null

// Thêm / sửa phòng. notices: what the owner should know (bookings ahead keep their price, too many guests…).
export async function saveRoom(draft: RoomDraft, id?: number): Promise<{ id: number; notices?: string[] } | string> {
  if (!API_URL) {
    const r = usePms.getState().actions.saveRoom(draft, id)
    return typeof r === 'number' ? { id: r } : r
  }
  const room = {
    name: draft.name,
    max_guests: draft.max_guests,
    price: draft.price ?? null,
    weekend_price: draft.weekend_price ?? null,
    active: draft.active,
    floor: draft.floor ?? null,
    room_type: codeOf(ROOM_TYPE, draft.kind),
    amenities: (draft.amenities || []).map((a) => codeOf(AMENITY, a)).filter(Boolean),
    note: draft.note || null,
  }
  try {
    const r = await api<{ id: number; notices?: string[] }>(id ? `/rooms/${id}` : `/places/${draft.place_id}/rooms`, {
      method: id ? 'PATCH' : 'POST',
      body: { room },
    })
    await loadPlace(draft.place_id).catch(() => {})
    return { id: r.id, notices: r.notices }
  } catch (e) {
    return message(e)
  }
}

// Only a room that never had a booking; else the server says to pause it instead.
export async function deleteRoom(id: number): Promise<Result> {
  if (!API_URL) return usePms.getState().actions.deleteRoom(id)
  const placeId = placeOfRoom(id)
  try {
    await api(`/rooms/${id}`, { method: 'DELETE' })
    if (placeId) await loadPlace(placeId).catch(() => {})
  } catch (e) {
    return message(e)
  }
}

export type Service = { id: number; name: string; price: number; unit?: string }

// Danh mục dịch vụ of a homestay; `mock` without the API.
export function useServices(placeId: number | undefined, mock: Omit<Service, 'id'>[]) {
  const [list, setList] = useState<Service[]>(() => mock.map((x, i) => ({ ...x, id: i + 1 })))
  useEffect(() => {
    if (!API_URL || !placeId) return
    api<{ services: Service[] }>(`/places/${placeId}/services`)
      .then((r) => setList(r.services.map((x) => strip<Service>(x))))
      .catch(() => setList([]))
  }, [placeId])
  return list
}

// Thêm dịch vụ: one request per service (the server copies name and price onto the bill).
export async function addCharges(bookingId: number, items: { service_id: number; quantity: number }[]) {
  for (const item of items) {
    const error = await send(`/bookings/${bookingId}/charges`, { body: item })
    if (error) return error
  }
}

export const removeCharge = (bookingId: number, chargeId: number) =>
  send(`/bookings/${bookingId}/charges/${chargeId}`, { method: 'DELETE' })

// "50000" or "10%"; blank removes it. Staff are capped by the server.
export const setDiscount = (bookingId: number, discount: string, reason = '') =>
  send(`/bookings/${bookingId}/discount`, {
    method: 'PATCH',
    body: { booking: { discount, discount_reason: reason } },
  })

export const removePayment = (bookingId: number, paymentId: number) =>
  send(`/bookings/${bookingId}/payments/${paymentId}`, { method: 'DELETE' })

// Thành viên: names to pick from (dọn phòng, giao ca). No phone numbers.
export function useMembers(placeId: number | undefined, mock: string[]) {
  const [names, setNames] = useState(mock)
  useEffect(() => {
    if (!API_URL || !placeId) return
    api<{ members: { name: string }[] }>(`/places/${placeId}/members`)
      .then((r) => setNames(r.members.map((m) => m.name)))
      .catch(() => {})
  }, [placeId])
  return names
}

// Hoa hồng OTA (owner): % each channel keeps, for Thực nhận in Báo cáo. `mock` without the API.
export function useCommissions(
  placeId: number,
  mock: Record<string, number>,
  setMock: (k: string, pct: number) => void,
) {
  const [server, setServer] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!API_URL) return
    api<{ commissions?: Record<string, number> }>(`/places/${placeId}`)
      .then((p) => setServer(p.commissions || {}))
      .catch(() => {})
  }, [placeId])
  if (!API_URL) return { commission: mock, save: async (k: string, pct: number) => setMock(k, pct) }
  return {
    commission: server as Record<string, number | undefined>,
    save: async (k: string, pct: number): Promise<Result> => {
      try {
        const p = await api<{ commissions?: Record<string, number> }>(`/places/${placeId}/commissions`, {
          method: 'PATCH',
          body: { place: { commissions: { [k]: pct || '' } } },
        })
        setServer(p.commissions || {})
      } catch (e) {
        return message(e)
      }
    },
  }
}

// ---------- đoàn (#24, hueni-api#164) ----------
// Each room is a normal booking with group_id. Every group request answers with the whole Group: keep it in
// useSales and its rooms (Booking detail, money included) in pms.store. Bỏ phòng khỏi đoàn = remote.cancel.

type ApiGroup = Group & { bookings: Booking[] }
type Dates = Pick<Booking, 'start_date' | 'end_date'>

async function groupRequest(path: string, method = 'POST', body?: unknown): Promise<number | string> {
  try {
    const g = await api<ApiGroup>(path, { method, body })
    const placeId = g.bookings[0] && placeOfRoom(g.bookings[0].room_id)
    if (placeId) await loadPlace(placeId).catch(() => {})
    const { bookings, ...group } = strip<ApiGroup>(g)
    useSales.setState((s) => ({ groups: [...s.groups.filter((x) => x.id !== g.id), group] }))
    bookings.forEach((b) => upsertBooking(toBooking(b)))
    return g.id
  } catch (e) {
    return message(e)
  }
}
const groupResult = async (path: string, method?: string, body?: unknown): Promise<Result> => {
  const r = await groupRequest(path, method, body)
  if (typeof r === 'string') return r
}

export const groups = {
  load: async (id: number): Promise<Result> => (API_URL ? groupResult(`/groups/${id}`, 'GET') : undefined),

  // All rooms or none. discount_pct is the owner's: the server ignores it from staff.
  create: async (
    placeId: number,
    draft: Omit<Group, 'id' | 'code' | 'bill'>,
    rooms: Room[],
    dates: Dates,
  ): Promise<number | string> =>
    API_URL
      ? groupRequest(`/places/${placeId}/groups`, 'POST', { group: draft, room_ids: rooms.map((r) => r.id), ...dates })
      : createGroup(draft, rooms, dates),

  addRoom: async (group: Group, room: Room, dates: Dates): Promise<Result> => {
    if (API_URL) return groupResult(`/groups/${group.id}/bookings`, 'POST', { room_id: room.id, ...dates })
    const r = addGroupRooms(group, [room], dates)
    if (typeof r === 'string') return r
  },

  // Đổi phòng and / or Tính vào đoàn / Khách tự trả, saved together.
  setRoom: async (groupId: number, b: Booking, change: { room_id?: number; pays_own?: boolean }): Promise<Result> => {
    if (API_URL) return groupResult(`/groups/${groupId}/bookings/${b.id}`, 'PATCH', { booking: change })
    if (change.room_id !== undefined) {
      const { id: _id, source: _s, ...draft } = b
      const error = mock().update(b.id, {
        ...draft,
        status: b.status === 'hold' ? 'hold' : 'confirmed',
        room_id: change.room_id,
      })
      if (error) return error
    }
    if (change.pays_own !== undefined)
      usePms.setState((s) => ({
        bookings: s.bookings.map((x) => (x.id === b.id ? { ...x, pays_own: change.pays_own } : x)),
      }))
  },

  setBill: async (groupId: number, bill: Group['bill']): Promise<Result> => {
    if (API_URL) return groupResult(`/groups/${groupId}`, 'PATCH', { group: { bill } })
    useSales.getState().setGroup(groupId, { bill })
  },

  // Thu tiền cho đoàn (one bill): the server splits it over the billed rooms' due, in room-name order.
  // billed: those rooms and their due, in that order, for the mock.
  pay: async (
    groupId: number,
    amount: number,
    method: PayMethod,
    note: string,
    billed: { id: number; due: number }[],
  ): Promise<Result> => {
    if (API_URL)
      return groupResult(`/groups/${groupId}/payments`, 'POST', {
        payment: { amount, payment_method: method, note: note || undefined },
      })
    let left = amount
    if (amount > billed.reduce((n, b) => n + b.due, 0)) return 'Số tiền lớn hơn số còn phải thu của đoàn.'
    for (const b of billed) {
      const part = Math.min(left, b.due)
      if (part > 0) mock().pay(b.id, part, method)
      left -= part
    }
  },

  // Nhận phòng cả đoàn: every room still to arrive, or none.
  checkIn: async (groupId: number, waiting: Booking[]): Promise<Result> => {
    if (API_URL) return groupResult(`/groups/${groupId}/check_in`)
    const rooms = usePms.getState().rooms
    for (const b of waiting) {
      const room = rooms.find((r) => r.id === b.room_id)
      const e = mock().checkIn(b.id, b.guests || room?.max_guests)
      if (e) return `Phòng ${room?.name}: ${e}`
    }
  },
}

// ---------- khách (#25, hueni-api#165) ----------

const NO_PROFILE = 'Đặt phòng này không có hồ sơ khách (khách đặt qua OTA hoặc chưa có tên).'

// Hồ sơ khách of a homestay. q (name, phone or DP code) goes in the body: guest details never go into a URL.
export async function listGuests(placeId: number, q: string): Promise<Guest[] | string> {
  if (!API_URL) return mockGuests(placeId, q)
  try {
    const r = await api<{ guests: Guest[] }>(`/places/${placeId}/guests`, { body: { q } })
    return r.guests.map((g) => strip<Guest>(g))
  } catch (e) {
    return message(e)
  }
}

const toProfile = (g: GuestProfile): GuestProfile => ({
  ...strip<GuestProfile>(g),
  bookings: g.bookings.map(toBooking),
})

// The profile of the guest of booking `bookingId`.
export async function fetchGuest(bookingId: number): Promise<GuestProfile | string> {
  if (!API_URL) return mockProfile(bookingId) || NO_PROFILE
  try {
    return toProfile(await api<GuestProfile>(`/bookings/${bookingId}/guest`))
  } catch (e) {
    return e instanceof ApiError && e.status === 404 ? NO_PROFILE : message(e)
  }
}

// Ghi chú cho lễ tân and Cần lưu ý (flag '' = bỏ đánh dấu). The flag is copied onto the guest's bookings
// in the store, so Booking detail shows it before its next fetch.
export async function saveGuest(bookingId: number, guest: { note?: string; flag?: string }) {
  if (!API_URL) return mockProfile(bookingId, guest) || NO_PROFILE
  try {
    const g = toProfile(await api<GuestProfile>(`/bookings/${bookingId}/guest`, { method: 'PATCH', body: { guest } }))
    const ids = new Set(g.bookings.map((b) => b.id))
    usePms.setState((s) => ({
      bookings: s.bookings.map((b) => (ids.has(b.id) ? { ...b, guest_flag: g.flag } : b)),
    }))
    return g
  } catch (e) {
    return message(e)
  }
}

// ---------- buồng phòng (#26, hueni-api#166) ----------

// One room to clean today. task: null until someone touches it, always null for daily.
export type Cleaning = {
  room_id: number
  room_name: string
  kind: 'checkout' | 'daily'
  urgent: boolean
  damage_note?: string
  task?: {
    id: number
    assignee_id?: number
    assignee_name?: string
    checks: boolean[]
    started_at?: string
    done_at?: string
  }
}
export type Housekeeping = { checklist: string[]; rows: Cleaning[] }

const toCleaning = (c: Cleaning): Cleaning => {
  const x = strip<Cleaning>(c)
  return x.task ? { ...x, task: strip(x.task) } : x
}

// Which rooms, urgency and order are the server's. Mock: from the store.
export async function fetchHousekeeping(placeId: number): Promise<Housekeeping | string> {
  if (!API_URL) return mockHousekeeping(placeId)
  try {
    const r = await api<Housekeeping>(`/places/${placeId}/housekeeping`)
    return { checklist: r.checklist, rows: r.rows.map(toCleaning) }
  } catch (e) {
    return message(e)
  }
}

// Every write answers with the room's row. Finish and undo change the room, so its homestay reloads.
async function sendCleaning(roomId: number, path: string, method: string, body?: unknown, reload = false) {
  try {
    const row = toCleaning(await api<Cleaning>(path, { method, body }))
    const placeId = placeOfRoom(roomId)
    if (reload && placeId) await loadPlace(placeId).catch(() => {})
    return row
  } catch (e) {
    return message(e)
  }
}

export const cleaning = {
  // Người làm, ticks (all 5, in checklist order), Bắt đầu.
  change: async (roomId: number, p: { assignee_id?: number; checks?: boolean[]; start?: boolean }) =>
    API_URL
      ? sendCleaning(roomId, `/rooms/${roomId}/cleaning`, 'PATCH', { cleaning: p })
      : mockCleaning.change(roomId, p),
  finish: async (roomId: number) =>
    API_URL
      ? sendCleaning(roomId, `/rooms/${roomId}/cleaning/finish`, 'POST', undefined, true)
      : mockCleaning.finish(roomId),
  undo: async (roomId: number) =>
    API_URL
      ? sendCleaning(roomId, `/rooms/${roomId}/cleaning/undo`, 'POST', undefined, true)
      : mockCleaning.undo(roomId),
  // Blank = fixed. The room carries the note too, so its homestay reloads.
  damage: async (roomId: number, note: string) =>
    API_URL
      ? sendCleaning(roomId, `/rooms/${roomId}/damage`, 'PATCH', { room: { damage_note: note } }, true)
      : mockCleaning.damage(roomId, note),
}

// Thành viên with ids, for Người làm. Mock: the names numbered from 1.
export function useTeam(placeId: number, mock: string[]) {
  const [team, setTeam] = useState(() => (API_URL ? [] : mock.map((name, i) => ({ id: i + 1, name }))))
  useEffect(() => {
    if (!API_URL) return
    api<{ members: { id: number; name: string }[] }>(`/places/${placeId}/members`)
      .then((r) => setTeam(r.members.map(({ id, name }) => ({ id, name }))))
      .catch(() => {})
  }, [placeId])
  return team
}
