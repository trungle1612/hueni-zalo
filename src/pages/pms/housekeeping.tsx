import './ops.scss'

import React, { useState } from 'react'

import { AppBar, Badge, Field, Screen, Sec, Sheet, toast, useCurrent, useRecord } from '@/modules/pms/components/ui'
import { CHECKLIST, cleanOf, patchClean, STAFF, useOps } from '@/modules/pms/ops.store'
import { fmtDate, guestLabel, isStaying, needsCleaning, Room, today, usePms } from '@/modules/pms/pms.store'

type Task = { room: Room; daily: boolean; note: string; urgent: boolean; done: boolean; who: string; started: boolean }

// Buồng phòng: a cleaning job per dirty room (made by checkout), plus a daily tidy for rooms with guests in.
export default function HousekeepingPage() {
  const { bookings, actions } = usePms()
  const { cleans } = useOps()
  const { rooms } = useCurrent()
  const record = useRecord()
  const [openId, setOpenId] = useState<number>()
  const [issue, setIssue] = useState('')
  const [photo, setPhoto] = useState(false)

  const tasks = rooms.flatMap((room): Task[] => {
    const c = cleanOf(cleans, room.id)
    const mine = bookings.filter((b) => b.room_id === room.id && b.status !== 'cancelled' && !b.checked_out_at)
    const staying = mine.find(isStaying)
    const next = mine
      .filter((b) => !b.checked_in_at && b.start_date >= today())
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    const base = { room, who: c.who, started: !!c.started }
    // Dirty: finished only when the room is clean again (an undo of Dọn xong brings the job back).
    if (needsCleaning(room))
      return [
        {
          ...base,
          daily: !!staying,
          done: false,
          urgent: !staying && next?.start_date === today(),
          note: staying
            ? `${guestLabel(staying)} đang ở · dọn khi khách ra ngoài`
            : next
              ? `${guestLabel(next)} đến ${next.start_date === today() ? 'hôm nay' : fmtDate(next.start_date)}`
              : 'Chưa có khách mới',
        },
      ]
    if (c.done === today() && !staying)
      return [{ ...base, daily: false, done: true, urgent: false, note: 'Đã dọn xong' }]
    if (staying)
      return [
        {
          ...base,
          daily: true,
          done: c.done === today(),
          urgent: false,
          note: `${guestLabel(staying)} đang ở · dọn khi khách ra ngoài`,
        },
      ]
    return []
  })
  const left = tasks.filter((t) => !t.done)
  const urgent = left.filter((t) => t.urgent).length

  function finish(t: Task) {
    const extra = issue.trim() ? ' · đã báo hỏng cho chủ cơ sở' : ''
    if (t.daily && !needsCleaning(t.room)) {
      patchClean(t.room.id, { done: today() })
      toast(`Đã dọn phòng ${t.room.name}${extra}`)
    } else {
      const error = record(() => actions.clean(t.room.id), `Phòng ${t.room.name} đã sẵn sàng${extra}`)
      if (error) return toast(error)
      patchClean(t.room.id, { done: today() })
    }
    // ponytail: the damage note only goes into the toast; it becomes a room issue for the owner with the API.
    setOpenId(undefined)
  }

  const open = tasks.find((t) => t.room.id === openId)
  const c = open && cleanOf(cleans, open.room.id)
  const ticked = c ? c.checks.filter(Boolean).length : 0
  const order = (a: Task, b: Task) => Number(a.done) - Number(b.done) || Number(b.urgent) - Number(a.urgent)
  const groups = ['', ...STAFF]
    .map((who) => ({ who, items: tasks.filter((t) => t.who === who).sort(order) }))
    .filter((g) => g.items.length)

  return (
    <Screen>
      <AppBar
        lead="back"
        title="Buồng phòng"
        sub={`Hôm nay · ${left.length} việc chưa xong${urgent ? ` · ${urgent} gấp` : ''}`}
      />
      <main className="scroll">
        {!tasks.length && <div className="empty">Không có phòng cần dọn hôm nay.</div>}
        {groups.map((g) => (
          <Sec key={g.who} title={g.who || 'Chưa giao'} aside={<span className="aside">{g.items.length} việc</span>}>
            <div className="panel">
              {g.items.map((t) => {
                const nextLabel = t.done ? '' : t.started ? 'Xong' : 'Bắt đầu'
                const kind = t.daily ? 'Dọn hằng ngày' : 'Dọn sau trả phòng'
                return (
                  <div className="row" key={t.room.id}>
                    <button
                      type="button"
                      className="row-main"
                      aria-label={`Phòng ${t.room.name}, ${kind}, mở chi tiết`}
                      onClick={() => (setOpenId(t.room.id), setIssue(''), setPhoto(false))}
                    >
                      <span className="rn">{t.room.name}</span>
                      <span className="grow">
                        <span className="t1">{kind}</span>
                        <span className="t2 wrap">
                          {t.note}
                          {t.started && !t.done && ' · đang dọn'}
                        </span>
                        {t.urgent && <span className="t2 urgent">Gấp · khách đến hôm nay</span>}
                      </span>
                    </button>
                    {nextLabel && t.who && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`${nextLabel} dọn phòng ${t.room.name}`}
                        onClick={() =>
                          t.started
                            ? (setOpenId(t.room.id), setIssue(''), setPhoto(false))
                            : patchClean(t.room.id, { started: true })
                        }
                      >
                        {nextLabel}
                      </button>
                    )}
                    {t.done && <Badge tone="positive">Xong</Badge>}
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

      {open && c && (
        <Sheet
          title={`Phòng ${open.room.name} · ${open.daily ? 'Dọn hằng ngày' : 'Dọn sau trả phòng'}`}
          onClose={() => setOpenId(undefined)}
        >
          <p className="help">{open.note}</p>
          <Field label="Người làm">
            {(p) => (
              <select {...p} value={c.who} onChange={(e) => patchClean(open.room.id, { who: e.target.value })}>
                <option value="">Chưa giao</option>
                {STAFF.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
          </Field>
          <div className="field">
            <span className="lbl" id="hk-c">
              Việc cần làm · {ticked}/{CHECKLIST.length}
            </span>
            <div className="panel" role="group" aria-labelledby="hk-c" style={{ padding: '0 12px' }}>
              {CHECKLIST.map((label, i) => (
                <label className="check" key={label}>
                  <input
                    type="checkbox"
                    checked={c.checks[i]}
                    disabled={open.done}
                    onChange={() =>
                      patchClean(open.room.id, { checks: c.checks.map((v, k) => (k === i ? !v : v)), started: true })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Field label="Báo hỏng hoặc thiếu đồ" optional>
            {(p) => (
              <textarea
                {...p}
                placeholder="Ví dụ: vòi sen rỉ nước"
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
              />
            )}
          </Field>
          {/* ponytail: no camera yet; becomes zmp-sdk chooseImage. */}
          <button type="button" className="photo" onClick={() => setPhoto(true)}>
            {photo ? 'Đã thêm 1 ảnh · chạm để chụp lại' : '+ Chụp ảnh chỗ hỏng'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={open.done || ticked < CHECKLIST.length || !c.who}
            onClick={() => finish(open)}
          >
            {open.done
              ? 'Đã xong'
              : !c.who
                ? 'Giao người làm trước'
                : ticked < CHECKLIST.length
                  ? `Còn ${CHECKLIST.length - ticked} việc chưa đánh dấu`
                  : open.daily
                    ? 'Xong'
                    : 'Xong, phòng sẵn sàng'}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setOpenId(undefined)}>
            Đóng
          </button>
        </Sheet>
      )}
    </Screen>
  )
}
