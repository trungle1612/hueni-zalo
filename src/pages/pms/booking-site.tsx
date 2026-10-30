import './sales.scss'

import React, { useState } from 'react'

import { A, AppBar, Field, PlaceSub, Screen, Sec, Segmented, toast, useCurrent } from '@/modules/pms/components/ui'
import { addDays, can, isOpen, isRoomFree, money, ROOM_TYPE, today, usePms } from '@/modules/pms/pms.store'
import { useBookingSite } from '@/modules/pms/remote'
import { Site } from '@/modules/pms/sales.store'

const HOLDS: [Site['hold_minutes'], string][] = [
  [15, '15 phút'],
  [30, '30 phút'],
  [120, '2 giờ'],
]
const DEPOSITS: [string, string][] = [
  ['0', 'Không'],
  ['30', '30%'],
  ['50', '50%'],
  ['100', '100%'],
]

// Owner only: what the direct booking page on hueni.me offers. Guests book without OTA commission.
export default function BookingSitePage() {
  const bookings = usePms((s) => s.bookings)
  const { place, rooms } = useCurrent()
  const { site: saved, save } = useBookingSite(place.id)
  const [draft, setDraft] = useState<Site>()
  const [busy, setBusy] = useState(false)

  if (!can(place, 'manage')) {
    return (
      <Screen>
        <AppBar lead="back" title="Trang đặt phòng riêng" sub={<PlaceSub />} />
        <main className="scroll">
          <div className="sec">
            <div className="panel msg">
              <h2>Chỉ chủ cơ sở thiết lập trang đặt phòng</h2>
              <p>Đặt phòng từ trang này vẫn hiện trên Hôm nay và Lịch như mọi đặt phòng khác.</p>
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

  if (!saved)
    return (
      <Screen>
        <AppBar lead="back" title="Trang đặt phòng riêng" sub={<PlaceSub />} />
        <main className="scroll">
          <div className="empty">Đang tải…</div>
        </main>
      </Screen>
    )
  const f = draft || saved
  const set = (p: Partial<Site>) => setDraft({ ...f, ...p })

  // One line per room type (ROOM_TYPE key): lowest price, rooms free tonight. Rooms without a type are never offered.
  const open = rooms.filter((r) => r.active)
  const keyOf = (kind?: string) => Object.keys(ROOM_TYPE).find((k) => ROOM_TYPE[k] === kind)
  const untyped = open.filter((r) => !keyOf(r.kind)).length
  const kinds = Object.keys(ROOM_TYPE)
    .map((key) => {
      const list = open.filter((r) => keyOf(r.kind) === key)
      const prices = list.map((r) => r.price).filter((p): p is number => !!p)
      return {
        key,
        name: ROOM_TYPE[key],
        count: list.length,
        from: prices.length ? Math.min(...prices) : undefined,
        left: list.filter((r) => isOpen(r) && isRoomFree(bookings, r.id, today(), addDays(today(), 1))).length,
      }
    })
    .filter((k) => k.count)
  const shown = kinds.filter((k) => !f.hidden_room_types.includes(k.key))
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved)

  async function submit() {
    setBusy(true)
    const error = await save(f)
    setBusy(false)
    if (error) return toast(error)
    setDraft(undefined)
    toast('Đã cập nhật trang đặt phòng')
  }

  return (
    <Screen>
      <AppBar lead="back" title="Trang đặt phòng riêng" sub={<PlaceSub prefix="Không mất hoa hồng" />} />
      <main className="scroll">
        <div className="sec">
          <div className="panel form">
            <div className="switch-row">
              <div>
                <div style={{ fontWeight: 600 }} id="site-open">
                  {f.open ? 'Đang nhận đặt phòng online' : 'Tạm ngưng nhận đặt phòng'}
                </div>
                <p className="help">
                  {f.open
                    ? 'Khách chọn ngày, chọn phòng và cọc trên trang này.'
                    : 'Trang vẫn mở được nhưng khách chỉ thấy “Tạm ngưng nhận đặt phòng” và số điện thoại.'}
                </p>
              </div>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={f.open}
                aria-labelledby="site-open"
                onClick={() => set({ open: !f.open })}
              >
                <span />
              </button>
            </div>
          </div>
        </div>

        <Sec title="Phòng hiển thị">
          <div className="panel form">
            {kinds.map((k) => {
              const on = !f.hidden_room_types.includes(k.key)
              const id = `kind-${k.key}`
              return (
                <div key={k.key} className="switch-row">
                  <div>
                    <div style={{ fontWeight: 600 }} id={id}>
                      {k.name}
                    </div>
                    <p className="help">
                      {k.count} phòng{k.from ? ` · từ ${money(k.from)}/đêm` : ' · chưa có giá'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="switch"
                    role="switch"
                    aria-checked={on}
                    aria-labelledby={id}
                    onClick={() =>
                      set({
                        hidden_room_types: on
                          ? [...f.hidden_room_types, k.key]
                          : f.hidden_room_types.filter((x) => x !== k.key),
                      })
                    }
                  >
                    <span />
                  </button>
                </div>
              )
            })}
          </div>
          {untyped > 0 && (
            <p className="help" style={{ marginTop: 8 }}>
              {untyped} phòng chưa có loại nên không hiện trên trang. <A to="/rooms">Đặt loại phòng</A>
            </p>
          )}
          {f.open && !shown.length && (
            <div className="error">Bật ít nhất một loại phòng, nếu không khách không đặt được.</div>
          )}
        </Sec>

        <Sec title="Cọc và giữ phòng">
          <div className="panel form">
            <div className="field">
              <span className="lbl">Khách cọc trước</span>
              <Segmented
                label="Mức cọc"
                value={String(f.deposit_percent)}
                options={DEPOSITS}
                onChange={(v) => set({ deposit_percent: Number(v) as Site['deposit_percent'] })}
              />
            </div>
            <div className="grid2">
              <Field label="Giữ phòng chờ cọc">
                {(p) => (
                  <select
                    {...p}
                    value={f.hold_minutes}
                    disabled={!f.deposit_percent}
                    onChange={(e) => set({ hold_minutes: Number(e.target.value) as Site['hold_minutes'] })}
                  >
                    {HOLDS.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Hạn đặt trong ngày">
                {(p) => (
                  <select
                    {...p}
                    value={f.cutoff_hour}
                    onChange={(e) => set({ cutoff_hour: Number(e.target.value) as Site['cutoff_hour'] })}
                  >
                    {[18, 20, 22].map((h) => (
                      <option key={h} value={h}>
                        đến {h}:00
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <p className="help">
              {f.deposit_percent
                ? 'Hết thời gian giữ mà chưa thu đồng nào, đặt phòng tự huỷ và phòng mở lại. Ghi thanh toán hoặc nhận phòng là hết giữ.'
                : 'Không cọc thì không giữ: khách trả khi nhận phòng.'}
            </p>
          </div>
        </Sec>

        <Sec title="Xem trước trên điện thoại khách">
          <div className="pv" aria-hidden="true">
            <div className="pv-h">{place.name} · tối nay</div>
            {f.open ? (
              shown.map((k) => (
                <div key={k.name} className="pv-r">
                  <span className="grow">
                    <span className="t1">{k.name}</span>
                    <span className="t2">
                      {k.from ? `${money(k.from)} / đêm · ` : ''}
                      {k.left ? `còn ${k.left} phòng` : 'hết phòng'}
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <div className="pv-r">Tạm ngưng nhận đặt phòng</div>
            )}
            <div className="pv-f">
              {f.deposit_percent
                ? `Cọc ${f.deposit_percent}% qua chuyển khoản, giữ phòng ${HOLDS.find(([v]) => v === f.hold_minutes)?.[1]}.`
                : 'Không cần cọc. Thanh toán khi nhận phòng.'}
            </div>
          </div>
        </Sec>
        <div className="end" />
      </main>

      <div className="footer-bar">
        <button type="button" className="btn btn-primary btn-block" disabled={!dirty || busy} onClick={submit}>
          {busy ? 'Đang lưu…' : dirty ? 'Lưu thay đổi' : 'Đã lưu'}
        </button>
      </div>
    </Screen>
  )
}
