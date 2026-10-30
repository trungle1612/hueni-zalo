import dayjs from 'dayjs'
import { create } from 'zustand'

import { Booking, GuestDoc, isStaying, needsCleaning, occupies, Room, today, usePms } from './pms.store'
import type { Cleaning } from './remote'

// Khai báo lưu trú, Giao ca, Buồng phòng.
// ponytail: front-desk state the API doesn't have yet (till, expenses, cleaning checklists) lives here in memory.

// ---------- lưu trú ----------

// Everyone sleeping here tonight: in-house guests and today's arrivals.
export const tonight = (b: Booking) =>
  b.status !== 'cancelled' &&
  !b.checked_out_at &&
  (isStaying(b) || occupies(b, today(), dayjs().add(1, 'day').format('YYYY-MM-DD')))

// One line per guest: papers on file, or a missing slot. Declared by hand before papers existed = all done.
export type Slot = { b: Booking; i: number; doc?: GuestDoc }
export const slotsOf = (b: Booking): Slot[] => {
  const docs = b.docs || []
  const n = Math.max(b.guests || 1, docs.length)
  if (b.declared_at && !docs.length)
    return [{ b, i: 0, doc: { name: '', kind: 'vn', id_tail: '', status: 'ok', at: b.declared_at } }]
  return Array.from({ length: n }, (_, i) => ({ b, i, doc: docs[i] }))
}
export const undeclaredGuests = (all: Booking[]) =>
  all
    .filter(tonight)
    .flatMap(slotsOf)
    .filter((s) => !s.doc || s.doc.status === 'error').length

// Slots list papers first, then missing guests, so a new one is appended.
export const setDoc = (id: number, i: number, doc: GuestDoc) =>
  usePms.setState((s) => ({
    bookings: s.bookings.map((b) => {
      if (b.id !== id) return b
      const docs = [...(b.docs || [])]
      docs[Math.min(i, docs.length)] = doc
      return { ...b, docs }
    }),
  }))

// ---------- mock seeds ----------

// ponytail: made-up papers so the screen shows every state; remove with the mock store.
usePms.setState((s) => ({
  bookings: s.bookings.map((b) =>
    b.id === 3
      ? {
          ...b,
          docs: [
            { name: 'Sarah Miller', kind: 'foreign', id_tail: '4471', status: 'ready' },
            { name: 'Tom Miller', kind: 'foreign', id_tail: '9022', status: 'ready' },
          ],
        }
      : b.id === 4
        ? {
            ...b,
            docs: [
              {
                name: 'Trần Thị Bình',
                kind: 'vn',
                id_tail: '3308',
                status: 'error',
                problem: 'Bị trả lại: số định danh không khớp ngày sinh',
              },
            ],
          }
        : b,
  ),
}))

// ---------- giao ca, buồng phòng ----------

export type Expense = { place_id: number; amount: number; reason: string; at: string }
export type ShiftClose = {
  place_id: number
  at: string
  expected: number
  counted: number
  keep: number
  next: string
  note: string
}
export type Clean = { who: string; checks: boolean[]; started?: boolean; done?: string } // done = date

export const OPENING_CASH = 1000000 // ponytail: handed over by the previous shift; comes from its close once the API keeps shifts
export const STAFF = ['Em Hằng', 'Lê Thị Mai', 'Nguyễn Văn Tú'] // ponytail: the place's members, from the API
export const CHECKLIST = [
  'Thay ga, vỏ gối, khăn tắm',
  'Lau phòng tắm, bồn cầu',
  'Hút bụi, lau sàn',
  'Bổ sung nước suối, giấy, xà phòng',
  'Kiểm tra đồ để quên, đồ hỏng',
]

type Ops = {
  expenses: Expense[]
  closes: ShiftClose[]
  cleans: Record<number, Clean> // by room id, today's only
}

