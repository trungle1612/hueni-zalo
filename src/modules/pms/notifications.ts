import { useCallback, useEffect, useState } from 'react'

import { API_URL } from '@/constants/common'

import { api, ApiError } from './api'
import { usePms } from './pms.store'

// Thông báo (#71, hueni-api#213): the inbox is built by hueni-api; the app only shows it and sends read marks.

export type NoteType = 'book' | 'money' | 'reg' | 'room' | 'approve' | 'news' | 'channel'
export type Announcement = {
  kind: 'feature' | 'maintenance'
  kicker: string
  title: string
  intro: string | null
  blocks: { h: string | null; ordered: boolean; items: string[] }[]
  note: string | null
  cta: string | null
  cta_path: string | null
}
export type Note = {
  key: string
  type: NoteType
  icon: 'book' | 'money' | 'alert' | 'room' | 'team' | 'news'
  tone: '' | 'err' | 'warn' | 'pos' | 'info'
  title: string
  body: string
  source: string
  at: string
  urgent: boolean
  unread: boolean
  link: { screen: string; id?: number | null } | null
  announcement: Announcement | null
}

// Cài đặt thông báo, in the design's order. channel can't be turned off.
export const NOTE_TYPES: { key: NoteType; label: string; sub: string }[] = [
  { key: 'book', label: 'Đặt phòng mới và huỷ', sub: 'Từ mọi kênh' },
  { key: 'money', label: 'Tiền', sub: 'Người khác thu tiền, giao ca lệch tiền' },
  { key: 'reg', label: 'Khai báo lưu trú', sub: 'Nhắc lúc 08:00 và 21:00 nếu còn khách chưa khai báo' },
  { key: 'room', label: 'Buồng phòng', sub: 'Phòng dọn xong, báo hỏng' },
  { key: 'approve', label: 'Yêu cầu chờ duyệt', sub: 'Hoàn tiền' },
  { key: 'news', label: 'Tính năng mới và bảo trì', sub: 'Từ hueni' },
  { key: 'channel', label: 'Trùng phòng và lỗi kênh', sub: 'Luôn bật vì có thể gây mất khách' },
]

export const noteHref = (link: Note['link']) =>
  link &&
  ({
    booking: link.id ? `/bookings/${link.id}` : undefined,
    channels: '/channels',
    shift: '/shift',
    housekeeping: '/housekeeping',
    approvals: '/staff',
    today: '/',
  }[link.screen] ||
    undefined)

// Made-up inbox for `vite dev` without VITE_API_URL.
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
const MOCK: Note[] = [
  {
    key: 'a1',
    type: 'news',
    icon: 'news',
    tone: 'info',
    title: 'Tính năng mới: xuất hoá đơn điện tử',
    body: 'Xuất hoá đơn ngay từ Phiếu tính tiền và gửi email cho khách.',
    source: 'hueni',
    at: ago(1),
    urgent: false,
    unread: true,
    link: null,
    announcement: {
      kind: 'feature',
      kicker: 'TÍNH NĂNG MỚI',
      title: 'Xuất hoá đơn điện tử từ Phiếu tính tiền',
      intro: 'Khi khách trả phòng, bạn xuất hoá đơn ngay trong app.',
      blocks: [
        { h: 'Có gì mới', ordered: false, items: ['Tự điền tiền phòng và dịch vụ', 'Gửi hoá đơn qua email'] },
        { h: 'Cách dùng', ordered: true, items: ['Mở đặt phòng, chọn Phiếu tính tiền', 'Bấm Xuất hoá đơn'] },
      ],
      note: null,
      cta: null,
      cta_path: null,
    },
  },
  {
    key: 'c1',
    type: 'channel',
    icon: 'alert',
    tone: 'err',
    title: 'Trùng lịch OTA',
    body: 'Airbnb và Chị Hoa · Phòng 104 · 25/10',
    source: 'Kênh OTA',
    at: ago(2),
    urgent: true,
    unread: true,
    link: { screen: 'channels' },
    announcement: null,
  },
  {
    key: 'v1',
    type: 'book',
    icon: 'book',
    tone: '',
    title: 'Đặt phòng mới',
    body: 'Anh Tú 25/10–27/10 · Phòng 104',
    source: 'Booking.com',
    at: ago(3),
    urgent: false,
    unread: true,
    link: { screen: 'today' },
    announcement: null,
  },
  {
    key: 'v2',
    type: 'room',
    icon: 'room',
    tone: '',
    title: 'Dọn xong',
    body: 'Phòng 105',
    source: 'Bé Na',
    at: ago(28),
    urgent: false,
    unread: false,
    link: { screen: 'housekeeping' },
    announcement: null,
  },
]

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Không tải được thông báo.')

// The inbox of one homestay. read / unread change it at once, then tell hueni-api.
export function useNotifications(placeId: number) {
  const [notes, setNotes] = useState<Note[]>()
  const [error, setError] = useState<string>()
  const off = (usePms((s) => s.user.notifications_off) || ['room']) as NoteType[]

  const load = useCallback(async () => {
    if (!API_URL) return setNotes(MOCK)
    try {
      setNotes((await api<{ notifications: Note[] }>(`/places/${placeId}/notifications`)).notifications)
      setError(undefined)
    } catch (e) {
      setError(message(e))
    }
  }, [placeId])
  useEffect(() => {
    load()
  }, [load])

  const mark = (keys: string[], unread: boolean) => {
    setNotes((n) => n?.map((x) => (keys.includes(x.key) ? { ...x, unread } : x)))
    if (API_URL && keys.length)
      api(`/places/${placeId}/notifications/${unread ? 'unread' : 'read'}`, { body: { keys } }).catch(() => {})
  }

  // Cài đặt thông báo: hidden types disappear after the reload.
  const setOff = async (types: NoteType[]) => {
    usePms.setState((s) => ({ user: { ...s.user, notifications_off: types } }))
    if (!API_URL) return setNotes(MOCK.filter((n) => n.type === 'channel' || !types.includes(n.type)))
    try {
      await api('/me/notifications', { method: 'PATCH', body: { off: types } })
      await load()
    } catch (e) {
      setError(message(e))
    }
  }

  return {
    notes: notes?.filter((n) => API_URL || n.type === 'channel' || !off.includes(n.type)),
    error,
    off,
    read: (keys: string[]) => mark(keys, false),
    unread: (keys: string[]) => mark(keys, true),
    setOff,
  }
}
