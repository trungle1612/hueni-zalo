import './ops.scss'

import dayjs from 'dayjs'
import React, { useState } from 'react'

import { A, AppBar, Field, KV, MoneyInput, Screen, Sec, Sheet, Spinner, useCurrent } from '@/modules/pms/components/ui'
import { Expense, ShiftClose, STAFF } from '@/modules/pms/ops.store'
import { can, money, usePms } from '@/modules/pms/pms.store'
import { useMemberIds, useShift } from '@/modules/pms/remote'

const DENOMS = [500000, 200000, 100000, 50000, 20000, 10000]
const signed = (n: number) => (n > 0 ? `+${money(n)}` : money(n))

// Giao ca (#27): the till since the last close as hueni-api computes it, what was counted, and who takes over.
// The server checks the close (keep ≤ counted, a note on a difference) and answers in Vietnamese.
export default function ShiftPage() {
  const { user } = usePms()
  const { place } = useCurrent()
  const { shift, error: loadError, addExpense, updateExpense, deleteExpense, close } = useShift(place.id)
  const [byDenom, setByDenom] = useState(false)
  const [counted, setCounted] = useState<number>()
  const [denom, setDenom] = useState<Record<number, number>>({})
  const [note, setNote] = useState('')
  const others = useMemberIds(place.id, STAFF).filter((m) => m.id !== user.id)
  const [picked, setNext] = useState<number>()
  const next = picked ?? others[0]?.id
  const [keep, setKeep] = useState<number | null>() // undefined: not touched, take the opening
  const [spend, setSpend] = useState<{ id?: number; amount?: number; reason: string; error?: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<ShiftClose>()

  if (done) {
    const d = done.difference
    return (
      <Screen>
        <AppBar lead="back" title="Đã chốt ca" sub={done.by || user.name} />
        <main className="scroll">
          <div className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="ok-box" role="status">
              <b>Đã chốt ca lúc {dayjs(done.at).format('HH:mm')}</b>
              <span>
                {d === 0 ? 'Két khớp. Báo cáo ca đã gửi chủ cơ sở.' : `Két lệch ${signed(d)}, lý do: “${done.note}”.`}
              </span>
            </div>
            <dl className="panel">
              <KV label="Phải có trong két">{money(done.expected)}</KV>
              <KV label="Đếm được">{money(done.counted)}</KV>
              <KV label="Chênh lệch" total>
                {signed(d)}
              </KV>
              <KV label="Để lại cho ca sau">{money(done.keep)}</KV>
              <KV label="Nộp chủ cơ sở">{money(done.counted - done.keep)}</KV>
              <KV label="Người nhận ca">
                {done.handed_to || others.find((m) => m.id === done.handed_to_id)?.name || '—'}
              </KV>
            </dl>
            <A className="btn btn-block" to="/more" replace>
              Xong
            </A>
          </div>
        </main>
      </Screen>
    )
  }

  if (!shift)
    return (
      <Screen>
        <AppBar lead="back" title="Giao ca" />
        <main className="scroll">
          <div className="sec">
            {loadError ? (
              <div className="alert" role="alert">
                {loadError}
              </div>
            ) : (
              <Spinner />
            )}
          </div>
        </main>
      </Screen>
    )

  const denomSum = DENOMS.reduce((n, d) => n + d * (denom[d] || 0), 0)
  const count = byDenom ? denomSum : counted || 0
  const hasCount = byDenom ? denomSum > 0 : counted !== undefined
  const diff = count - shift.expected
  const left = keep === undefined ? shift.opening : keep
  const other = [
    shift.other.bank && `chuyển khoản ${money(shift.other.bank)}`,
    shift.other.card && `thẻ ${money(shift.other.card)}`,
  ].filter(Boolean)
  const mine = (e: Expense) => e.user_id === user.id || can(place, 'manage')

  async function run(f: () => Promise<string | void>) {
    setBusy(true)
    const err = await f()
    setBusy(false)
    return err
  }

  async function submit() {
    const r = await run(async () => {
      const c = await close({
        ...(byDenom ? { denominations: Object.fromEntries(DENOMS.map((d) => [d, denom[d] || 0])) } : { counted }),
        keep: left ?? undefined,
        handed_to_id: next,
        note: note.trim(),
      })
      if (typeof c === 'string') return c
      setDone(c)
    })
    setError(r || undefined)
  }

  async function saveSpend() {
    const s = spend!
    const body = { amount: s.amount!, reason: s.reason.trim() }
    const err = await run(() => (s.id ? updateExpense(s.id, body) : addExpense(body)))
    setSpend(err ? { ...s, error: err } : undefined)
  }

  return (
    <Screen>
      <AppBar
        lead="back"
        title="Giao ca"
        sub={shift.since ? `Từ ${dayjs(shift.since).format('HH:mm DD/MM')} · ${user.name}` : user.name}
      />
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
            <KV label="Đầu ca (nhận từ ca trước)">{money(shift.opening)}</KV>
            <KV label="Thu tiền mặt">{signed(shift.cash_in)}</KV>
            {shift.cash_out > 0 && <KV label="Hoàn tiền mặt cho khách">{money(-shift.cash_out)}</KV>}
            <KV label={`Chi · ${shift.expenses.length} khoản`}>{money(-shift.expenses_total)}</KV>
            {shift.expenses.map((e) => (
              <div className="kv sub" key={e.id}>
                <dt>
                  {mine(e) ? (
                    <button
                      type="button"
                      className="link"
                      onClick={() => setSpend({ id: e.id, amount: e.amount, reason: e.reason })}
                    >
                      {e.reason}
                    </button>
                  ) : (
                    e.reason
                  )}
                  {e.by && ` · ${e.by}`}
                </dt>
                <dd>{money(e.amount)}</dd>
              </div>
            ))}
            <KV label="Phải có trong két" total>
              {money(shift.expected)}
            </KV>
          </dl>
          {other.length > 0 && (
            <p className="help" style={{ marginTop: 8 }}>
              Trong ca có {other.join(' và ')}, không tính vào két.
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
            {hasCount && diff !== 0 && (
              <Field label="Giải thích chênh lệch" help="Két lệch thì cần ghi lý do. Chủ cơ sở sẽ thấy.">
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
                <select {...p} value={next} onChange={(e) => setNext(Number(e.target.value))}>
                  {others.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              label="Để lại trong két cho ca sau (đ)"
              help={`Phần còn lại (${money(Math.max(count - (left || 0), 0))}) nộp cho chủ cơ sở.`}
            >
              {(p) => <MoneyInput {...p} value={left ?? undefined} onChange={(v) => setKeep(v ?? null)} />}
            </Field>
          </div>
        </Sec>
        {error && (
          <div className="sec">
            <div className="alert" role="alert">
              {error}
            </div>
          </div>
        )}
        <div className="end" />
      </main>
      <div className="footer-bar">
        <button type="button" className="btn btn-primary btn-block" disabled={!hasCount || busy} onClick={submit}>
          Chốt ca và bàn giao
        </button>
      </div>

      {spend && (
        <Sheet title={spend.id ? 'Sửa khoản chi' : 'Ghi khoản chi tiền mặt'} onClose={() => setSpend(undefined)}>
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
          {spend.error && (
            <div className="alert" role="alert">
              {spend.error}
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!spend.amount || !spend.reason.trim() || busy}
            onClick={saveSpend}
          >
            {spend.id ? 'Lưu' : 'Ghi khoản chi'}
          </button>
          {spend.id && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={busy}
              onClick={async () => {
                const err = await run(() => deleteExpense(spend.id!))
                setSpend(err ? { ...spend, error: err } : undefined)
              }}
            >
              Xoá khoản chi
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setSpend(undefined)}>
            Đóng
          </button>
        </Sheet>
      )}
    </Screen>
  )
}
