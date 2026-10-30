import './setup.scss'

import React, { useEffect, useState } from 'react'
import { openShareSheet } from 'zmp-sdk'

import { API_URL } from '@/constants/common'
import { AppBar, Badge, Field, Screen, Sec, Segmented, Sheet, toast, useCurrent } from '@/modules/pms/components/ui'
import { can, fmtTime, money, PAY_METHOD, Role, usePms } from '@/modules/pms/pms.store'
import { loadStaff, staffRemote, useActivity } from '@/modules/pms/remote'
import { AuditEntry, AuditKind, PERMS, RefundRequest, ROLE_NAME, Staff, useSetup } from '@/modules/pms/setup.store'

import { Denied } from './rates'

const ROLES: [Role, string][] = [
  ['staff', ROLE_NAME.staff],
  ['owner', ROLE_NAME.owner],
]

// People's actions from the booking log, sorted into the owner's filters. OTA sync lines are not people.
const kindOf = (action: string): AuditKind =>
  /huỷ/i.test(action)
    ? 'cancel'
    : /thu tiền|hoàn tiền|giảm giá|ca\b/i.test(action)
      ? 'money'
      : /giá/i.test(action)
        ? 'price'
        : 'other'

// Members and Chờ duyệt: hueni-api's with API_URL (#28, hueni-api#168), the mock in useSetup without.
export default function StaffPage() {
  const { place } = useCurrent()
  const owner = can(place, 'manage')
  const [tab, setTab] = useState<'staff' | 'log'>('staff')
  const requests = useSetup((s) => s.refundRequests)

  useEffect(() => {
    if (owner) loadStaff(place.id).then((e) => e && toast(e))
  }, [place.id, owner])

  if (!owner) return <Denied />

  async function settle(r: RefundRequest, ok: boolean) {
    const error = await staffRemote.decide(r.id, ok)
    toast(
      error ||
        (ok
          ? `Đã duyệt. Khoản hoàn ${money(r.amount)} được ghi vào ${r.booking.code}.`
          : 'Đã từ chối. Tiền giữ lại, ghi vào nhật ký.'),
    )
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
        {requests.map((r) => (
          <div key={r.id} className="sec">
            <div className="approve" role="region" aria-label="Chờ duyệt">
              <b>
                Xin hoàn {money(r.amount)} · {PAY_METHOD[r.payment_method].toLowerCase()}
              </b>
              <span className="help">
                {r.by} gửi lúc {fmtTime(r.at)} · {r.booking.code} {r.booking.label}, phòng {r.booking.room_name}, đã thu{' '}
                {money(r.booking.paid)}.{r.note && ` ${r.note}`}
              </span>
              <div className="actions">
                <button type="button" className="btn btn-sm" onClick={() => settle(r, false)}>
                  Từ chối
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => settle(r, true)}>
                  Duyệt hoàn tiền
                </button>
              </div>
            </div>
          </div>
        ))}
        {tab === 'staff' ? <People /> : <Log />}
        <div className="end" />
      </main>
    </Screen>
  )
}

function People() {
  const staff = useSetup((s) => s.staff)
  const me = usePms((s) => s.user.id)
  const [open, setOpen] = useState<Staff>()
  const [inviting, setInviting] = useState(false)
  const [link, setLink] = useState<{ name: string; url: string }>()

  return (
    <Sec
      title={`${staff.length} tài khoản`}
      aside={
        <button type="button" className="link" onClick={() => setInviting(true)}>
          + Mời nhân viên
        </button>
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
              <span className="t2">
                {ROLE_NAME[p.role]}
                {p.user_id === me
                  ? ' · bạn'
                  : p.last_active_at
                    ? ` · hoạt động ${fmtTime(p.last_active_at)}`
                    : ' · chưa dùng app'}
              </span>
            </span>
            {p.locked ? (
              <Badge tone="danger">Đã khoá</Badge>
            ) : (
              p.invited && <Badge tone="warning">Chờ nhận lời mời</Badge>
            )}
          </button>
        ))}
      </div>
      {open && (
        <PersonSheet
          p={open}
          self={open.user_id === me}
          onLink={(url) => setLink({ name: open.name, url })}
          onClose={() => setOpen(undefined)}
        />
      )}
      {inviting && <InviteSheet onLink={(name, url) => setLink({ name, url })} onClose={() => setInviting(false)} />}
      {link && <LinkSheet {...link} onClose={() => setLink(undefined)} />}
    </Sec>
  )
}

// Asked once more before doing it.
const ASK = {
  lock: (name: string) => `Khoá ngay: ${name} bị đăng xuất trên mọi thiết bị. Dữ liệu và nhật ký giữ nguyên.`,
  link: (name: string) => `Link cũ và mọi lần đăng nhập của ${name} bị huỷ. Gửi link mới để ${name} liên kết Zalo lại.`,
  remove: (name: string) => `${name} không vào được cơ sở này nữa. Nhật ký giữ nguyên.`,
}

