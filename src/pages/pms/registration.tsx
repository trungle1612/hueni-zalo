import './ops.scss'

import dayjs from 'dayjs'
import React, { useState } from 'react'

import {
  AppBar,
  Badge,
  Field,
  Screen,
  Sec,
  Segmented,
  Sheet,
  toast,
  Tone,
  useCurrent,
} from '@/modules/pms/components/ui'
import { setDoc, Slot, slotsOf, tonight } from '@/modules/pms/ops.store'
import { fmtDay, fmtTime, GuestDoc, guestLabel, today, usePms } from '@/modules/pms/pms.store'

const BADGE: Record<'sent' | 'ok', [string, Tone]> = {
  sent: ['Đang chờ xác nhận', 'neutral'],
  ok: ['Đã xác nhận', 'positive'],
}
const key = (s: Slot) => `${s.b.id}:${s.i}`
const docLine = (d: GuestDoc) =>
  d.id_tail ? `${d.kind === 'foreign' ? 'Hộ chiếu' : 'CCCD'} •••• ${d.id_tail}` : 'Đã khai báo'

// Time left before tonight's 23:00 deadline.
function left() {
  const m = dayjs().hour(23).minute(0).diff(dayjs(), 'minute')
  return m <= 0 ? 'quá hạn' : `còn ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

type Form = {
  kind: 'vn' | 'foreign'
  name: string
  dob: string
  nat: string
  idNo: string
  visa: string
  entry: string
}

// Khai báo lưu trú: every guest sleeping here tonight, papers checked, then sent in one go.
export default function RegistrationPage() {
  const { bookings, actions } = usePms()
  const { rooms, roomOf } = useCurrent()
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set())
  const [scan, setScan] = useState<{ slot: Slot; read: boolean; fromScan: boolean; f: Form }>()

  const ids = new Set(rooms.map((r) => r.id))
  const slots = bookings
    .filter((b) => ids.has(b.room_id) && tonight(b))
    .sort((a, b) =>
      (roomOf(a.room_id)?.name || '').localeCompare(roomOf(b.room_id)?.name || '', 'vi', { numeric: true }),
    )
    .flatMap(slotsOf)
  const pending = slots.filter((s) => !s.doc || s.doc.status === 'error')
  const ready = slots.filter((s) => s.doc?.status === 'ready')
  const done = slots.filter((s) => s.doc && ['sent', 'ok'].includes(s.doc.status))
  const picked = ready.filter((s) => !unpicked.has(key(s)))

  function send() {
    const sent = picked.map((s) => ({ ...s, doc: { ...s.doc!, status: 'sent' as const } }))
    sent.forEach((s) => setDoc(s.b.id, s.i, s.doc))
    toast(`Đã gửi ${sent.length} khai báo. Kết quả xác nhận sẽ cập nhật tại đây.`)
    // ponytail: the confirmation is faked after 2.5 s; with the API it arrives by polling or a push.
    setTimeout(() => {
      sent.forEach((s) => setDoc(s.b.id, s.i, { ...s.doc, status: 'ok', at: new Date().toISOString() }))
      new Set(sent.map((s) => s.b.id)).forEach((id) => {
        const b = usePms.getState().bookings.find((x) => x.id === id)!
        if (!b.declared_at && slotsOf(b).every((s) => s.doc?.status === 'ok')) actions.declare(id)
      })
    }, 2500)
  }

  function open(slot: Slot) {
    const d = slot.doc
    const name = d?.name || (slot.i === 0 ? guestLabel(slot.b) : '')
    setScan({
      slot,
      read: !!d,
      fromScan: false,
      f: {
        kind: d?.kind || 'vn',
        name,
        dob: '',
        nat: d?.kind === 'foreign' ? '' : 'Việt Nam',
        idNo: '',
        visa: '',
        entry: '',
      },
    })
  }

  function row(s: Slot) {
    const d = s.doc
    const name = d?.name || (s.i === 0 ? guestLabel(s.b) : 'Khách đi cùng')
    const action = !d ? 'Quét' : d.status === 'error' ? 'Sửa' : ''
    return (
      <div className="row" key={key(s)}>
        {d?.status === 'ready' && (
          <input
            className="cb"
            type="checkbox"
            aria-label={`Chọn gửi khai báo cho ${name}`}
            checked={!unpicked.has(key(s))}
            onChange={() =>
              setUnpicked((u) => {
                const n = new Set(u)
                if (!n.delete(key(s))) n.add(key(s))
                return n
              })
            }
          />
        )}
        <span className="rn">{roomOf(s.b.room_id)?.name}</span>
        <span className="grow">
          <span className="t1">{name}</span>
          <span className="t2 wrap">
            {d
              ? `${docLine(d)}${d.at && d.status === 'ok' ? ` · xác nhận ${fmtTime(d.at)}` : ''}`
              : `Chưa có giấy tờ${s.b.start_date === today() && !s.b.checked_in_at ? ' · đến hôm nay' : ''}`}
          </span>
          {d?.status === 'error' && <span className="t3">{d.problem}</span>}
        </span>
        {action ? (
          <button type="button" className="btn btn-sm" aria-label={`${action} giấy tờ ${name}`} onClick={() => open(s)}>
            {action}
          </button>
        ) : (
          d &&
          d.status !== 'ready' && (
            <Badge tone={BADGE[d.status as 'sent' | 'ok'][1]}>{BADGE[d.status as 'sent' | 'ok'][0]}</Badge>
          )
        )}
      </div>
    )
  }

  const groups: [string, Slot[]][] = [
    ['Cần xử lý', pending],
    ['Sẵn sàng gửi', ready],
    ['Đã gửi', done],
  ]
  const f = scan?.f
  const foreign = f?.kind === 'foreign'
  const setF = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setScan((x) => x && { ...x, f: { ...x.f, [k]: e.target.value } })

  return (
    <Screen>
      <AppBar lead="back" title="Khai báo lưu trú" sub={`Đêm ${fmtDay(today())} · ${slots.length} khách`} />
      <div className="deadline" role="status">
        <span>Hạn gửi trước 23:00 hôm nay. Khách đến sau 23:00 gửi trước 08:00 sáng mai.</span>
        <b>{left()}</b>
      </div>
      <main className="scroll">
        {!slots.length && <div className="empty">Đêm nay chưa có khách ở.</div>}
        {groups.map(
          ([title, list]) =>
            list.length > 0 && (
              <Sec key={title} title={title} aside={<span className="aside">{list.length} khách</span>}>
                <div className="panel">{list.map(row)}</div>
              </Sec>
            ),
        )}
        <div className="sec">
          <p className="help">
            Gửi qua kênh khai báo theo hướng dẫn của Công an địa phương. App chỉ lưu thông tin cần khai báo; ảnh giấy tờ
            không được lưu sau khi đọc xong.
          </p>
        </div>
        <div className="end" />
      </main>
      {slots.length > 0 && (
        <div className="footer-bar">
          <button type="button" className="btn btn-primary btn-block" disabled={!picked.length} onClick={send}>
            {picked.length
              ? `Gửi khai báo cho ${picked.length} khách`
              : pending.length
                ? `Còn ${pending.length} khách cần bổ sung giấy tờ`
                : 'Đã gửi đủ khai báo đêm nay'}
          </button>
        </div>
      )}

      {scan && f && (
        <Sheet
          title={`${scan.slot.doc?.status === 'error' ? 'Sửa thông tin' : 'Giấy tờ'} · ${f.name || 'Khách đi cùng'}`}
          onClose={() => setScan(undefined)}
        >
          <p className="help">Phòng {roomOf(scan.slot.b.room_id)?.name}</p>
          <Segmented
            label="Loại giấy tờ"
            value={f.kind}
            options={[
              ['vn', 'CCCD / VNeID'],
              ['foreign', 'Hộ chiếu'],
            ]}
            onChange={(kind) => setScan({ ...scan, f: { ...f, kind, nat: kind === 'vn' ? 'Việt Nam' : '' } })}
          />
          {!scan.read ? (
            <>
              <div className="cam" aria-hidden="true">
                <b>Khung camera</b>
                {foreign
                  ? 'Đặt trang có ảnh của hộ chiếu vào khung'
                  : 'Đặt mặt sau CCCD có mã QR vào khung, hoặc quét QR trên VNeID của khách'}
              </div>
              {/* ponytail: no camera yet; "reading" fills made-up data. Becomes zmp-sdk scanQRCode / OCR. */}
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() =>
                  setScan({
                    ...scan,
                    read: true,
                    fromScan: true,
                    f: foreign
                      ? {
                          ...f,
                          dob: '03/06/1988',
                          nat: 'Anh',
                          idNo: '123784471',
                          visa: 'Miễn thị thực',
                          entry: dayjs().format('DD/MM/YYYY'),
                        }
                      : { ...f, dob: '12/05/1991', nat: 'Việt Nam', idNo: '079191001234' },
                  })
                }
              >
                Quét giấy tờ
              </button>
              <button type="button" className="btn btn-block" onClick={() => setScan({ ...scan, read: true })}>
                Nhập tay
              </button>
            </>
          ) : (
            <>
              {scan.fromScan && <p className="help">Đã đọc giấy tờ. Kiểm tra lại trước khi lưu.</p>}
              <Field label="Họ và tên">
                {(p) => <input {...p} type="text" value={f.name} onChange={setF('name')} />}
              </Field>
              <div className="grid2">
                <Field label="Ngày sinh">
                  {(p) => (
                    <input
                      {...p}
                      type="text"
                      inputMode="numeric"
                      placeholder="dd/mm/yyyy"
                      value={f.dob}
                      onChange={setF('dob')}
                    />
                  )}
                </Field>
                <Field label="Quốc tịch">
                  {(p) => <input {...p} type="text" value={f.nat} onChange={setF('nat')} />}
                </Field>
              </div>
              <Field label={foreign ? 'Số hộ chiếu' : 'Số định danh (CCCD)'}>
                {(p) => (
                  <input
                    {...p}
                    type="text"
                    inputMode={foreign ? 'text' : 'numeric'}
                    value={f.idNo}
                    onChange={setF('idNo')}
                  />
                )}
              </Field>
              {foreign && (
                <div className="grid2">
                  <Field label="Thị thực">
                    {(p) => <input {...p} type="text" value={f.visa} onChange={setF('visa')} />}
                  </Field>
                  <Field label="Ngày nhập cảnh">
                    {(p) => (
                      <input {...p} type="text" placeholder="dd/mm/yyyy" value={f.entry} onChange={setF('entry')} />
                    )}
                  </Field>
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={!f.name.trim() || f.dob.replace(/\D/g, '').length < 8 || f.idNo.replace(/\s/g, '').length < 6}
                onClick={() => {
                  // ponytail: only the last 4 digits are kept here; the full record goes straight to the API.
                  setDoc(scan.slot.b.id, scan.slot.i, {
                    name: f.name.trim(),
                    kind: f.kind,
                    id_tail: f.idNo.replace(/\s/g, '').slice(-4),
                    status: 'ready',
                  })
                  setUnpicked((u) => {
                    const n = new Set(u)
                    n.delete(key(scan.slot))
                    return n
                  })
                  setScan(undefined)
                  toast(`Đã lưu giấy tờ của ${f.name.trim()}`)
                }}
              >
                Lưu thông tin khách
              </button>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setScan(undefined)}>
            Đóng
          </button>
        </Sheet>
      )}
    </Screen>
  )
}
