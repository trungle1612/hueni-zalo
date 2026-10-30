import React, { useEffect, useId, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { openPhone, openWebview } from 'zmp-sdk'
import { Page, useNavigate } from 'zmp-ui'
import { create } from 'zustand'

import { API_URL } from '@/constants/common'
import { clsx } from '@/utils/clsx'

import { Booking, fmtDay, holdUntil, isStaying, placeRooms, today, usePlace, usePms } from '../pms.store'

// ---------- icons (design: only the tab bar, back/close, search and week arrows) ----------

const ICON = {
  back: <path d="M15 5l-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  prev: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  today: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  rooms: (
    <>
      <path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />
      <circle cx="7" cy="11" r="1.5" />
    </>
  ),
  report: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
}

export function Icon({ name, size = 20, stroke = 2 }: { name: keyof typeof ICON; size?: number; stroke?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON[name]}
    </svg>
  )
}

export function Spinner() {
  return (
    <svg
      className="spin"
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  )
}

// ---------- navigation ----------

// A real <a href> that routes through zmp's navigator.
export function A({
  to,
  replace,
  animate,
  ...rest
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; replace?: boolean; animate?: boolean }) {
  const navigate = useNavigate()
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        e.preventDefault()
        rest.onClick?.(e)
        navigate(to, { replace, animate })
      }}
    />
  )
}

// Opened from a Zalo notification there is no history: back goes home instead of nowhere.
export function useBack(fallback = '/') {
  const navigate = useNavigate()
  return () => (window.history.length > 1 ? navigate(-1) : navigate(fallback, { replace: true }))
}

export type TabKey = '/' | '/calendar' | '/rooms' | '/report' | '/more'
const TABS: { to: TabKey; label: string; icon: keyof typeof ICON }[] = [
  { to: '/', label: 'Hôm nay', icon: 'today' },
  { to: '/calendar', label: 'Lịch', icon: 'calendar' },
  { to: '/rooms', label: 'Phòng', icon: 'rooms' },
  { to: '/report', label: 'Báo cáo', icon: 'report' },
  { to: '/more', label: 'Thêm', icon: 'more' },
]

// Always five items: staff without the report still see Báo cáo and get the permission screen.
function TabBar({ active }: { active: TabKey }) {
  return (
    <nav className="nav" aria-label="Điều hướng chính">
      {TABS.map((t) => (
        <A
          key={t.to}
          to={t.to}
          replace
          animate={false}
          className="tab"
          aria-current={t.to === active ? 'page' : undefined}
        >
          <Icon name={t.icon} size={22} stroke={1.75} />
          {t.label}
        </A>
      ))}
    </nav>
  )
}

// One screen: app bar, scroll area, then tab bar or a fixed action bar. Signed-out users go to Đăng nhập.
export function Screen({
  children,
  tab,
  plain,
  open,
}: {
  children: React.ReactNode
  tab?: TabKey
  plain?: boolean
  open?: boolean // the login screen
}) {
  const signedIn = usePms((s) => s.signedIn)
  if (!open && !signedIn) return <Navigate to="/login" replace />
  return (
    <Page className={clsx('pms', plain && 'plain')} resetScroll={false}>
      {children}
      {tab && <TabBar active={tab} />}
    </Page>
  )
}

export function AppBar({
  title,
  sub,
  lead,
  onLead,
  children,
}: {
  title: React.ReactNode
  sub?: React.ReactNode
  lead?: 'back' | 'close'
  onLead?: () => void
  children?: React.ReactNode
}) {
  const back = useBack()
  return (
    <header className={clsx('bar', lead && 'has-back')}>
      {lead && (
        <button
          type="button"
          className="icon-btn"
          aria-label={lead === 'back' ? 'Quay lại' : 'Đóng'}
          onClick={onLead || back}
        >
          <Icon name={lead} />
        </button>
      )}
      <div className="bar-t">
        <h1>{title}</h1>
        {sub && <span>{sub}</span>}
      </div>
      {children}
    </header>
  )
}