function PersonSheet({
  p,
  self,
  onLink,
  onClose,
}: {
  p: Staff
  self: boolean
  onLink: (url: string) => void
  onClose: () => void
}) {
  const [role, setRole] = useState(p.role)
  const [perms, setPerms] = useState(p.permissions)
  const [ask, setAsk] = useState<keyof typeof ASK>()

  if (self)
    return (
      <Sheet title={p.name} onClose={onClose}>
        <div className="notice info">Đây là tài khoản của bạn. Chủ cơ sở có mọi quyền.</div>
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
          Đóng
        </button>
      </Sheet>
    )

  function done(error: string | void, text: string) {
    toast(error || text)
    if (!error) onClose()
  }

  async function confirm(k: keyof typeof ASK) {
    if (ask !== k) return setAsk(k)
    if (k === 'lock') return done(await staffRemote.lock(p.id, true), `Đã khoá ${p.name}`)
    if (k === 'remove') return done(await staffRemote.remove(p.id), `Đã xoá ${p.name} khỏi cơ sở`)
    const r = await staffRemote.setupLink(p.id)
    if (typeof r === 'string') return toast(r)
    onClose()
    if (r.setup_link) onLink(r.setup_link)
  }

  return (
    <Sheet title={p.name} onClose={onClose}>
      <div className="field">
        <span className="lbl">Vai trò</span>
        <Segmented label="Vai trò" value={role} options={ROLES} onChange={setRole} />
      </div>
      <div className="field">
        <span className="lbl">Quyền thêm</span>
        <div className="panel">
          {PERMS.map(([k, label, sub]) => {
            const forced = role === 'owner'
            const on = forced || perms.includes(k)
            return (
              <div key={k} className="switch-row perm">
                <div>
                  <div style={{ fontWeight: 600 }} id={`perm-${k}`}>
                    {label}
                  </div>
                  {(forced || sub) && <p className="help">{forced ? 'Chủ cơ sở có mọi quyền' : sub}</p>}
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={on}
                  aria-labelledby={`perm-${k}`}
                  disabled={forced}
                  onClick={() => setPerms(on ? perms.filter((x) => x !== k) : [...perms, k])}
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
        onClick={async () =>
          done(
            await staffRemote.save(p.id, { role, permissions: perms }),
            `Đã lưu quyền của ${p.name}. Áp dụng từ lần mở app tiếp theo.`,
          )
        }
      >
        Lưu
      </button>
      {ask && (
        <div className="alert" role="alert">
          {ASK[ask](p.name)}
        </div>
      )}
      {p.locked ? (
        <button
          type="button"
          className="btn btn-block"
          onClick={async () => done(await staffRemote.lock(p.id, false), `Đã mở khoá ${p.name}`)}
        >
          Mở khoá tài khoản
        </button>
      ) : (
        p.role !== 'owner' && (
          <button type="button" className="btn btn-danger btn-block" onClick={() => confirm('lock')}>
            {ask === 'lock' ? 'Xác nhận khoá' : 'Khoá tài khoản'}
          </button>
        )
      )}
      <button type="button" className="btn btn-block" onClick={() => confirm('link')}>
        {ask === 'link' ? 'Xác nhận tạo link mới' : 'Tạo link đăng nhập mới'}
      </button>
      <button type="button" className="btn btn-danger btn-block" onClick={() => confirm('remove')}>
        {ask === 'remove' ? 'Xác nhận xoá' : 'Xoá khỏi cơ sở'}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}

function InviteSheet({ onLink, onClose }: { onLink: (name: string, url: string) => void; onClose: () => void }) {
  const { place } = useCurrent()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [error, setError] = useState<string>()

  async function send() {
    const r = await staffRemote.invite(place.id, {
      name: name.trim(),
      phone_number: phone.replace(/[^\d+]/g, ''),
      role,
    })
    if (typeof r === 'string') return setError(r)
    onClose()
    toast(`Đã thêm ${name.trim()}`)
    if (r.setup_link) onLink(name.trim(), r.setup_link)
  }

  return (
    <Sheet title="Mời nhân viên" onClose={onClose}>
      <Field label="Tên">{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Số điện thoại">
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
      <p className="help">Sau khi thêm, gửi link qua Zalo cho người này. Link dùng một lần, hết hạn sau 7 ngày.</p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="btn btn-primary btn-block" disabled={!name.trim() || !phone} onClick={send}>
        Thêm nhân viên
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}

// The one-time link is a credential: shown only here to the owner, never logged or put in a URL of ours.
function LinkSheet({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const copy = () =>
    navigator.clipboard
      .writeText(url)
      .then(() => toast('Đã sao chép link'))
      .catch(() => toast('Không sao chép được. Giữ lâu vào ô link để chép.'))

  return (
    <Sheet title={`Gửi link cho ${name}`} onClose={onClose}>
      <p className="help">
        {name} mở link để liên kết Zalo, rồi đăng nhập mini app bằng Zalo. Link dùng một lần, hết hạn sau 7 ngày. Chỉ
        gửi cho đúng người.
      </p>
      <Field label="Link đăng nhập">
        {(p) => <input {...p} readOnly value={url} onFocus={(e) => e.target.select()} />}
      </Field>
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => openShareSheet({ type: 'link', data: { link: url, chatOnly: true } }).catch(copy)}
      >
        Gửi qua Zalo
      </button>
      <button type="button" className="btn btn-block" onClick={copy}>
        Sao chép link
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
  const audit = useSetup((s) => s.audit)
  const [filter, setFilter] = useState<AuditKind | 'all'>('all')
  const roomName = (id?: number) => rooms.find((r) => r.id === id)?.name
  // Hoạt động (#38): with hueni-api, the server's lines (staff changes and refund decisions included, #28);
  // the mock's price audit only without it.
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
    ...(API_URL ? [] : audit),
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
