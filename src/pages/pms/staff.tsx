import './setup.scss'

import React, { useState } from 'react'

import { API_URL } from '@/constants/common'
import {
  AppBar,
  Badge,
  Field,
  phoneDigits,
  Screen,
  Sec,
  Segmented,
  Sheet,
  toast,
  useCurrent,
} from '@/modules/pms/components/ui'
import { can, fmtTime, money, usePms } from '@/modules/pms/pms.store'
import { useActivity } from '@/modules/pms/remote'
import {
  audit,
  AuditEntry,
  AuditKind,
  Perm,
  PERMS,
  ROLE_NAME,
  Staff,
  StaffRole,
  useSetup,
} from '@/modules/pms/setup.store'

import { Denied } from './rates'

const ROLES: [Exclude<StaffRole, 'owner'>, string][] = [
  ['mgr', 'Quản lý'],
  ['fd', 'Lễ tân'],
  ['hk', 'Buồng phòng'],
]
const MAX_ACCOUNTS = 8

// People's actions from the booking log, sorted into the owner's filters. OTA sync lines are not people.
const kindOf = (action: string): AuditKind =>
  /huỷ/i.test(action)
    ? 'cancel'
    : /thu tiền|hoàn tiền|giảm giá|ca\b/i.test(action)
      ? 'money'
      : /giá/i.test(action)
        ? 'price'
        : 'other'

export default function StaffPage() {
  const { place } = useCurrent()
  const [tab, setTab] = useState<'staff' | 'log'>('staff')
  const req = useSetup((s) => s.refundRequest)

  if (!can(place, 'manage')) return <Denied />

  function settle(ok: boolean) {
    if (!req) return
    if (ok)
      audit({
        k: 'money',
        action: `Duyệt hoàn cọc · ${req.booking}`,
        before: 'Chờ duyệt',
        after: `Hoàn ${money(req.amount)}`,
        note: 'Chuyển khoản trả khách',
        who: usePms.getState().user.name,
      })
    useSetup.setState({ refundRequest: undefined })
    toast(ok ? `Đã duyệt. ${req.who} nhận thông báo để chuyển trả khách.` : 'Đã từ chối. Cọc giữ lại, ghi vào nhật ký.')
  }

  return (
    <Screen>
      <AppBar lead="back" title="Nhân viên và nhật ký" sub="Chỉ chủ cơ sở xem được trang này" />
      <div className="seg" role="group" aria-label="Mục">
        <button type="button" aria-pressed={tab === 'staff'} onClick={() => setTab('staff')}>
          Nhân viên
        </button>
        <button type="button" aria-pressed={tab === 'log'} onClick={() => setTab('log')}>
          Nhật ký
        </button>
      </div>
      <main className="scroll">
        {req && (
          <div className="sec">
            <div className="approve" role="region" aria-label="Chờ duyệt">
              <b>Yêu cầu hoàn cọc {money(req.amount)}</b>
              <span className="help">{req.text}</span>
              <div className="actions">
                <button type="button" className="btn btn-sm" onClick={() => settle(false)}>
                  Từ chối
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => settle(true)}>
                  Duyệt hoàn cọc
                </button>
              </div>
            </div>
          </div>
        )}
        {tab === 'staff' ? <People /> : <Log />}
        <div className="end" />
      </main>
    </Screen>
  )
}

