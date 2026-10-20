import React, { useState } from 'react'
import { Button, Input, Modal, useSnackbar } from 'zmp-ui'

import { Booking, canCheckIn, conflicts, fmtDate, fmtRange, guestLabel, isStaying, Room, usePms } from '../pms.store'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary'

type ConfirmProps = {
  label: string
  title: string
  confirmText?: string
  success: string
  onConfirm: () => string | void
  variant?: ButtonVariant
  danger?: boolean
  fullWidth?: boolean
  canConfirm?: boolean
  children?: React.ReactNode
}

// Errors stay long enough to read; successes are quick.
export function useNotify() {
  const { openSnackbar } = useSnackbar()
  return (error: string | void, success: string, undo?: () => void) =>
    openSnackbar({
      text: error || success,
      type: error ? 'error' : 'success',
      duration: error ? 6000 : undo ? 5000 : 2500,
      ...(undo && !error ? { action: { text: 'Hoàn tác', close: true, onClick: undo } } : {}),
    })
}

// Every front-desk action asks again before it records anything (wiki §6g).
// Dialog buttons are filled and full-width: the confirm is the most important tap on the screen.
export function ConfirmButton({
  label,
  title,
  confirmText = label,
  success,
  onConfirm,
  variant = 'primary',
  danger,
  fullWidth,
  canConfirm = true,
  children,
}: ConfirmProps) {
  const [open, setOpen] = useState(false)
  const notify = useNotify()

  function confirm() {
    const error = onConfirm()
    setOpen(false)
    notify(error, success)
  }

  return (
    <>
      <Button
        size="medium"
        variant={variant}
        type={danger ? 'danger' : undefined}
        fullWidth={fullWidth}
        onClick={(e) => (e.stopPropagation(), setOpen(true))}
      >
        {label}
      </Button>
      <Modal visible={open} title={title} onClose={() => setOpen(false)}>
        <div className="space-y-4 text-left">
          {children}
          <div className="space-y-2 pt-1">
            <Button
              fullWidth
              size="medium"
              type={danger ? 'danger' : undefined}
              disabled={!canConfirm}
              onClick={confirm}
            >
              {confirmText}
            </Button>
            <Button fullWidth size="medium" variant="tertiary" onClick={() => setOpen(false)}>
              Thôi
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul className="space-y-1 list-none p-0 m-0">
      {items.map((w) => (
        <li key={w} className="text-base text-amber-900 bg-amber-50 rounded-xl px-3 py-2">
          <span className="font-semibold">Lưu ý: </span>
          {w}
        </li>
      ))}
    </ul>
  )
}

type StayProps = { booking: Booking; room: Room; fullWidth?: boolean; variant?: ButtonVariant }

export function CheckInButton({ booking, room, fullWidth, variant }: StayProps) {
  const { bookings, actions } = usePms()
  const [guests, setGuests] = useState('')
  if (!canCheckIn(booking)) return null

  // Check-in records a fact: these warn but never block. A guest still in the room does block.
  if (bookings.some((b) => b.id !== booking.id && b.room_id === booking.room_id && isStaying(b))) {
    return <span className="text-base text-text-secondary self-center">Phòng còn khách, chưa nhận phòng được</span>
  }

  const count = booking.guests || Number(guests)
  const clash = conflicts(bookings).find((c) => c.manual.id === booking.id || c.ota.id === booking.id)
  const other = clash && (clash.manual.id === booking.id ? clash.ota : clash.manual)
  const warnings = [
    other && `trùng lịch đêm ${fmtDate(other.start_date)} với ${guestLabel(other)} (${fmtRange(other)})`,
    count > room.max_guests && `${count} khách, phòng tối đa ${room.max_guests}`,
    room.housekeeping === 'dirty' && 'phòng chưa dọn',
  ].filter(Boolean) as string[]

  return (
    <ConfirmButton
      label="Nhận phòng"
      title={`${guestLabel(booking)} nhận phòng ${room.name}?`}
      success={`${guestLabel(booking)} đã nhận phòng ${room.name}`}
      fullWidth={fullWidth}
      variant={variant}
      canConfirm={count >= 1}
      onConfirm={() => actions.checkIn(booking.id, count)}
    >
      {!booking.guests && (
        <Input
          type="number"
          label={`Số khách (tối đa ${room.max_guests})`}
          inputMode="numeric"
          value={guests}
          onChange={(e) => setGuests(e.target.value)}
        />
      )}
      <Warnings items={warnings} />
    </ConfirmButton>
  )
}

