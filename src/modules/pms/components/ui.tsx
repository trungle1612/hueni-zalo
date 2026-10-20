import React from 'react'
import { Button, Header, Icon, Select, useNavigate } from 'zmp-ui'

import { clsx } from '@/utils/clsx'

import { usePms } from '../pms.store'

type TagTone = 'gray' | 'stone' | 'red' | 'amber' | 'green' | 'blue' | 'violet'
const TONE: Record<TagTone, string> = {
  gray: 'bg-gray-100 text-gray-800',
  stone: 'bg-stone-200 text-stone-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-900',
  green: 'bg-emerald-100 text-emerald-900',
  blue: 'bg-sky-100 text-sky-900',
  violet: 'bg-violet-100 text-violet-900',
}

export function Tag({
  tone = 'gray',
  className,
  children,
}: {
  tone?: TagTone
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium whitespace-nowrap',
        className || TONE[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx('bg-white rounded-2xl', className)}>{children}</div>
}

export function CallButton({ phone }: { phone?: string }) {
  if (!phone) return null
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, '')}`}
      aria-label={`Gọi ${phone}`}
      className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-800 shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <Icon icon="zi-call" size={22} />
    </a>
  )
}

export function RoleTag({ role }: { role: 'owner' | 'staff' }) {
  return <Tag tone={role === 'owner' ? 'blue' : 'gray'}>{role === 'owner' ? 'Chủ' : 'Nhân viên'}</Tag>
}

// A ⚠ that is a real icon with a spoken label, not an emoji.
export function WarnIcon({ label, size = 16 }: { label: string; size?: number }) {
  return (
    <span role="img" aria-label={label} className="inline-flex text-red-700 shrink-0">
      <Icon icon="zi-warning-solid" size={size} />
    </span>
  )
}

// Homestay picker, shown only to people in 2+ homestays.
export function PlacePicker() {
  const { places, currentSlug, actions } = usePms()
  if (places.length < 2) return null
  return (
    <Select label="Homestay" value={currentSlug} onChange={(v) => actions.setPlace(String(v))} closeOnSelect>
      {places.map((p) => (
        <Select.Option key={p.slug} value={p.slug} title={`${p.name} · ${p.role === 'owner' ? 'Chủ' : 'Nhân viên'}`} />
      ))}
    </Select>
  )
}

export function Empty({ children, action }: { children: React.ReactNode; action?: { label: string; to: string } }) {
  const navigate = useNavigate()
  return (
    <div className="text-center text-text-secondary text-base py-10 px-6 space-y-4">
      <div>{children}</div>
      {action && (
        <Button variant="secondary" onClick={() => navigate(action.to)}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

// Opened from a Zalo notification there is no history: back goes home instead of nowhere.
export function BackHeader({ title }: { title: string }) {
  const navigate = useNavigate()
  return (
    <Header
      title={title}
      onBackClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/', { replace: true }))}
    />
  )
}

// A full-width 48px row that reads as tappable: label left, chevron right.
export function LinkRow({
  children,
  onClick,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  tone?: 'default' | 'red'
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full min-h-[48px] flex items-center justify-between gap-2 px-4 rounded-xl border-0 text-left text-base font-medium',
        tone === 'red' ? 'bg-red-50 text-red-800' : 'bg-ng-10 text-text',
      )}
    >
      <span className="flex items-center gap-2 min-w-0">{children}</span>
      <Icon icon="zi-chevron-right" size={20} />
    </button>
  )
}
