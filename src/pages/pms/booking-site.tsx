import './sales.scss'

import React, { useState } from 'react'

import { A, AppBar, Field, PlaceSub, Screen, Sec, Segmented, toast, useCurrent } from '@/modules/pms/components/ui'
import { addDays, can, isOpen, isRoomFree, money, today, usePms } from '@/modules/pms/pms.store'
import { Site, SITE_DEFAULT, useSales } from '@/modules/pms/sales.store'

const DEPOSITS: [string, string][] = [
  ['0', 'Không'],
  ['30', '30%'],
  ['50', '50%'],
  ['100', '100%'],
]

// Owner only: what the direct booking page offers. Guests book without OTA commission.
// ponytail: settings only; the guest-facing page and VietQR deposit come with hueni-api.
export default function BookingSitePage() {
  const bookings = usePms((s) => s.bookings)
  const { place, rooms } = useCurrent()
  const saved = useSales((s) => s.sites[place.id]) || SITE_DEFAULT
  const saveSite = useSales((s) => s.saveSite)
  const [f, setF] = useState<Site>(saved)
  const set = (p: Partial<Site>) => setF({ ...f, ...p })

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

  // One line per room kind: lowest price, rooms free tonight.
  const kinds = Array.from(new Set(rooms.filter(isOpen).map((r) => r.kind || 'Phòng'))).map((name) => {
    const list = rooms.filter((r) => isOpen(r) && (r.kind || 'Phòng') === name)
    const prices = list.map((r) => r.price).filter((p): p is number => !!p)
    return {
      name,
      count: list.length,
      from: prices.length ? Math.min(...prices) : undefined,
      left: list.filter((r) => isRoomFree(bookings, r.id, today(), addDays(today(), 1))).length,
    }
  })
  const shown = kinds.filter((k) => !f.hidden.includes(k.name))
  const dirty = JSON.stringify(f) !== JSON.stringify(saved)

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
              const on = !f.hidden.includes(k.name)
              const id = `kind-${k.name}`
              return (
                <div key={k.name} className="switch-row">
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
                    onClick={() => set({ hidden: on ? [...f.hidden, k.name] : f.hidden.filter((x) => x !== k.name) })}
                  >
                    <span />
                  </button>
                </div>
              )
            })}
          </div>
          {!shown.length && <div className="error">Bật ít nhất một loại phòng, nếu không khách không đặt được.</div>}
        </Sec>

        <Sec title="Cọc và giữ phòng">
          <div className="panel form">
            <div className="field">
              <span className="lbl">Khách cọc trước</span>
              <Segmented
                label="Mức cọc"
                value={String(f.deposit)}
                options={DEPOSITS}
                onChange={(v) => set({ deposit: Number(v) as Site['deposit'] })}
              />
            </div>
            <div className="grid2">
              <Field label="Giữ phòng chờ cọc">
                {(p) => (
                  <select {...p} value={f.hold} onChange={(e) => set({ hold: e.target.value })}>
                    {['15 phút', '30 phút', '2 giờ'].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Hạn đặt trong ngày">
                {(p) => (
                  <select {...p} value={f.cutoff} onChange={(e) => set({ cutoff: e.target.value })}>
                    {['18:00', '20:00', '22:00'].map((o) => (
                      <option key={o} value={o}>
                        đến {o}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <p className="help">Hết thời gian giữ mà chưa cọc, phòng tự mở lại và khách nhận tin báo.</p>
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
              {f.deposit
                ? `Cọc ${f.deposit}% qua chuyển khoản, giữ phòng ${f.hold}.`
                : 'Không cần cọc. Thanh toán khi nhận phòng.'}
            </div>
          </div>
        </Sec>
        <div className="end" />
      </main>

      <div className="footer-bar">
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!dirty || !shown.length}
          onClick={() => {
            saveSite(place.id, f)
            toast('Đã cập nhật trang đặt phòng')
          }}
        >
          {dirty ? 'Lưu thay đổi' : 'Đã lưu'}
        </button>
      </div>
    </Screen>
  )
}
