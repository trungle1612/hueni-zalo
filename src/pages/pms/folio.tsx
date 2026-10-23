import './guests.scss'

import React, { useState } from 'react'
import { useParams } from 'react-router-dom'

import {
  AppBar,
  Field,
  Icon,
  KV,
  MoneyInput,
  phoneDigits,
  Screen,
  Sec,
  Segmented,
  Sheet,
  toast,
  useRecord,
} from '@/modules/pms/components/ui'
import { logActivity, patchBooking, SERVICES, STAFF_DISCOUNT, useGuests } from '@/modules/pms/guests.store'
import {
  Booking,
  bookingCode,
  can,
  dueOf,
  fmtRange,
  fmtTime,
  guestLabel,
  hasWeekendPrice,
  money,
  nightPrice,
  nights,
  paidOf,
  PAY_METHOD,
  PayMethod,
  PROVIDER_NAME,
  Room,
  roomTotalOf,
  totalOf,
  usePlaceOf,
  usePms,
} from '@/modules/pms/pms.store'

type SheetKind = 'add' | 'discount' | 'pay' | 'invoice'

// Phiếu tính tiền: room nights, services, discount, payments, receipt and e-invoice for one booking.
export default function FolioPage() {
  const { id } = useParams()
  const { bookings, rooms } = usePms()
  const invoice = useGuests((s) => s.invoices[Number(id)])
  const record = useRecord()
  const b = bookings.find((x) => x.id === Number(id))
  const room = rooms.find((r) => r.id === b?.room_id)
  const place = usePlaceOf(b?.room_id)
  const [sheet, setSheet] = useState<SheetKind>()

  if (!b || !room) {
    return (
      <Screen>
        <AppBar lead="back" title="Phiếu tính tiền" />
        <main className="scroll">
          <div className="empty">Không tìm thấy đặt phòng này.</div>
        </main>
      </Screen>
    )
  }

  const ota = b.source === 'ical'
  const editable = !ota && b.status !== 'cancelled'
  const total = totalOf(b, room)
  const paid = paidOf(b, room)
  const due = dueOf(b, room)
  const charges = ota ? [] : b.charges || []
  const lineCount = 1 + charges.length + (b.discount && !ota ? 1 : 0)
  const phone = phoneDigits(b.guest_phone)

  const removeCharge = (cid: number) => {
    const c = charges.find((x) => x.id === cid)!
    record(() => {
      patchBooking(b.id, { charges: charges.filter((x) => x.id !== cid) })
      logActivity(b, 'booking', 'Xoá dịch vụ', `${c.qty} × ${c.name}`)
    }, `Đã xoá ${c.name.toLowerCase()}`)
  }
  const removeDiscount = () =>
    record(() => {
      patchBooking(b.id, { discount: undefined })
      logActivity(b, 'booking', 'Bỏ giảm giá', money(b.discount!.amount))
    }, 'Đã bỏ giảm giá')

  return (
    <Screen>
      <AppBar
        lead="back"
        title="Phiếu tính tiền"
        sub={`${bookingCode(b)} · ${guestLabel(b)} · ${room.name} · ${fmtRange(b)}`}
      />
      <main className="scroll">
        <Sec title="Khoản tính tiền" aside={<span className="aside">{lineCount} khoản</span>}>
          <div className="panel">
            <div className="row">
              <span className="grow">
                <span className="t1">Tiền phòng</span>
                <span className="t2">
                  {hasWeekendPrice(b, room)
                    ? `${nights(b)} đêm · T6–T7 giá riêng`
                    : `${nights(b)} đêm × ${money(nightPrice(b, room))}`}
                </span>
              </span>
              <span className="amt">{money(roomTotalOf(b, room))}</span>
            </div>
            {charges.map((c) => (
              <div key={c.id} className="row">
                <span className="grow">
                  <span className="t1">{c.name}</span>
                  <span className="t2">
                    {c.qty} {c.unit} × {money(c.price)}
                  </span>
                </span>
                <span className="amt">{money(c.price * c.qty)}</span>
                {editable && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Xoá ${c.name}`}
                    onClick={() => removeCharge(c.id)}
                  >
                    <Icon name="close" size={18} />
                  </button>
                )}
              </div>
            ))}
            {b.discount && !ota && (
              <div className="row">
                <span className="grow">
                  <span className="t1">Giảm giá</span>
                  <span className="t2">{b.discount.reason}</span>
                </span>
                <span className="amt pos">{money(-b.discount.amount)}</span>
                {editable && (
                  <button type="button" className="icon-btn" aria-label="Bỏ giảm giá" onClick={removeDiscount}>
                    <Icon name="close" size={18} />
                  </button>
                )}
              </div>
            )}
            {editable && (
              <div className="actions">
                <button type="button" className="btn btn-sm" onClick={() => setSheet('add')}>
                  + Dịch vụ
                </button>
                {!b.discount && (
                  <button type="button" className="btn btn-sm" onClick={() => setSheet('discount')}>
                    Giảm giá
                  </button>
                )}
              </div>
            )}
          </div>
          {ota && (
            <p className="help">
              Đặt qua {PROVIDER_NAME[b.provider || 'other']}: tiền phòng khách trả trên OTA. Dịch vụ phát sinh thu riêng
              bằng phiếu thu.
            </p>
          )}
        </Sec>

        <Sec title="Đã thanh toán">
          <div className="panel">
            {ota ? (
              <div className="row">
                <span className="grow t1">Thanh toán qua {PROVIDER_NAME[b.provider || 'other']}</span>
                <span className="amt">{money(-paid)}</span>
              </div>
            ) : (b.payments || []).length ? (
              b.payments!.map((p, i) => (
                <div key={i} className="row">
                  <span className="grow">
                    <span className="t1">
                      {p.amount < 0 ? 'Hoàn tiền' : p.deposit ? 'Cọc' : 'Thu'} · {PAY_METHOD[p.method].toLowerCase()}
                    </span>
                    <span className="t2">
                      {fmtTime(p.at)}
                      {p.by && ` · ${p.by}`}
                    </span>
                  </span>
                  <span className="amt">{money(-p.amount)}</span>
                </div>
              ))
            ) : (
              <div className="empty-row">Chưa thu khoản nào.</div>
            )}
          </div>
        </Sec>

        <div className="sec">
          <dl className="panel">
            <KV label="Tổng">{money(total)}</KV>
            <KV label="Đã thanh toán">{money(paid)}</KV>
            <KV label="Còn phải thu" total tone={due > 0 ? 'warn' : 'pos'}>
              {money(due)}
            </KV>
          </dl>
        </div>

        {!ota && (
          <Sec title="Chứng từ">
            <div className="panel">
              <div className="row">
                <span className="grow">
                  <span className="t1">Phiếu thu</span>
                  <span className="t2">{phone ? 'Gửi khách qua Zalo' : 'Đặt phòng chưa có số điện thoại'}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!phone}
                  // ponytail: mock send; becomes a Zalo ZNS message from hueni-api.
                  onClick={() => toast(`Đã gửi phiếu thu tới Zalo ${b.guest_phone}`)}
                >
                  Gửi
                </button>
              </div>
              <div className="row">
                <span className="grow">
                  <span className="t1">Hoá đơn điện tử</span>
                  <span className="t2" style={{ whiteSpace: 'normal' }}>
                    {invoice
                      ? `Đã phát hành ${fmtTime(invoice.at)} · ${invoice.buyer} · gửi tới ${invoice.email}`
                      : 'Chưa xuất · công ty cần hoá đơn thì nhập mã số thuế'}
                  </span>
                </span>
                {!invoice && b.status !== 'cancelled' && (
                  <button type="button" className="btn btn-sm" onClick={() => setSheet('invoice')}>
                    Xuất
                  </button>
                )}
              </div>
            </div>
          </Sec>
        )}
        <div className="end" />
      </main>

      {editable && (
        <div className="footer-bar">
          <div className="sum">
            <b>{money(due)}</b>
            <span>còn phải thu</span>
          </div>
          <button type="button" className="btn btn-primary" disabled={due <= 0} onClick={() => setSheet('pay')}>
            {due > 0 ? 'Thu tiền' : 'Đã thu đủ'}
          </button>
        </div>
      )}

      {sheet === 'add' && <AddSheet booking={b} onClose={() => setSheet(undefined)} />}
      {sheet === 'discount' && (
        <DiscountSheet booking={b} room={room} owner={can(place, 'manage')} onClose={() => setSheet(undefined)} />
      )}
      {sheet === 'pay' && <PaySheet booking={b} due={due} onClose={() => setSheet(undefined)} />}
      {sheet === 'invoice' && <InvoiceSheet booking={b} due={due} total={total} onClose={() => setSheet(undefined)} />}
    </Screen>
  )
}

type SheetProps = { booking: Booking; onClose: () => void }

function AddSheet({ booking: b, onClose }: SheetProps) {
  const record = useRecord()
  const [qty, setQty] = useState<number[]>(SERVICES.map(() => 0))
  const count = qty.reduce((n, q) => n + q, 0)
  const sum = SERVICES.reduce((n, s, i) => n + s.price * qty[i], 0)
  const step = (i: number, d: number) => setQty(qty.map((q, j) => (j === i ? Math.max(0, q + d) : q)))

  function save() {
    const old = b.charges || []
    let next = Math.max(0, ...old.map((c) => c.id))
    const at = new Date().toISOString()
    const added = SERVICES.flatMap((s, i) => (qty[i] ? [{ ...s, qty: qty[i], id: ++next, at }] : []))
    record(
      () => {
        patchBooking(b.id, { charges: [...old, ...added] })
        logActivity(b, 'booking', 'Thêm dịch vụ', added.map((c) => `${c.qty} × ${c.name}`).join(', '))
      },
      `Đã thêm ${count} mục · ${money(sum)}`,
    )
    onClose()
  }

  return (
    <Sheet title="Thêm dịch vụ" onClose={onClose}>
      <div className="panel">
        {SERVICES.map((s, i) => (
          <div key={s.name} className="row">
            <span className="grow">
              <span className="t1" style={{ whiteSpace: 'normal' }}>
                {s.name}
              </span>
              <span className="t2">
                {money(s.price)} / {s.unit}
              </span>
            </span>
            <div className="stepper" role="group" aria-label={`Số lượng ${s.name}`}>
              <button type="button" aria-label="Bớt" disabled={!qty[i]} onClick={() => step(i, -1)}>
                −
              </button>
              <output aria-live="polite" style={{ minWidth: 40 }}>
                {qty[i]}
              </output>
              <button type="button" aria-label="Thêm" onClick={() => step(i, 1)}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="help">Danh mục dịch vụ và giá sửa ở Loại phòng và giá.</p>
      <button type="button" className="btn btn-primary btn-block" disabled={!count} onClick={save}>
        {count ? `Thêm ${count} mục · ${money(sum)}` : 'Chọn dịch vụ'}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}

function DiscountSheet({ booking: b, room, owner, onClose }: SheetProps & { room: Room; owner: boolean }) {
  const record = useRecord()
  const [mode, setMode] = useState<'pct' | 'amt'>('pct')
  const [value, setValue] = useState<number>()
  const [reason, setReason] = useState('')
  const base = roomTotalOf(b, room)
  const amount = mode === 'pct' ? Math.round((base * Math.min(value || 0, 100)) / 100) : value || 0
  const limit = owner ? base : Math.floor(base * STAFF_DISCOUNT)
  const over =
    amount > limit &&
    (owner
      ? 'Không giảm quá tiền phòng.'
      : `Lễ tân giảm tối đa ${STAFF_DISCOUNT * 100}% tiền phòng (${money(limit)}). Mức cao hơn cần chủ cơ sở.`)

  function save() {
    record(
      () => {
        patchBooking(b.id, { discount: { amount, reason: reason.trim() } })
        logActivity(b, 'booking', 'Giảm giá', `${money(-amount)} · ${reason.trim()}`)
      },
      `Đã giảm ${money(amount)} · ghi vào nhật ký`,
    )
    onClose()
  }

  return (
    <Sheet title="Giảm giá" onClose={onClose}>
      <Segmented
        label="Kiểu giảm"
        value={mode}
        onChange={(m) => {
          setMode(m)
          setValue(undefined)
        }}
        options={[
          ['pct', 'Theo %'],
          ['amt', 'Số tiền'],
        ]}
      />
      <Field
        label={mode === 'pct' ? 'Phần trăm trên tiền phòng' : 'Số tiền giảm (đ)'}
        error={over}
        help={mode === 'pct' && amount > 0 ? `= ${money(amount)}` : undefined}
      >
        {(p) =>
          mode === 'pct' ? (
            <input
              {...p}
              type="text"
              inputMode="numeric"
              value={value ?? ''}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, '').slice(0, 3)
                setValue(d ? Number(d) : undefined)
              }}
            />
          ) : (
            <MoneyInput {...p} value={value} onChange={setValue} />
          )
        }
      </Field>
      <Field label="Lý do">
        {(p) => (
          <input
            {...p}
            type="text"
            placeholder="Ví dụ: khách quen lần thứ 4"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      <p className="help">Giảm giá được ghi vào nhật ký kèm tên người làm.</p>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={amount <= 0 || !!over || !reason.trim()}
        onClick={save}
      >
        Áp dụng {amount > 0 && money(-amount)}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}

function PaySheet({ booking: b, due, onClose }: SheetProps & { due: number }) {
  const actions = usePms((s) => s.actions)
  const record = useRecord()
  const [amount, setAmount] = useState<number | undefined>(due)
  const [method, setMethod] = useState<PayMethod>('bank')
  const bad = !amount || amount <= 0 ? 'Nhập số tiền lớn hơn 0.' : amount > due && `Không được lớn hơn ${money(due)}.`

  return (
    <Sheet title={`Thu ${money(due)}`} onClose={onClose}>
      <Segmented
        label="Hình thức"
        value={method}
        onChange={setMethod}
        options={Object.entries(PAY_METHOD) as [PayMethod, string][]}
      />
      <Field label="Số tiền (đ)" error={amount !== due && bad} help="Có thể thu một phần.">
        {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}
      </Field>
      {method === 'bank' && (
        <p className="help">
          Nội dung chuyển khoản: {bookingCode(b).replace('-', '')}. Kiểm tra tiền đã về tài khoản trước khi ghi nhận.
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!!bad}
        onClick={() => {
          record(() => actions.pay(b.id, amount!, method), `Đã ghi nhận ${money(amount!)}`)
          onClose()
        }}
      >
        Đã nhận {money(amount || 0)}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}

function InvoiceSheet({ booking: b, due, total, onClose }: SheetProps & { due: number; total: number }) {
  const [kind, setKind] = useState<'person' | 'company'>('person')
  const [name, setName] = useState(b.guest_name || '')
  const [tax, setTax] = useState('')
  const [company, setCompany] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [tried, setTried] = useState(false)
  const taxBad =
    kind === 'company' && ![10, 13].includes(tax.replace(/\D/g, '').length) && 'Mã số thuế gồm 10 hoặc 13 chữ số.'
  const emailBad = !/.+@.+\..+/.test(email) && 'Nhập email để nhận hoá đơn.'
  const ready = kind === 'company' ? company.trim() && address.trim() : name.trim()

  function send() {
    if (taxBad || emailBad) return setTried(true)
    const buyer = kind === 'company' ? company.trim() : name.trim()
    // ponytail: mock issue; the real invoice comes from the e-invoice provider through hueni-api.
    useGuests.setState((s) => ({
      invoices: {
        ...s.invoices,
        [b.id]: { buyer, tax_code: kind === 'company' ? tax : undefined, email, at: new Date().toISOString() },
      },
    }))
    logActivity(b, 'booking', 'Xuất hoá đơn', `${buyer} · ${money(total)}`)
    toast(`Đã phát hành hoá đơn, gửi tới ${email}`)
    onClose()
  }

  return (
    <Sheet title="Xuất hoá đơn điện tử" onClose={onClose}>
      <Segmented
        label="Người mua"
        value={kind}
        onChange={setKind}
        options={[
          ['person', 'Cá nhân'],
          ['company', 'Công ty'],
        ]}
      />
      {kind === 'company' ? (
        <>
          <Field label="Mã số thuế" error={tried && taxBad}>
            {(p) => (
              <input
                {...p}
                type="text"
                inputMode="numeric"
                value={tax}
                onChange={(e) => setTax(e.target.value.replace(/[^0-9-]/g, ''))}
              />
            )}
          </Field>
          <Field label="Tên công ty">
            {(p) => <input {...p} type="text" value={company} onChange={(e) => setCompany(e.target.value)} />}
          </Field>
          <Field label="Địa chỉ">
            {(p) => <input {...p} type="text" value={address} onChange={(e) => setAddress(e.target.value)} />}
          </Field>
        </>
      ) : (
        <Field label="Tên người mua">
          {(p) => <input {...p} type="text" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
      )}
      <Field label="Email nhận hoá đơn" error={tried && emailBad}>
        {(p) => <input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      {due > 0 && (
        <div className="notice">
          Khách còn nợ {money(due)}. Hoá đơn ghi đủ tổng {money(total)}.
        </div>
      )}
      <p className="help">
        Hoá đơn đã phát hành chỉ điều chỉnh hoặc thay thế được, không xoá được. Thuế suất theo cấu hình của cơ sở.
      </p>
      <button type="button" className="btn btn-primary btn-block" disabled={!ready} onClick={send}>
        Phát hành hoá đơn
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Đóng
      </button>
    </Sheet>
  )
}
