import './notifications.scss'

import dayjs from 'dayjs'
import React, { useState } from 'react'
import { useNavigate } from 'zmp-ui'

import { AppBar, Icon, Screen, Sheet, toast, useCurrent } from '@/modules/pms/components/ui'
import { Note, NOTE_TYPES, noteHref, useNotifications } from '@/modules/pms/notifications'

const ICONS: Record<Note['icon'], React.ReactNode> = {
  book: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  money: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  alert: <path d="M12 3l10 18H2zM12 10v4M12 18h0" />,
  room: <path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />,
  team: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 21a7 7 0 0 1 14 0M16 4a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3" />
    </>
  ),
  news: <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />,
}

type Filter = 'all' | 'unread' | 'action'

const groupOf = (at: string) => {
  const d = dayjs(at)
  return d.isSame(dayjs(), 'day') ? 'Hôm nay' : d.isSame(dayjs().subtract(1, 'day'), 'day') ? 'Hôm qua' : 'Trước đó'
}
const when = (at: string) => (groupOf(at) === 'Trước đó' ? dayjs(at).format('DD/MM') : dayjs(at).format('HH:mm'))

// Thông báo (#71): what happened at the homestay in the last 30 days, built by hueni-api (#213).
export default function NotificationsPage() {
  const { place } = useCurrent()
  const navigate = useNavigate()
  const { notes, error, off, read, unread, setOff } = useNotifications(place.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Note>()
  const [settings, setSettings] = useState(false)

  const all = notes || []
  const unreadCount = all.filter((n) => n.unread).length
  const actionCount = all.filter((n) => n.unread && n.urgent).length
  const shown = all.filter((n) => filter === 'all' || (n.unread && (filter === 'unread' || n.urgent)))
  const groups = ['Hôm nay', 'Hôm qua', 'Trước đó']
    .map((label) => ({ label, items: shown.filter((n) => groupOf(n.at) === label) }))
    .filter((g) => g.items.length)

  function tap(n: Note) {
    if (n.unread) read([n.key])
    if (n.announcement) return setOpen(n)
    const href = noteHref(n.link)
    if (href) navigate(href)
  }

  function readAll() {
    const keys = all.filter((n) => n.unread).map((n) => n.key)
    read(keys)
    toast(`Đã đánh dấu ${keys.length} thông báo là đã đọc`, () => unread(keys))
  }

  return (
    <Screen>
      <AppBar title="Thông báo" sub={unreadCount ? `${unreadCount} chưa đọc` : 'Đã đọc hết'} lead="back">
        <button type="button" className="icon-btn" aria-label="Cài đặt thông báo" onClick={() => setSettings(true)}>
          <Icon name="settings" />
        </button>
      </AppBar>
      <div className="seg nt-tabs" role="group" aria-label="Lọc thông báo">
        {(
          [
            ['all', 'Tất cả', 0],
            ['unread', 'Chưa đọc', unreadCount],
            ['action', 'Cần xử lý', actionCount],
          ] as const
        ).map(([key, label, count]) => (
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
            {count > 0 && <small>{count}</small>}
          </button>
        ))}
        <button type="button" className="nt-all" disabled={!unreadCount} onClick={readAll}>
          Đọc hết
        </button>
      </div>
      <main className="scroll">
        {error && (
          <div className="sec">
            <p className="notice err" role="alert">
              {error}
            </p>
          </div>
        )}
        {notes && !shown.length && (
          <div className="empty">
            <b>
              {filter === 'action'
                ? 'Không có việc cần xử lý'
                : filter === 'unread'
                  ? 'Không có thông báo chưa đọc'
                  : 'Chưa có thông báo'}
            </b>
            {filter === 'action'
              ? 'Trùng phòng, lỗi kênh và yêu cầu chờ duyệt sẽ hiện ở đây.'
              : 'Thông báo mới sẽ hiện ở đây.'}
          </div>
        )}
        {groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="nt-grp">{g.label}</h2>
            <div className="panel nt-list">
              {g.items.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  className={n.unread ? 'nt unread' : 'nt'}
                  aria-label={`${n.unread ? 'Chưa đọc. ' : ''}${n.title}. ${n.body}`}
                  onClick={() => tap(n)}
                >
                  <span className={`nt-ic ${n.tone}`} aria-hidden="true">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {ICONS[n.icon]}
                    </svg>
                  </span>
                  <span className="grow">
                    <span className="nt-t">{n.title}</span>
                    {n.body && <span className="nt-b">{n.body}</span>}
                    <span className="nt-m">
                      {when(n.at)} · {n.source}
                    </span>
                  </span>
                  {n.unread && <span className="nt-dot" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </section>
        ))}
        {shown.length > 0 && <p className="help nt-keep">Thông báo được giữ 30 ngày.</p>}
      </main>

      {open?.announcement && (
        <Sheet title={open.announcement.title} onClose={() => setOpen(undefined)} className="nt-sheet">
          <p className="nt-kicker">{open.announcement.kicker}</p>
          {open.announcement.intro && <p>{open.announcement.intro}</p>}
          {open.announcement.blocks.map((b, i) => (
            <div key={i}>
              {b.h && <h3>{b.h}</h3>}
              {React.createElement(
                b.ordered ? 'ol' : 'ul',
                null,
                b.items.map((x, j) => <li key={j}>{x}</li>),
              )}
            </div>
          ))}
          {open.announcement.note && <p className="notice info">{open.announcement.note}</p>}
          {open.announcement.cta && open.announcement.cta_path && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => navigate(open.announcement!.cta_path!)}
            >
              {open.announcement.cta}
            </button>
          )}
          <button type="button" className="btn btn-block" onClick={() => setOpen(undefined)}>
            {open.announcement.kind === 'maintenance' ? 'Đã hiểu' : 'Để sau'}
          </button>
        </Sheet>
      )}

      {settings && (
        <Sheet title="Cài đặt thông báo" onClose={() => setSettings(false)}>
          <p className="help">
            Áp dụng cho tài khoản của bạn. Bạn chỉ nhận loại thông báo mà vai trò của mình được xem.
          </p>
          {NOTE_TYPES.map((t) => {
            const on = t.key === 'channel' || !off.includes(t.key)
            return (
              <div key={t.key} className="switch-row">
                <div>
                  <div className="nt-t">{t.label}</div>
                  <p className="help">{t.sub}</p>
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={on}
                  aria-label={t.label}
                  disabled={t.key === 'channel'}
                  onClick={() => setOff(on ? [...off, t.key] : off.filter((k) => k !== t.key))}
                >
                  <span />
                </button>
              </div>
            )
          })}
          <button type="button" className="btn btn-primary btn-block" onClick={() => setSettings(false)}>
            Xong
          </button>
        </Sheet>
      )}
    </Screen>
  )
}
