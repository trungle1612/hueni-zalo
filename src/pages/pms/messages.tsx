import './guests.scss'

import dayjs from 'dayjs'
import React, { useState } from 'react'

import {
  A,
  AppBar,
  Badge,
  Field,
  KV,
  PlaceSub,
  Screen,
  Sec,
  Segmented,
  Sheet,
  toast,
  useCurrent,
} from '@/modules/pms/components/ui'
import { Template, useGuests } from '@/modules/pms/guests.store'
import { bookingCode, can, dueOf, fmtDate, money, paidOf, usePms } from '@/modules/pms/pms.store'

const BADGE = { ok: ['Đã gửi', 'positive'], sms: ['SMS', 'info'], fail: ['Lỗi', 'danger'] } as const
const ago = (iso: string) =>
  dayjs(iso).isSame(dayjs(), 'day') ? `Hôm nay ${dayjs(iso).format('HH:mm')}` : dayjs(iso).format('DD/MM HH:mm')

// Owner only: which automatic Zalo / SMS messages go out, and what was sent.
// ponytail: mock templates and log; sending is hueni-api's job through Zalo ZNS.
export default function MessagesPage() {
  const { templates, sent } = useGuests()
  const { place } = useCurrent()
  const [tab, setTab] = useState<'tpl' | 'log'>('tpl')
  const [filter, setFilter] = useState<'all' | 'fail' | 'sms'>('all')
  const [open, setOpen] = useState<string>()

  if (!can(place, 'manage')) {
    return (
      <Screen>
        <AppBar lead="back" title="Tin nhắn tự động" sub={<PlaceSub />} />
        <main className="scroll">
          <div className="sec">
            <div className="panel msg">
              <h2>Chỉ chủ cơ sở cài tin nhắn tự động</h2>
              <p>Tin xác nhận, nhắc đến và cảm ơn vẫn gửi cho khách như bình thường.</p>
              <div style={{ marginTop: 4 }}>
                <A className="btn" to="/" replace>
                  Về Hôm nay
                </A>
              </div>
            </div>
          </div>
        </main>
      </Screen>
    )
  }

  const fails = sent.filter((s) => s.st === 'fail').length
  const log = sent.filter((s) => filter === 'all' || s.st === filter).sort((a, b) => b.at.localeCompare(a.at))
  const cur = templates.find((t) => t.id === open)
  const patch = (id: string, p: Partial<Template>) =>
    useGuests.setState((s) => ({ templates: s.templates.map((t) => (t.id === id ? { ...t, ...p } : t)) }))
  const status = (t: Template) => (!t.on ? 'Đang tắt' : t.pending ? 'Chờ Zalo duyệt bản sửa' : 'Đã duyệt')

  return (
    <Screen>
      <AppBar lead="back" title="Tin nhắn tự động" sub="Zalo · SMS khi khách không dùng Zalo" />
      <div className="seg" role="group" aria-label="Xem">
        <button type="button" aria-pressed={tab === 'tpl'} onClick={() => setTab('tpl')}>
          Mẫu tin
        </button>
        <button type="button" aria-pressed={tab === 'log'} onClick={() => setTab('log')}>
          Đã gửi{fails ? ` · ${fails} lỗi` : ''}
        </button>
      </div>
      <main className="scroll">
        {tab === 'tpl' ? (
          <Sec
            title="Mẫu tin"
            aside={
              <span className="aside">
                {templates.filter((t) => t.on).length}/{templates.length} đang bật
              </span>
            }
          >
            <div className="panel">
              {templates.map((t) => (
                <div key={t.id} className="row">
                  <button type="button" className="row-main tpl" onClick={() => setOpen(t.id)}>
                    <span className="t1">{t.name}</span>
                    <span className="t2">{t.when}</span>
                    <span className={t.on && t.pending ? 't2 warn' : 't2'}>{status(t)}</span>
                  </button>
                  <button
                    type="button"
                    className="switch"
                    role="switch"
                    aria-checked={t.on}
                    aria-label={t.name}
                    onClick={() => {
                      patch(t.id, { on: !t.on })
                      toast(`${t.on ? 'Đã tắt' : 'Đã bật'} ${t.name.toLowerCase()}`)
                    }}
                  >
                    <span />
                  </button>
                </div>
              ))}
            </div>
            <p className="help">Phí mỗi tin theo bảng giá của Zalo và nhà mạng. Tin chỉ gửi trong 07:00 – 21:00.</p>
          </Sec>
        ) : (
          <div className="sec">
            <Segmented
              label="Lọc"
              value={filter}
              onChange={setFilter}
              options={[
                ['all', 'Tất cả'],
                ['fail', 'Lỗi'],
                ['sms', 'Qua SMS'],
              ]}
            />
            <div className="panel" style={{ marginTop: 12 }}>
              {log.length ? (
                log.map((l, i) => (
                  <div key={i} className="row">
                    <span className="grow">
                      <span className="t1">
                        {l.guest} · {l.tpl}
                      </span>
                      <span className="t2" style={{ whiteSpace: 'normal' }}>
                        {l.detail}
                      </span>
                      <span className="t2">{ago(l.at)}</span>
                    </span>
                    <Badge tone={BADGE[l.st][1]}>{BADGE[l.st][0]}</Badge>
                  </div>
                ))
              ) : (
                <div className="empty-row">Không có tin nào trong mục này.</div>
              )}
            </div>
          </div>
        )}
        <div className="end" />
      </main>
      {cur && (
        <TemplateSheet key={cur.id} t={cur} status={status(cur)} patch={patch} onClose={() => setOpen(undefined)} />
      )}
    </Screen>
  )
}