function People() {
  const staff = useSetup((s) => s.staff)
  const [open, setOpen] = useState<Staff>()
  const [inviting, setInviting] = useState(false)

  return (
    <Sec
      title={`${staff.length} / ${MAX_ACCOUNTS} tài khoản`}
      aside={
        staff.length < MAX_ACCOUNTS && (
          <button type="button" className="link" onClick={() => setInviting(true)}>
            + Mời nhân viên
          </button>
        )
      }
    >
      <div className="panel">
        {staff.map((p) => (
          <button
            key={p.id}
            type="button"
            className="row"
            aria-label={`${p.name}, ${ROLE_NAME[p.role]}`}
            onClick={() => setOpen(p)}
          >
            <span className="av" aria-hidden="true">
              {p.invited ? '?' : p.name.split(' ').pop()![0]}
            </span>
            <span className="grow">
              <span className="t1">{p.name}</span>
              <span className="t2">{p.role === 'owner' ? p.sub : `${ROLE_NAME[p.role]} · ${p.sub}`}</span>
            </span>
            {p.locked ? (
              <Badge tone="danger">Đã khoá</Badge>
            ) : (
              p.invited && <Badge tone="warning">Chờ nhận lời mời</Badge>
            )}
          </button>
        ))}
      </div>
      <p className="help" style={{ marginTop: 8 }}>
        Gói hiện tại cho tối đa {MAX_ACCOUNTS} tài khoản.
      </p>
      {open && <PersonSheet p={open} onClose={() => setOpen(undefined)} />}
      {inviting && <InviteSheet onClose={() => setInviting(false)} />}
    </Sec>
  )
}

