import dayjs from 'dayjs'

import { Activity, addDays, Booking, occupiedUntil, occupies, Place, Provider, Room, today } from './pms.store'

// Port of hueni-api Report (#77, #117): one homestay, one calendar month.
// A night is a date slept (end_date exclusive); nights sold follow occupiedUntil, like vacancy.
// Revenue is an estimate: nights × the room's current price; unpriced rooms are left out of revenue and ADR.
// The current month counts the 1st through today (`last`); confirmed nights after today are `ahead`.
// ponytail: computed client-side from mock data; becomes one GET once hueni-api exposes the report as JSON.

export type Channel = 'manual' | Provider
export const CHANNEL_LABEL: Record<Channel, string> = {
  manual: 'Trực tiếp',
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  other: 'iCal khác',
}

export type RoomRow = { room: Room; sold: number; held: number; revenue?: number }

export type Report = {
  month: string // YYYY-MM-01
  last: string
  current: boolean
  future: boolean
  partial: boolean
  days: number
  rooms: RoomRow[]
  sold: number
  held: number
  available: number
  occupancy?: number
  revenue: number
  adr?: number
  unpricedRooms: boolean
  ahead: number
  aheadRevenue: number
  channels: { key: Channel; nights: number; bookings: number; revenue: number }[]
  bookingCount: number
  outcomes: Record<'confirmed' | 'hold' | 'cancelled', number>
  alos?: number
  otaCancelled: number
  cancellationRate?: number
  empty: boolean
}

const ratio = (part: number, whole: number) => (whole ? part / whole : undefined)
const channelOf = (b: Booking): Channel => (b.source === 'manual' ? 'manual' : b.provider || 'other')
const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD')

export const monthStart = (date: string) => fmt(dayjs(date).startOf('month'))

type Input = { place: Place; rooms: Room[]; bookings: Booking[]; activities: Activity[] }