function TemplateSheet({
  t,
  status,
  patch,
  onClose,
}: {
  t: Template
  status: string
  patch: (id: string, p: Partial<Template>) => void
  onClose: () => void
}) {
  const { bookings, rooms } = usePms()
  const { place, rooms: mine } = useCurrent()
  const [body, setBody] = useState(t.body)
  // Preview with a real booking of this homestay, so the owner sees what a guest gets.
  const ids = new Set(mine.map((r) => r.id))
  const b = bookings.find(
    (x) => ids.has(x.room_id) && x.source === 'manual' && x.guest_name && x.status !== 'cancelled',
  )
  const room = rooms.find((r) => r.id === b?.room_id)
  const fill: Record<string, string> = b
    ? {
        'tên khách': b.guest_name!,
        'cơ sở': place.name,
        mã: bookingCode(b),
        phòng: room?.name || '',
        'ngày đến': fmtDate(b.start_date),
        'ngày đi': fmtDate(b.end_date),
        'đã trả': money(paidOf(b, room)),
        'còn thu': money(dueOf(b, room)),
      }
    : {}
  const preview = body.replace(/\{([^}]+)\}/g, (m, k: string) => fill[k] ?? m)
  const changed = body.trim() !== t.body

  return (
    <Sheet title={t.name} onClose={onClose}>
      <dl className="panel">
        <KV label="Gửi lúc">{t.when}</KV>
        <KV label="Trạng thái mẫu">{status}</KV>
      </dl>
      <Field
        label="Nội dung"
        help="Biến tự điền: {tên khách} {cơ sở} {mã} {phòng} {ngày đến} {ngày đi} {đã trả} {còn thu}."
      >
        {(p) => <textarea {...p} rows={4} maxLength={400} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      {b && (
        <div className="field">
          <span className="lbl">Xem trước · {bookingCode(b)}</span>
          <div className="bubble">{preview}</div>
        </div>
      )}
      <p className="help">
        Mẫu Zalo phải được Zalo duyệt; sửa nội dung sẽ gửi duyệt lại, thường 1 – 2 ngày làm việc. Trong lúc chờ, mẫu cũ
        vẫn chạy.
      </p>
      <div className="switch-row">
        <span>
          <span className="t1">Gửi SMS nếu Zalo không gửi được</span>
          <span className="t2">Bản rút gọn, không dấu</span>
        </span>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={t.sms}
          aria-label="SMS dự phòng"
          onClick={() => patch(t.id, { sms: !t.sms })}
        >
          <span />
        </button>
      </div>
      {changed ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!body.trim()}
          onClick={() => {
            patch(t.id, { body: body.trim(), pending: true })
            toast('Đã gửi Zalo duyệt bản sửa. Mẫu cũ vẫn chạy trong lúc chờ.')
            onClose()
          }}
        >
          Lưu và gửi duyệt
        </button>
      ) : (
        <button type="button" className="btn btn-block" onClick={() => toast('Đã gửi thử tới số của bạn')}>
          Gửi thử tới số của tôi
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}
