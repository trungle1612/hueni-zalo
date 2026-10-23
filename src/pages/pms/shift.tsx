import './ops.scss'

import dayjs from 'dayjs'
import React, { useState } from 'react'

import { A, AppBar, Field, KV, MoneyInput, Screen, Sec, Sheet, useCurrent } from '@/modules/pms/components/ui'
import { OPENING_CASH, STAFF, useOps } from '@/modules/pms/ops.store'
import { guestLabel, money, PAY_METHOD, usePms } from '@/modules/pms/pms.store'

const DENOMS = [500000, 200000, 100000, 50000, 20000, 10000]
const signed = (n: number) => (n > 0 ? `+${money(n)}` : money(n))
const isToday = (iso: string) => dayjs(iso).isSame(dayjs(), 'day')
const shiftName = (h = dayjs().hour()) =>
  h < 14 ? 'Ca sáng 06:00 – 14:00' : h < 22 ? 'Ca chiều 14:00 – 22:00' : 'Ca đêm 22:00 – 06:00'

// Giao ca: what the till should hold by the app, what was counted, and who takes over.
// ponytail: one shift per day per place; real shift boundaries come with the API.
export default function ShiftPage() {
  const { bookings, user } = usePms()
  const { place, rooms, roomOf } = useCurrent()
  const { expenses, closes } = useOps()
  const [byDenom, setByDenom] = useState(false)
  const [counted, setCounted] = useState<number>()
  const [denom, setDenom] = useState<Record<number, number>>({})
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const [next, setNext] = useState(STAFF.find((s) => s !== user.name) || STAFF[0])
  const [keep, setKeep] = useState<number | undefined>(OPENING_CASH)
  const [spend, setSpend] = useState<{ amount?: number; reason: string }>()

  const ids = new Set(rooms.map((r) => r.id))
  const pays = bookings
    .filter((b) => ids.has(b.room_id))
    .flatMap((b) => (b.payments || []).filter((p) => isToday(p.at)).map((p) => ({ p, b })))
  const cash = pays.filter((x) => x.p.method === 'cash')
  const other = pays.filter((x) => x.p.method !== 'cash')
  const spends = expenses.filter((e) => e.place_id === place.id && isToday(e.at))
  const cashIn = cash.reduce((n, x) => n + x.p.amount, 0)
  const spent = spends.reduce((n, e) => n + e.amount, 0)
  const expected = OPENING_CASH + cashIn - spent

  const denomSum = DENOMS.reduce((n, d) => n + d * (denom[d] || 0), 0)
  const count = byDenom ? denomSum : counted || 0
  const hasCount = byDenom ? denomSum > 0 : counted !== undefined
  const diff = count - expected
  const needNote = hasCount && diff !== 0
  const noteErr = tried && needNote && !note.trim()
  const keepErr = hasCount && (keep || 0) > count
  const closed = closes.find((c) => c.place_id === place.id && isToday(c.at))

  if (closed) {
    const d = closed.counted - closed.expected
    return (
      <Screen>
        <AppBar lead="back" title="Đã chốt ca" sub={`${shiftName(dayjs(closed.at).hour())} · ${user.name}`} />
        <main className="scroll">
          <div className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="ok-box" role="status">
              <b>Đã chốt ca lúc {dayjs(closed.at).format('HH:mm')}</b>
              <span>
                {d === 0
                  ? 'Két khớp. Báo cáo ca đã gửi chủ cơ sở.'
                  : `Két lệch ${signed(d)}, lý do đã gửi chủ cơ sở: “${closed.note}”.`}
              </span>
            </div>
            <dl className="panel">
              <KV label="Phải có trong két">{money(closed.expected)}</KV>
              <KV label="Đếm được">{money(closed.counted)}</KV>
              <KV label="Chênh lệch" total>
                {signed(d)}
              </KV>
              <KV label="Để lại cho ca sau">{money(closed.keep)}</KV>
              <KV label="Nộp chủ cơ sở">{money(closed.counted - closed.keep)}</KV>
              <KV label="Người nhận ca">{closed.next}</KV>
            </dl>
            <A className="btn btn-block" to="/more" replace>
              Xong
            </A>
          </div>
        </main>
      </Screen>
    )
  }

  function close() {
    if (needNote && !note.trim()) return setTried(true)
    useOps.setState((s) => ({
      closes: [
        ...s.closes,
        {
          place_id: place.id,
          at: new Date().toISOString(),
          expected,
          counted: count,
          keep: keep || 0,
          next,
          note: note.trim(),
        },
      ],
    }))
  }

  return (
    <Screen>
      <AppBar lead="back" title="Giao ca" sub={`${shiftName()} · ${user.name}`} />
      <main className="scroll">
        <Sec
          title="Tiền mặt theo app"
          aside={
            <button type="button" className="link" onClick={() => setSpend({ reason: '' })}>
              + Ghi khoản chi
            </button>
          }
        >
          <dl className="panel">
            <KV label="Đầu ca (nhận từ ca trước)">{money(OPENING_CASH)}</KV>
            <KV label={`Thu tiền mặt · ${cash.length} khoản`}>{signed(cashIn)}</KV>
            {cash.map(({ p, b }, i) => (
              <div className="kv sub" key={i}>
                <dt>
                  P{roomOf(b.room_id)?.name} {guestLabel(b)} · {p.amount < 0 ? 'hoàn tiền' : p.deposit ? 'cọc' : 'thu'}
                </dt>
                <dd>{money(p.amount)}</dd>
              </div>
            ))}
            <KV label={`Chi · ${spends.length} khoản`}>{money(-spent)}</KV>
            {spends.map((e, i) => (
              <div className="kv sub" key={i}>
                <dt>{e.reason}</dt>
                <dd>{money(e.amount)}</dd>
              </div>
            ))}
            <KV label="Phải có trong két" total>
              {money(expected)}
            </KV>
          </dl>
          {other.length > 0 && (
            <p className="help" style={{ marginTop: 8 }}>
              {other
                .map((x) => PAY_METHOD[x.p.method])
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(' và ')}{' '}
              trong ca: {money(other.reduce((n, x) => n + x.p.amount, 0))} ({other.length} khoản) — không tính vào két.
            </p>
          )}
        </Sec>

        <Sec
          title="Đếm tiền trong két"
          aside={
            <button type="button" className="link" aria-pressed={byDenom} onClick={() => setByDenom(!byDenom)}>
              {byDenom ? 'Nhập tổng' : 'Đếm theo mệnh giá'}
            </button>
          }
        >
          <div className="panel form">
            {byDenom && (
              <div className="denoms">
                {DENOMS.map((d) => (
                  <Field key={d} label={`${d / 1000}k × tờ`}>
                    {(p) => (
                      <input
                        {...p}
                        type="text"
                        inputMode="numeric"
                        value={denom[d] ?? ''}
                        onChange={(e) => setDenom({ ...denom, [d]: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                      />
                    )}
                  </Field>
                ))}
              </div>
            )}
            <Field label="Tổng tiền đếm được (đ)">
              {(p) =>
                byDenom ? (
                  <input {...p} type="text" readOnly value={hasCount ? money(denomSum) : ''} />
                ) : (
                  <MoneyInput {...p} placeholder="0" value={counted} onChange={setCounted} />
                )
              }
            </Field>
            {hasCount && (
              <div className={`result ${diff === 0 ? 'ok' : diff < 0 ? 'short' : 'over'}`} role="status">
                <span>{diff === 0 ? 'Khớp với app' : diff < 0 ? 'Thiếu so với app' : 'Thừa so với app'}</span>
                <span>{signed(diff)}</span>
              </div>
            )}
            {needNote && (
              <Field
                label="Giải thích chênh lệch"
                error={noteErr && 'Cần ghi lý do khi két bị lệch. Chủ cơ sở sẽ nhận thông báo.'}
              >
                {(p) => (
                  <textarea
                    {...p}
                    value={note}
                    placeholder="Ví dụ: thối nhầm cho khách P101"
                    onChange={(e) => setNote(e.target.value)}
                  />
                )}
              </Field>
            )}
          </div>
        </Sec>

        <Sec title="Bàn giao">
          <div className="panel form">
            <Field label="Người nhận ca sau">
              {(p) => (
                <select {...p} value={next} onChange={(e) => setNext(e.target.value)}>
                  {STAFF.filter((s) => s !== user.name).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              label="Để lại trong két cho ca sau (đ)"
              error={keepErr && 'Không thể để lại nhiều hơn số tiền đếm được.'}
              help={`Phần còn lại (${money(Math.max(count - (keep || 0), 0))}) nộp cho chủ cơ sở.`}
            >
              {(p) => <MoneyInput {...p} value={keep} onChange={setKeep} />}
            </Field>
          </div>
        </Sec>
        <div className="end" />
      </main>
      <div className="footer-bar">
        <button type="button" className="btn btn-primary btn-block" disabled={!hasCount || keepErr} onClick={close}>
          Chốt ca và bàn giao
        </button>
      </div>

      {spend && (
        <Sheet title="Ghi khoản chi tiền mặt" onClose={() => setSpend(undefined)}>
          <Field label="Số tiền (đ)">
            {(p) => <MoneyInput {...p} value={spend.amount} onChange={(amount) => setSpend({ ...spend, amount })} />}
          </Field>
          <Field label="Lý do">
            {(p) => (
              <input
                {...p}
                type="text"
                placeholder="Ví dụ: mua nước suối"
                value={spend.reason}
                onChange={(e) => setSpend({ ...spend, reason: e.target.value })}
              />
            )}
          </Field>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!spend.amount || !spend.reason.trim()}
            onClick={() => {
              useOps.setState((s) => ({
                expenses: [
                  ...s.expenses,
                  {
                    place_id: place.id,
                    amount: spend.amount!,
                    reason: spend.reason.trim(),
                    at: new Date().toISOString(),
                  },
                ],
              }))
              setSpend(undefined)
            }}
          >
            Ghi khoản chi
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setSpend(undefined)}>
            Đóng
          </button>
        </Sheet>
      )}
    </Screen>
  )
}