export function buildReport(
  { place, rooms, bookings, activities }: Input,
  month: string,
  lastOverride?: string,
): Report {
  const start = monthStart(month)
  const next = fmt(dayjs(start).add(1, 'month'))
  const monthEnd = addDays(next, -1)
  const current = start === monthStart(today())
  const last = lastOverride || (current ? today() : monthEnd)
  const days = dayjs(last).diff(start, 'day') + 1

  const placeRooms = rooms.filter((r) => r.place_id === place.id).sort((a, b) => a.name.localeCompare(b.name))
  const roomIds = new Set(placeRooms.map((r) => r.id))
  const roomOf = (b: Booking) => placeRooms.find((r) => r.id === b.room_id)!
  const stays = bookings.filter((b) => roomIds.has(b.room_id) && occupies(b, start, next))

  // The booking's nights inside the month.
  const dates = (b: Booking) => {
    const out: string[] = []
    const until = occupiedUntil(b) < next ? occupiedUntil(b) : next
    for (let d = b.start_date > start ? b.start_date : start; d < until; d = addDays(d, 1)) out.push(d)
    return out
  }

  // room_id → date → the confirmed booking that sold that night. A night shared by an iCal and a
  // manual booking (a calendar conflict) is sold once, to the OTA.
  const soldNights = new Map<number, Map<string, Booking>>()
  stays
    .filter((b) => b.status === 'confirmed')
    .sort((a, b) => (a.source === 'ical' ? 0 : 1) - (b.source === 'ical' ? 0 : 1))
    .forEach((b) => {
      const nights = soldNights.get(b.room_id) || new Map<string, Booking>()
      soldNights.set(b.room_id, nights)
      dates(b).forEach((d) => nights.has(d) || nights.set(d, b))
    })
  const soldUpTo = (nights: Map<string, Booking> | undefined, inRange: (d: string) => boolean) =>
    Array.from((nights || new Map<string, Booking>()).entries()).filter(([d]) => inRange(d))

  const roomRows: RoomRow[] = placeRooms
    .map((room) => {
      const sold = soldUpTo(soldNights.get(room.id), (d) => d <= last)
      const soldDates = new Set(sold.map(([d]) => d))
      const held = new Set(
        stays
          .filter((b) => b.status === 'hold' && b.room_id === room.id)
          .flatMap(dates)
          .filter((d) => d <= last && !soldDates.has(d)),
      )
      return { room, sold: sold.length, held: held.size, revenue: room.price ? sold.length * room.price : undefined }
    })
    .filter((row) => row.room.active || row.sold > 0)

  const sold = roomRows.reduce((n, r) => n + r.sold, 0)
  const priced = roomRows.filter((r) => r.room.price)
  const revenue = priced.reduce((n, r) => n + (r.revenue || 0), 0)
  const aheadNights = Array.from(soldNights.values()).flatMap((m) => soldUpTo(m, (d) => d > last).map(([, b]) => b))

  const arrivals = bookings.filter((b) => roomIds.has(b.room_id) && b.start_date >= start && b.start_date <= last)
  const soldBookings = Array.from(soldNights.values()).flatMap((m) => soldUpTo(m, (d) => d <= last).map(([, b]) => b))
  const channels = (Object.keys(CHANNEL_LABEL) as Channel[])
    .map((key) => {
      const nights = soldBookings.filter((b) => channelOf(b) === key)
      return {
        key,
        nights: nights.length,
        bookings: arrivals.filter((b) => channelOf(b) === key).length,
        revenue: nights.reduce((n, b) => n + (roomOf(b).price || 0), 0),
      }
    })
    .filter((c) => c.nights || c.bookings)

  const outcomes = {
    confirmed: arrivals.filter((b) => b.status === 'confirmed').length,
    hold: arrivals.filter((b) => b.status === 'hold').length,
    cancelled: arrivals.filter((b) => b.status === 'cancelled').length,
  }
  const confirmedNights = arrivals
    .filter((b) => b.status === 'confirmed')
    .reduce((n, b) => n + dayjs(b.end_date).diff(b.start_date, 'day'), 0)
  // iCal bookings the sync deleted (the OTA cancelled them), by their start date in the activity log.
  const otaCancelled = activities.filter(
    (a) =>
      a.place_id === place.id &&
      a.ota_cancelled_start &&
      a.ota_cancelled_start >= start &&
      a.ota_cancelled_start <= last,
  ).length
  const held = roomRows.reduce((n, r) => n + r.held, 0)

  return {
    month: start,
    last,
    current,
    future: start > today(),
    partial: last < monthEnd,
    days,
    rooms: roomRows,
    sold,
    held,
    available: roomRows.length * days,
    occupancy: ratio(sold, roomRows.length * days),
    revenue,
    adr: ratio(
      revenue,
      priced.reduce((n, r) => n + r.sold, 0),
    ),
    unpricedRooms: priced.length < roomRows.length,
    ahead: aheadNights.length,
    aheadRevenue: aheadNights.reduce((n, b) => n + (roomOf(b).price || 0), 0),
    channels,
    bookingCount: arrivals.length,
    outcomes,
    alos: ratio(confirmedNights, outcomes.confirmed),
    otaCancelled,
    cancellationRate: ratio(outcomes.cancelled + otaCancelled, arrivals.length + otaCancelled),
    empty: !sold && !held && !arrivals.length && !otaCancelled,
  }
}

// A month in progress compares with the same days of the month before.
export function previousReport(input: Input, r: Report) {
  const prev = dayjs(r.month).subtract(1, 'month')
  const prevEnd = fmt(prev.endOf('month'))
  const sameDays = fmt(prev.add(r.days - 1, 'day'))
  return buildReport(input, fmt(prev), r.partial ? (sameDays < prevEnd ? sameDays : prevEnd) : undefined)
}

export const reportPeriod = (r: Report) =>
  r.partial ? `${dayjs(r.month).date()}–${dayjs(r.last).format('D/M')}` : `tháng ${dayjs(r.month).month() + 1}`

// "tăng 6%" / "giảm 0,5 đêm" vs the previous period; good = green. Nothing when either side is unknown or both are zero.
export function reportDelta(
  current: number | undefined,
  previous: number | undefined,
  kind: 'points' | 'percent' | 'nights',
  higherIsBetter = true,
) {
  if (current === undefined || previous === undefined || (!current && !previous) || (kind === 'percent' && !previous))
    return undefined
  const change =
    kind === 'points'
      ? (current - previous) * 100
      : kind === 'percent'
        ? ((current - previous) * 100) / previous
        : current - previous
  if (Math.round(change * 10) === 0) return { text: 'bằng', good: undefined }
  const amount = Math.abs(change)
    .toFixed(kind === 'nights' ? 1 : 0)
    .replace(/\.0$/, '')
    .replace('.', ',')
  return {
    text: `${change > 0 ? 'tăng' : 'giảm'} ${amount}${kind === 'nights' ? ' đêm' : '%'}`,
    good: change > 0 === higherIsBetter,
  }
}