function PersonSheet({ p, onClose }: { p: Staff; onClose: () => void }) {
  const [role, setRole] = useState(p.role)
  const [perms, setPerms] = useState(p.perms)
  const [lockAsk, setLockAsk] = useState(false)
  const patch = (x: Partial<Staff>) =>
    useSetup.setState((s) => ({ staff: s.staff.map((y) => (y.id === p.id ? { ...y, ...x } : y)) }))

  if (p.role === 'owner')
    return (
      <Sheet title={p.name} onClose={onClose}>
        <div className="notice info">Bạn là chủ cơ sở. Chuyển quyền chủ cần xác nhận bằng mã gửi qua Zalo.</div>
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
          Đóng
        </button>
      </Sheet>
    )

  function lock() {
    if (p.locked) {
      patch({ locked: false })
      onClose()
      return toast(`Đã mở khoá ${p.name}`)
    }
    if (!lockAsk) return setLockAsk(true)
    patch({ locked: true })
    audit({ k: 'other', action: `Khoá tài khoản ${p.name}`, who: usePms.getState().user.name })
    onClose()
    toast(`Đã khoá ${p.name}`)
  }

  return (
    <Sheet title={p.name} onClose={onClose}>
      <div className="field">
        <span className="lbl">Vai trò</span>
        <Segmented label="Vai trò" value={role as (typeof ROLES)[number][0]} options={ROLES} onChange={setRole} />
      </div>
      <div className="field">
        <span className="lbl">Quyền thêm</span>
        <div className="panel">
          {PERMS.map(([k, label, sub]) => {
            const forced = role === 'mgr' && k !== 'rate'
            const blocked = role === 'hk'
            const on = forced || (!blocked && !!perms[k])
            return (
              <div key={k} className="switch-row perm">
                <div>
                  <div style={{ fontWeight: 600 }} id={`perm-${k}`}>
                    {label}
                  </div>
                  {(blocked || forced || sub) && (
                    <p className="help">
                      {blocked ? 'Buồng phòng không có quyền này' : forced ? 'Có sẵn với Quản lý' : sub}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={on}
                  aria-labelledby={`perm-${k}`}
                  disabled={forced || blocked}
                  onClick={() => setPerms({ ...perms, [k as Perm]: !perms[k] })}
                >
                  <span />
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => {
          patch({ role, perms })
          onClose()
          toast(`Đã lưu quyền của ${p.name}. Áp dụng từ lần mở app tiếp theo.`)
        }}
      >
        Lưu
      </button>
      {lockAsk && (
        <div className="alert" role="alert">
          Khoá ngay: {p.name} bị đăng xuất trên mọi thiết bị. Dữ liệu và nhật ký giữ nguyên.
        </div>
      )}
      <button type="button" className="btn btn-danger btn-block" onClick={lock}>
        {p.locked ? 'Mở khoá tài khoản' : lockAsk ? 'Xác nhận khoá' : 'Khoá tài khoản'}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}

function InviteSheet({ onClose }: { onClose: () => void }) {
  const staff = useSetup((s) => s.staff)
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<(typeof ROLES)[number][0]>('fd')
  const [tried, setTried] = useState(false)
  const d = phoneDigits(phone)
  const exists = staff.some((s) => s.phone === d)
  const error =
    tried &&
    (exists
      ? 'Số này đã là tài khoản của cơ sở.'
      : !/^0\d{9}$/.test(d) && 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.')

  // ponytail: mock invite; the real one is sent by hueni-api as a Zalo message.
  function send() {
    if (exists || !/^0\d{9}$/.test(d)) return setTried(true)
    useSetup.setState((s) => ({
      staff: [
        ...s.staff,
        {
          id: Math.max(...s.staff.map((x) => x.id)) + 1,
          name: d.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3'),
          phone: d,
          role,
          sub: 'Mời hôm nay · chưa nhận',
          perms: {},
          invited: true,
        },
      ],
    }))
    onClose()
    toast('Đã gửi lời mời qua Zalo')
  }

  return (
    <Sheet title="Mời nhân viên" onClose={onClose}>
      <Field label="Số điện thoại" error={error}>
        {(p) => (
          <input
            {...p}
            type="tel"
            inputMode="tel"
            placeholder="09xx xxx xxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        )}
      </Field>
      <div className="field">
        <span className="lbl">Vai trò</span>
        <Segmented label="Vai trò" value={role} options={ROLES} onChange={setRole} />
      </div>
      <p className="help">Nhân viên nhận lời mời qua Zalo, mở mini app là dùng được. Lời mời hết hạn sau 48 giờ.</p>
      <button type="button" className="btn btn-primary btn-block" disabled={!d} onClick={send}>
        Gửi lời mời
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}

const FILTERS: [AuditKind | 'all', string][] = [
  ['all', 'Tất cả'],
  ['cancel', 'Huỷ'],
  ['price', 'Giá'],
  ['money', 'Tiền'],
]

function Log() {
  const { activities, rooms } = usePms()
  const { place } = useCurrent()
  const extra = useSetup((s) => s.audit)
  const [filter, setFilter] = useState<AuditKind | 'all'>('all')
  const roomName = (id?: number) => rooms.find((r) => r.id === id)?.name
  // Hoạt động (#38): with hueni-api, the server's lines; the price/role audit (extra) stays mock until #28.
  const server = useActivity(API_URL ? `/places/${place.id}/activity` : undefined)

  const all: AuditEntry[] = [
    ...(API_URL ? server.lines : activities.filter((a) => a.place_id === place.id))
      .filter((a) => a.kind !== 'sync' && a.kind !== 'error')
      .map((a) => ({
        id: -a.id,
        k: kindOf(a.action),
        action: `${a.action}${roomName(a.room_id) ? ` · phòng ${roomName(a.room_id)}` : ''}`,
        note: a.detail,
        who: a.actor,
        at: a.at,
      })),
    ...extra,
  ]
  const list = all.filter((l) => filter === 'all' || l.k === filter).sort((a, b) => b.at.localeCompare(a.at))

  return (
    <>
      <div className="sec">
        <Segmented label="Lọc nhật ký" value={filter} options={FILTERS} onChange={setFilter} />
      </div>
      <section className="sec" aria-label="Nhật ký thao tác">
        <div className="panel">
          {list.map((l) => (
            <div key={l.id} className="row">
              <span className="grow">
                <span className="t1">{l.action}</span>
                {l.before && (
                  <span className="chg">
                    <s>{l.before}</s>
                    <span aria-label="thành">→</span>
                    <b>{l.after}</b>
                  </span>
                )}
                {l.note && <span className="t2 wrap">{l.note}</span>}
                <span className="t2">
                  {l.who} · {fmtTime(l.at)}
                </span>
              </span>
            </div>
          ))}
          {!list.length && <div className="empty-row">{server.error || 'Chưa có thao tác nào.'}</div>}
        </div>
        {server.more && (
          <button type="button" className="btn btn-block" style={{ marginTop: 8 }} onClick={server.more}>
            Xem cũ hơn
          </button>
        )}
        <p className="help" style={{ marginTop: 8 }}>
          Nhật ký không sửa, không xoá được.
        </p>
      </section>
    </>
  )
}