// "T4 21/10/2026 · Nhà Sen"; with 2+ homestays the line is a native picker.
export function PlaceSub({ prefix }: { prefix?: string }) {
  const { places, currentSlug, actions } = usePms()
  const place = usePlace()
  const text = [prefix, place.name].filter(Boolean).join(' · ')
  if (places.length < 2) return <>{text}</>
  return (
    <>
      {text} ▾
      <select aria-label="Chọn cơ sở" value={currentSlug} onChange={(e) => actions.setPlace(e.target.value)}>
        {places.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name} · {p.role === 'owner' ? 'Chủ' : 'Lễ tân'}
          </option>
        ))}
      </select>
    </>
  )
}

export const todayLine = () => `${fmtDay(today())}/${today().slice(0, 4)}`

// The current homestay and its rooms; everything on the tabs is scoped to it.
export function useCurrent() {
  const place = usePlace()
  const all = usePms((s) => s.rooms)
  const rooms = placeRooms(all, place.id).sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'vi', { numeric: true }),
  )
  const roomOf = (id: number) => all.find((r) => r.id === id)
  return { place, rooms, roomOf }
}

// ---------- content ----------

export function Sec({
  title,
  aside,
  children,
  className,
}: {
  title?: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section className={clsx('sec', className)} aria-labelledby={title ? id : undefined}>
      {title && (
        <h2 id={id} className="sec-h">
          <span>{title}</span>
          {aside}
        </h2>
      )}
      {children}
    </section>
  )
}

export function KV({
  label,
  children,
  total,
  tone,
}: {
  label: React.ReactNode
  children: React.ReactNode
  total?: boolean
  tone?: 'warn' | 'pos'
}) {
  return (
    <div className={clsx('kv', total && 'total')}>
      <dt>{label}</dt>
      <dd className={tone}>{children}</dd>
    </div>
  )
}

export type Tone = 'positive' | 'info' | 'warning' | 'neutral' | 'danger' | 'primary'

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>
}

// The one status a booking shows, with a line saying what it means.
export function bookingStatus(b: Booking): { label: string; tone: Tone } {
  if (b.status === 'cancelled') return { label: 'Đã huỷ', tone: 'danger' }
  if (b.checked_out_at) return { label: 'Đã trả phòng', tone: 'neutral' }
  if (isStaying(b))
    return b.end_date <= today() ? { label: 'Trả hôm nay', tone: 'neutral' } : { label: 'Đang ở', tone: 'primary' }
  if (b.status === 'hold') return { label: 'Giữ chỗ', tone: 'warning' }
  const hold = holdUntil(b)
  if (hold) return { label: hold[0].toUpperCase() + hold.slice(1), tone: 'warning' }
  return { label: 'Sắp đến', tone: 'info' }
}

// ---------- overlays ----------

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  // A real modal: focus moves in, Tab stays inside, the page behind is inert, focus returns on close.
  useEffect(() => {
    const el = ref.current!
    const prev = document.activeElement as HTMLElement | null
    el.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close.current()
      if (e.key !== 'Tab') return
      const items = el.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      )
      if (!items.length) return
      const [first, last] = [items[0], items[items.length - 1]]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    // Not the sheet's own ancestors: a sheet rendered inside <main> would go inert with it (/staff froze).
    const behind = Array.from(el.closest('.zaui-page')?.children || []).filter(
      (c) => !c.contains(el) && !c.classList.contains('scrim'),
    )
    behind.forEach((c) => c.setAttribute('inert', ''))
    return () => {
      window.removeEventListener('keydown', onKey)
      behind.forEach((c) => c.removeAttribute('inert'))
      prev?.focus?.()
    }
  }, [])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </>
  )
}

type ToastState = { text: string; undo?: () => void; key: number } | null
const useToastStore = create<{ toast: ToastState }>(() => ({ toast: null }))

// Result of an action, 6 s, with Hoàn tác. Errors belong under the field, not here.
let toastTimer: ReturnType<typeof setTimeout> | undefined
const hideLater = () => {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => useToastStore.setState({ toast: null }), 6000)
}

// Holding a finger on it or focusing it keeps it open (WCAG 2.2.1); the 6 s restart when let go.
export function toast(text: string, undo?: () => void) {
  useToastStore.setState({ toast: { text, undo, key: Date.now() } })
  hideLater()
}