export function EarlyCheckInButton({ booking, room, fullWidth }: StayProps) {
  const actions = usePms((s) => s.actions)
  return (
    <ConfirmButton
      label="Nhận phòng sớm"
      title={`${guestLabel(booking)} nhận phòng sớm ${room.name}?`}
      success={`${guestLabel(booking)} đã nhận phòng sớm`}
      variant="secondary"
      fullWidth={fullWidth}
      onConfirm={() => actions.earlyCheckIn(booking.id)}
    >
      <p className="text-base m-0">Ngày đến đổi từ {fmtDate(booking.start_date)} thành hôm nay.</p>
    </ConfirmButton>
  )
}

export function CheckOutButton({ booking, room, fullWidth, variant }: StayProps) {
  const actions = usePms((s) => s.actions)
  if (!isStaying(booking)) return null
  return (
    <ConfirmButton
      label="Trả phòng"
      title={`${guestLabel(booking)} trả phòng ${room.name}?`}
      success={`Đã trả phòng. Phòng ${room.name} cần dọn`}
      fullWidth={fullWidth}
      variant={variant}
      onConfirm={() => actions.checkOut(booking.id)}
    >
      <p className="text-base text-text-secondary m-0">Phòng chuyển sang Chưa dọn. Các đêm còn lại trống ngay.</p>
    </ConfirmButton>
  )
}

export function NoShowButton({ booking }: { booking: Booking }) {
  const actions = usePms((s) => s.actions)
  if (booking.source !== 'manual' || booking.checked_in_at) return null
  return (
    <ConfirmButton
      label="Khách không đến"
      title={`${guestLabel(booking)} không đến?`}
      confirmText="Khách không đến"
      success="Đã ghi khách không đến. Phòng trống lại"
      variant="tertiary"
      danger
      onConfirm={() => actions.noShow(booking.id)}
    >
      <p className="text-base text-text-secondary m-0">
        Đặt phòng {fmtRange(booking)} sẽ bị huỷ, ghi chú "Không đến". Phòng trống lại ngay.
      </p>
    </ConfirmButton>
  )
}

export function DeclareButton({ booking, fullWidth }: { booking: Booking; fullWidth?: boolean }) {
  const actions = usePms((s) => s.actions)
  const notify = useNotify()
  if (!isStaying(booking) || booking.declared_at) return null
  return (
    <Button
      size="medium"
      variant="secondary"
      fullWidth={fullWidth}
      onClick={(e) => {
        e.stopPropagation()
        actions.declare(booking.id)
        notify(undefined, 'Đã ghi: đã khai báo lưu trú', () => actions.undeclare(booking.id))
      }}
    >
      Đánh dấu đã khai báo
    </Button>
  )
}

export function CleanButton({ room, fullWidth }: { room: Room; fullWidth?: boolean }) {
  const actions = usePms((s) => s.actions)
  const notify = useNotify()
  if (room.housekeeping !== 'dirty') return null
  return (
    <Button
      size="medium"
      variant="secondary"
      fullWidth={fullWidth}
      onClick={(e) => {
        e.stopPropagation()
        actions.clean(room.id)
        notify(undefined, `Phòng ${room.name} đã dọn xong`, () => actions.unclean(room.id))
      }}
    >
      Dọn xong
    </Button>
  )
}
