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
