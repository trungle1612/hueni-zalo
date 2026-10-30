import { create } from 'zustand'

import { Booking, Room, usePms } from './pms.store'
import { Channel } from './report'

// Selling rooms: groups, channel commission, the direct booking page.
// ponytail: in-memory mock like pms.store; each piece becomes a hueni-api resource.

// hueni-api's Group (#164) without its bookings, which go to pms.store (Khách tự trả = Booking.pays_own).
export type Group = {
  id: number
  code: string // DOAN-0001, per homestay
  name: string
  contact?: string
  phone?: string
  origin?: string
  discount_pct: number // giá đoàn: off the room price, fixed into each booking when created
  bill: 'one' | 'split' // one bill for the contact, or one per room
  // From hueni-api: sums of the rooms billed to the group.
  total?: number
  paid?: number
  due?: number
}

export type Site = {
  open: boolean
  deposit: 0 | 30 | 50 | 100
  hidden: string[] // room kinds not offered online
  hold: string
  cutoff: string
}

export const GROUP_ORIGINS = ['Công ty lữ hành', 'Điện thoại / Zalo', 'Trực tiếp']
export const SITE_DEFAULT: Site = { open: true, deposit: 30, hidden: [], hold: '30 phút', cutoff: '20:00' }

type State = {
  groups: Group[]
  commission: Record<Channel, number> // %, for Thực nhận in Báo cáo
  sites: Record<number, Site> // by place_id
  setGroup: (id: number, p: Partial<Group>) => void
  setCommission: (c: Channel, pct: number) => void
  saveSite: (placeId: number, s: Site) => void
}

export const useSales = create<State>((set) => ({
  groups: [],
  commission: { manual: 0, airbnb: 3, booking: 15, agoda: 18, other: 0 },
  sites: {},
  setGroup: (id, p) => set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...p } : g)) })),
  setCommission: (c, pct) => set((s) => ({ commission: { ...s.commission, [c]: pct } })),
  saveSite: (placeId, site) => set((s) => ({ sites: { ...s.sites, [placeId]: site } })),
}))

const discounted = (n: number | undefined, pct: number) =>
  n === undefined ? undefined : Math.round((n * (100 - pct)) / 100 / 1000) * 1000

// One booking per room, all or nothing. Returns the group id, or the first problem.
export function addGroupRooms(
  group: Pick<Group, 'name' | 'discount_pct'> & { id: number },
  rooms: Room[],
  dates: Pick<Booking, 'start_date' | 'end_date'>,
) {
  const pms = usePms.getState()
  const snap = pms.actions.snapshot()
  const ids: number[] = []
  for (const room of rooms) {
    const id = pms.actions.create({
      ...dates,
      room_id: room.id,
      status: 'confirmed',
      guest_name: group.name,
      guests: room.max_guests, // ponytail: full rooms; names and counts come with lưu trú
      origin: 'Đoàn',
      price: discounted(room.price, group.discount_pct),
      weekend_price: discounted(room.weekend_price, group.discount_pct),
    })
    if (typeof id === 'string') {
      pms.actions.restore(snap)
      return `Phòng ${room.name}: ${id}`
    }
    ids.push(id)
  }
  usePms.setState((s) => ({
    bookings: s.bookings.map((b) => (ids.includes(b.id) ? { ...b, group_id: group.id } : b)),
  }))
  return ids
}

export function createGroup(
  draft: Omit<Group, 'id' | 'code' | 'bill'>,
  rooms: Room[],
  dates: Pick<Booking, 'start_date' | 'end_date'>,
) {
  if (rooms.length < 2) return 'Chọn ít nhất 2 phòng. Một phòng thì tạo đặt phòng thường.'
  const id = Math.max(0, ...useSales.getState().groups.map((g) => g.id)) + 1
  const added = addGroupRooms({ ...draft, id }, rooms, dates)
  if (typeof added === 'string') return added
  const code = `DOAN-${String(id).padStart(4, '0')}`
  useSales.setState((s) => ({ groups: [...s.groups, { ...draft, id, code, bill: 'one' }] }))
  return id
}
