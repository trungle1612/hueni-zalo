import './ops.scss'

import React, { useEffect, useState } from 'react'

import { AppBar, Badge, Field, Screen, Sec, Sheet, toast, useCurrent } from '@/modules/pms/components/ui'
import { STAFF } from '@/modules/pms/ops.store'
import { Cleaning, cleaning, fetchHousekeeping, Housekeeping, useTeam } from '@/modules/pms/remote'

const kindOf = (t: Cleaning) => (t.kind === 'daily' ? 'Dọn hằng ngày' : 'Dọn sau trả phòng')
const whoOf = (t: Cleaning) => t.task?.assignee_name || ''
const noteOf = (t: Cleaning) =>
  t.task?.done_at
    ? 'Đã dọn xong'
    : t.kind === 'daily'
      ? 'Khách đang ở · dọn khi khách ra ngoài'
      : t.task?.started_at
        ? 'Đang dọn'
        : 'Chưa bắt đầu'

// Buồng phòng (#26): the server lists today's jobs (dirty rooms, rooms with a guest in) and decides every rule;
// this screen shows them grouped by person and sends each tap.
export default function HousekeepingPage() {
  const { place } = useCurrent()
  const team = useTeam(place.id, STAFF)
  const [data, setData] = useState<Housekeeping | string>()
  const [openId, setOpenId] = useState<number>()
  const [issue, setIssue] = useState('')
  const [busy, setBusy] = useState(false) // a tick is built from the last reply, so wait for it

  useEffect(() => {
    fetchHousekeeping(place.id).then(setData)
  }, [place.id])

  const rows = typeof data === 'object' ? data.rows : []
  const checklist = typeof data === 'object' ? data.checklist : []

  // Send a write; its answer replaces the room's row. A refusal shows the server's sentence.
  async function run(roomId: number, write: Promise<Cleaning | string>, text?: string, undo?: () => void) {
    setBusy(true)
    const r = await write.finally(() => setBusy(false))
    if (typeof r === 'string') {
      toast(r)
      return false
    }
    setData((d) => (typeof d === 'object' ? { ...d, rows: d.rows.map((x) => (x.room_id === roomId ? r : x)) } : d))
    if (text) toast(text, undo)
    return true
  }
  const undo = (t: Cleaning) => () => run(t.room_id, cleaning.undo(t.room_id), `Đã hoàn tác dọn phòng ${t.room_name}`)
  const show = (t: Cleaning) => (setOpenId(t.room_id), setIssue(t.damage_note || ''))

  const left = rows.filter((t) => !t.task?.done_at)
  const urgent = left.filter((t) => t.urgent).length
  const order = (a: Cleaning, b: Cleaning) => Number(!!a.task?.done_at) - Number(!!b.task?.done_at)
  const groups = ['', ...rows.map(whoOf)]
    .filter((who, i, all) => all.indexOf(who) === i)
    .map((who) => ({ who, items: rows.filter((t) => whoOf(t) === who).sort(order) }))
    .filter((g) => g.items.length)

  const open = rows.find((t) => t.room_id === openId)
  const checks = open?.task?.checks || checklist.map(() => false)
  const ticked = checks.filter(Boolean).length

  return (
    <Screen>
      <AppBar
        lead="back"
        title="Buồng phòng"
        sub={`Hôm nay · ${left.length} việc chưa xong${urgent ? ` · ${urgent} gấp` : ''}`}
      />
      <main className="scroll">
        {typeof data !== 'object' && <div className="empty">{data || 'Đang tải…'}</div>}
        {typeof data === 'object' && !rows.length && <div className="empty">Không có phòng cần dọn hôm nay.</div>}
        {groups.map((g) => (
          <Sec key={g.who} title={g.who || 'Chưa giao'} aside={<span className="aside">{g.items.length} việc</span>}>
            <div className="panel">
              {g.items.map((t) => {
                const done = !!t.task?.done_at
                const started = !!t.task?.started_at
                return (
                  <div className="row" key={t.room_id}>
                    <button
                      type="button"
                      className="row-main"
                      aria-label={`Phòng ${t.room_name}, ${kindOf(t)}, mở chi tiết`}
                      onClick={() => show(t)}
                    >
                      <span className="rn">{t.room_name}</span>
                      <span className="grow">
                        <span className="t1">{kindOf(t)}</span>
                        <span className="t2 wrap">{noteOf(t)}</span>
                        {t.damage_note && <span className="t2 wrap">Báo hỏng: {t.damage_note}</span>}
                        {t.urgent && !done && <span className="t2 urgent">Gấp · khách đến hôm nay</span>}
                      </span>
                    </button>
                    {t.kind === 'checkout' && !done && t.task?.assignee_id && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`${started ? 'Xong' : 'Bắt đầu'} dọn phòng ${t.room_name}`}
                        onClick={() =>
                          started ? show(t) : run(t.room_id, cleaning.change(t.room_id, { start: true }))
                        }
                      >
                        {started ? 'Xong' : 'Bắt đầu'}
                      </button>
                    )}
                    {done && <Badge tone="positive">Xong</Badge>}
                  </div>
                )
              })}
            </div>
          </Sec>
        ))}
        <div className="sec">
          <p className="help">
            Việc dọn được tạo tự động khi khách trả phòng. Phòng chỉ hiện “Sẵn sàng” trên màn Phòng sau khi việc dọn
            xong.
          </p>
        </div>
        <div className="end" />
      </main>

      {open && (
        <Sheet title={`Phòng ${open.room_name} · ${kindOf(open)}`} onClose={() => setOpenId(undefined)}>
          <p className="help">{noteOf(open)}</p>
          {open.kind === 'checkout' && (
            <>
              <Field label="Người làm">
                {(p) => (
                  <select
                    {...p}
                    value={open.task?.assignee_id ?? ''}
                    disabled={busy || !!open.task?.done_at}
                    onChange={(e) =>
                      run(open.room_id, cleaning.change(open.room_id, { assignee_id: Number(e.target.value) }))
                    }
                  >
                    <option value="" disabled>
                      Chưa giao
                    </option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <div className="field">
                <span className="lbl" id="hk-c">
                  Việc cần làm · {ticked}/{checklist.length}
                </span>
                <div className="panel" role="group" aria-labelledby="hk-c" style={{ padding: '0 12px' }}>
                  {checklist.map((label, i) => (
                    <label className="check" key={label}>
                      <input
                        type="checkbox"
                        checked={checks[i]}
                        disabled={busy || !!open.task?.done_at}
                        onChange={() =>
                          run(
                            open.room_id,
                            cleaning.change(open.room_id, {
                              checks: checks.map((v, k) => (k === i ? !v : v)),
                              start: true,
                            }),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
          <Field label="Báo hỏng hoặc thiếu đồ" optional>
            {(p) => (
              <textarea
                {...p}
                placeholder="Ví dụ: vòi sen rỉ nước"
                maxLength={200}
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
              />
            )}
          </Field>
          {issue.trim() !== (open.damage_note || '') && (
            <button
              type="button"
              className="btn btn-block"
              onClick={() =>
                run(
                  open.room_id,
                  cleaning.damage(open.room_id, issue),
                  issue.trim() ? 'Đã báo hỏng cho chủ cơ sở' : 'Đã xoá báo hỏng',
                )
              }
            >
              {issue.trim() ? 'Gửi báo hỏng' : 'Đã sửa xong, xoá báo hỏng'}
            </button>
          )}
          {open.kind === 'checkout' &&
            (open.task?.done_at ? (
              <button type="button" className="btn btn-block" onClick={undo(open)}>
                Hoàn tác dọn xong
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={async () => {
                  const ok = await run(
                    open.room_id,
                    cleaning.finish(open.room_id),
                    `Phòng ${open.room_name} đã sẵn sàng`,
                    undo(open),
                  )
                  if (ok) setOpenId(undefined)
                }}
              >
                Xong, phòng sẵn sàng
              </button>
            ))}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setOpenId(undefined)}>
            Đóng
          </button>
        </Sheet>
      )}
    </Screen>
  )
}