// Record an action: run it, toast on success. Returns the error, if any; a sheet shows it, else the toast does.
// Mock data: Hoàn tác puts the snapshot back. hueni-api: no Hoàn tác here (the owner undoes check-in /
// check-out on the booking page), a refused action toasts the server's sentence.
export function useRecord() {
  const actions = usePms((s) => s.actions)
  return async (run: () => string | void | Promise<string | void>, text: string) => {
    const snap = API_URL ? undefined : actions.snapshot()
    const error = await run()
    if (error) {
      if (snap) actions.restore(snap)
      toast(error)
      return error
    }
    toast(text, snap && (() => actions.restore(snap)))
  }
}

export function ToastHost() {
  const t = useToastStore((s) => s.toast)
  if (!t) return null
  return (
    <div
      className="pms-toast"
      role="status"
      onPointerDown={() => clearTimeout(toastTimer)}
      onPointerUp={hideLater}
      onFocus={() => clearTimeout(toastTimer)}
      onBlur={hideLater}
    >
      <span>{t.text}</span>
      {t.undo && (
        <button
          type="button"
          onClick={() => {
            t.undo?.()
            useToastStore.setState({ toast: null })
          }}
        >
          Hoàn tác
        </button>
      )}
    </div>
  )
}

// ---------- forms ----------

type FieldInput = { id: string; className: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }

export function Field({
  label,
  optional,
  error,
  help,
  hideLabel,
  aside,
  changed,
  children,
}: {
  label: string
  optional?: boolean
  error?: string | false
  help?: React.ReactNode
  hideLabel?: boolean
  aside?: React.ReactNode
  changed?: boolean
  children: (input: FieldInput) => React.ReactNode
}) {
  const id = useId()
  const lbl = (
    <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
      {label}
      {optional && <span className="opt"> · nếu có</span>}
    </label>
  )
  return (
    <div className="field">
      {aside ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {lbl}
          {aside}
        </div>
      ) : (
        lbl
      )}
      {children({
        id,
        className: clsx('input', error ? 'err' : changed && 'changed'),
        'aria-invalid': !!error || undefined,
        'aria-describedby': error || help ? `${id}-d` : undefined,
      })}
      {error ? (
        <div id={`${id}-d`} className="error">
          {error}
        </div>
      ) : (
        help && (
          <div id={`${id}-d`} className="help">
            {help}
          </div>
        )
      )}
    </div>
  )
}

const dots = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// Money in đồng: digits only, dots inserted as you type.
export function MoneyInput({
  value,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value?: number
  onChange: (n?: number) => void
}) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={value === undefined ? '' : dots(value)}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, '')
        onChange(d ? Number(d) : undefined)
      }}
    />
  )
}

export const phoneDigits = (s?: string) => (s || '').replace(/\D/g, '')

// Gọi / Nhắn Zalo for a guest's phone. Zalo's webview ignores tel: links and target=_blank, so these go through
// zmp-sdk; outside Zalo (a browser in dev) they fall back to the plain links.
export function ContactButtons({ phone }: { phone?: string }) {
  const digits = phoneDigits(phone)
  if (!digits) return null
  const dial = phone!.trim().startsWith('+') ? `+${digits}` : digits
  // zalo.me/<số> opens the chat with that Zalo account; it wants the local 0… form for Vietnamese numbers.
  const zalo = digits.startsWith('84') && digits.length === 11 ? `0${digits.slice(2)}` : digits
  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => openPhone({ phoneNumber: dial }).catch(() => (window.location.href = `tel:${dial}`))}
      >
        Gọi
      </button>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() =>
          openWebview({ url: `https://zalo.me/${zalo}`, config: { style: 'normal' } }).catch(() =>
            window.open(`https://zalo.me/${zalo}`, '_blank', 'noopener'),
          )
        }
      >
        Nhắn Zalo
      </button>
    </>
  )
}
export const PHONE_ERROR = 'Số điện thoại cần ít nhất 9 chữ số.'

// Joined buttons for one choice (payment method, booking status).
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="segbox" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}
