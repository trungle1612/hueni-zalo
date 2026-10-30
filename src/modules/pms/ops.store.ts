import dayjs from 'dayjs'
import { create } from 'zustand'

import { Booking, GuestDoc, isStaying, occupies, today, usePms } from './pms.store'

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

// Giao ca as hueni-api sends it (GET /places/:id/shift, #27, hueni-api#167): one shift = everything since the last close.
export type Expense = {
  id: number
  amount: number
  reason: string
  at: string
  by: string | null
  user_id: number | null
}
export type ShiftClose = {
  id: number
  at: string
  by: string | null
  opening: number
  expected: number
  counted: number
  difference: number
  denominations: Record<string, number> | null
  keep: number
  handed_to_id: number | null
  handed_to: string | null
  note: string | null
}
export type Shift = {
  since: string | null
  opening: number
  cash_in: number
  cash_out: number
  expenses_total: number
  expected: number
  other: { bank: number; card: number }
  expenses: Expense[]
  last_close: ShiftClose | null
}
export type Clean = { who: string; checks: boolean[]; started?: boolean; done?: string } // done = date

export const OPENING_CASH = 1000000 // mock only: the first shift's opening; hueni-api starts from the last close's keep
export const STAFF = ['Em Hằng', 'Lê Thị Mai', 'Nguyễn Văn Tú'] // ponytail: the place's members, from the API
export const CHECKLIST = [
  'Thay ga, vỏ gối, khăn tắm',
  'Lau phòng tắm, bồn cầu',
  'Hút bụi, lau sàn',
  'Bổ sung nước suối, giấy, xà phòng',
  'Kiểm tra đồ để quên, đồ hỏng',
]

export type Ops = {
  expenses: (Expense & { place_id: number })[]
  closes: (ShiftClose & { place_id: number })[]
  cleans: Record<number, Clean> // by room id, today's only
}

export const useOps = create<Ops>(() => ({
  expenses: [
    {
      place_id: 1,
      id: 1,
      amount: 150000,
      reason: 'Mua nước suối, giấy vệ sinh',
      at: new Date().toISOString(),
      by: 'Em Hằng',
      user_id: null,
    },
  ],
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

// Mock Giao ca for `vite dev` without the API; the server computes all this (hueni-api#167) and checks the close.
export function mockShift(placeId: number): Shift {
  const { expenses, closes } = useOps.getState()
  const last_close = closes.filter((c) => c.place_id === placeId).pop() || null
  const since = last_close?.at || null
  const after = (at: string) => (since ? dayjs(at).isAfter(since) : dayjs(at).isSame(dayjs(), 'day'))
  const { rooms, bookings } = usePms.getState()
  const ids = new Set(rooms.filter((r) => r.place_id === placeId).map((r) => r.id))
  const pays = bookings.filter((b) => ids.has(b.room_id)).flatMap((b) => (b.payments || []).filter((p) => after(p.at)))
  const sum = (method: string, sign = 0) =>
    pays.filter((p) => p.method === method && (!sign || Math.sign(p.amount) === sign)).reduce((n, p) => n + p.amount, 0)
  const spends = expenses.filter((e) => e.place_id === placeId && after(e.at))
  const opening = last_close ? last_close.keep : OPENING_CASH
  const cash_in = sum('cash', 1)
  const cash_out = -sum('cash', -1)
  const expenses_total = spends.reduce((n, e) => n + e.amount, 0)
  return {
    since,
    opening,
    cash_in,
    cash_out,
    expenses_total,
    expected: opening + cash_in - cash_out - expenses_total,
    other: { bank: sum('bank'), card: sum('card') },
    expenses: spends,
    last_close,
  }
}