export const useOps = create<Ops>(() => ({
  expenses: [{ place_id: 1, amount: 150000, reason: 'Mua nước suối, giấy vệ sinh', at: new Date().toISOString() }],
  closes: [],
  cleans: { 2: { who: 'Lê Thị Mai', checks: [true, true, false, false, false], started: true } },
}))

const blank = (): Clean => ({ who: '', checks: CHECKLIST.map(() => false) })
export const cleanOf = (cleans: Ops['cleans'], roomId: number): Clean => {
  const c = cleans[roomId]
  return c && (!c.done || c.done === today()) ? c : blank()
}
export const patchClean = (roomId: number, p: Partial<Clean>) =>
  useOps.setState((s) => ({ cleans: { ...s.cleans, [roomId]: { ...cleanOf(s.cleans, roomId), ...p } } }))

// ---------- buồng phòng mock: without API_URL only; the rules are hueni-api#166's ----------

const roomOf = (id: number) => usePms.getState().rooms.find((r) => r.id === id)!
const patchRoom = (id: number, p: Partial<Room>) =>
  usePms.setState((s) => ({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...p } : r)) }))

// The row GET /places/:id/housekeeping would send; members are STAFF numbered from 1.
const mockRow = (room: Room): Cleaning | undefined => {
  const c = cleanOf(useOps.getState().cleans, room.id)
  const mine = usePms
    .getState()
    .bookings.filter((b) => b.room_id === room.id && b.status !== 'cancelled' && !b.checked_out_at)
  const base = { room_id: room.id, room_name: room.name, damage_note: room.damage_note, urgent: false }
  if (needsCleaning(room) || c.done === today()) {
    const touched = c.who || c.started || c.done || c.checks.some(Boolean)
    return {
      ...base,
      kind: 'checkout',
      urgent: mine.some((b) => !b.checked_in_at && b.start_date === today()),
      task: touched
        ? {
            id: room.id,
            assignee_id: STAFF.indexOf(c.who) + 1 || undefined,
            assignee_name: c.who || undefined,
            checks: c.checks,
            started_at: c.started ? today() : undefined,
            done_at: c.done,
          }
        : undefined,
    }
  }
  if (mine.some(isStaying)) return { ...base, kind: 'daily' }
}

export const mockHousekeeping = (placeId: number) => ({
  checklist: CHECKLIST,
  rows: usePms
    .getState()
    .rooms.filter((r) => r.place_id === placeId && r.active)
    .flatMap((r) => mockRow(r) || [])
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.kind.localeCompare(b.kind)),
})

export const mockCleaning = {
  change: async (roomId: number, p: { assignee_id?: number; checks?: boolean[]; start?: boolean }) => {
    if (!needsCleaning(roomOf(roomId))) return 'Phòng không cần dọn'
    patchClean(roomId, {
      ...(p.assignee_id !== undefined && { who: STAFF[p.assignee_id - 1] || '' }),
      ...(p.checks && { checks: p.checks }),
      ...(p.start && { started: true }),
    })
    return mockRow(roomOf(roomId))!
  },
  finish: async (roomId: number) => {
    const c = cleanOf(useOps.getState().cleans, roomId)
    if (!needsCleaning(roomOf(roomId))) return 'Phòng không cần dọn'
    if (!c.who) return 'Chọn người dọn trước'
    if (!c.checks.every(Boolean)) return `Đánh dấu đủ ${CHECKLIST.length} việc trước khi xong`
    usePms.getState().actions.clean(roomId)
    patchClean(roomId, { started: true, done: today() })
    return mockRow(roomOf(roomId))!
  },
  undo: async (roomId: number) => {
    patchRoom(roomId, { housekeeping: 'dirty' })
    patchClean(roomId, { done: undefined })
    return mockRow(roomOf(roomId))!
  },
  damage: async (roomId: number, note: string) => {
    patchRoom(roomId, { damage_note: note.trim() || undefined })
    return mockRow(roomOf(roomId))!
  },
}
