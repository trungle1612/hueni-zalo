import './setup.scss'

import dayjs from 'dayjs'
import React, { useState } from 'react'

import { API_URL } from '@/constants/common'
import {
  A,
  AppBar,
  Field,
  KV,
  MoneyInput,
  Screen,
  Sec,
  Segmented,
  Sheet,
  toast,
  useCurrent,
} from '@/modules/pms/components/ui'
import { SERVICES } from '@/modules/pms/guests.store'
import { can, fmtDay, money, Room, today, upcomingOn, usePms } from '@/modules/pms/pms.store'
import { saveRoom, usePlaceList, useRules, useServices } from '@/modules/pms/remote'
import { audit, POLICY, Policy, Season, seasonOn, Surcharge, useSetup } from '@/modules/pms/setup.store'

type Type = { name: string; rooms: Room[]; guests: number; base: number; wknd?: number; mixed: boolean }
const dmy = (iso: string) => dayjs(iso).format('DD/MM/YYYY')
const isWeekend = (date: string) => [5, 6].includes(dayjs(date).day())

// Room types = the place's rooms grouped by kind. A type's price is written to every room of that kind.
function useTypes(): Type[] {
  const { rooms } = useCurrent()
  const by = new Map<string, Room[]>()
  rooms.forEach((r) => by.set(r.kind || 'Chưa phân loại', [...(by.get(r.kind || 'Chưa phân loại') || []), r]))
  return Array.from(by.entries()).map(([name, list]) => {
    const priced = list.filter((r) => r.price)
    const base = Math.min(...priced.map((r) => r.price!), Infinity)
    return {
      name,
      rooms: list,
      guests: Math.max(...list.map((r) => r.max_guests)),
      base: base === Infinity ? 0 : base,
      wknd: list.find((r) => r.price === base)?.weekend_price,
      mixed: new Set(list.map((r) => `${r.price}/${r.weekend_price}`)).size > 1,
    }
  })
}

export default function RatesPage() {
  const { place } = useCurrent()
  const [tab, setTab] = useState<'types' | 'season' | 'rules'>('types')

  if (!can(place, 'manage')) return <Denied />

  return (
    <Screen>
      <AppBar lead="back" title="Loại phòng và giá" sub="Áp dụng cho đặt phòng mới. Đặt phòng cũ giữ giá đã chốt." />
      <div className="seg" role="group" aria-label="Mục">
        {(
          [
            ['types', 'Loại phòng'],
            ['season', 'Mùa và ngày lễ'],
            ['rules', 'Phụ thu và chính sách'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <main className="scroll">
        {tab === 'types' && <Types />}
        {tab === 'season' && <Seasons />}
        {tab === 'rules' && <Rules />}
        <div className="end" />
      </main>
    </Screen>
  )
}

function Types() {
  const types = useTypes()
  const { bookings, actions } = usePms()
  const { place } = useCurrent()
  const seasons = usePlaceList(place.id, 'seasons').list
  const { longStay } = useRules(place.id)
  const [edit, setEdit] = useState<Type>()
  const [base, setBase] = useState<number>()
  const [wknd, setWknd] = useState<number>()
  const [tried, setTried] = useState(false)
  const [pvType, setPvType] = useState(0)
  const [pvDate, setPvDate] = useState(today())

  const upcoming = edit ? edit.rooms.reduce((n, r) => n + upcomingOn(bookings, r.id).length, 0) : 0

  async function save() {
    if (!edit) return
    if (!base) return setTried(true)
    const weekend = wknd && wknd !== base ? wknd : undefined
    const snap = actions.snapshot()
    const prevAudit = useSetup.getState().audit
    // ponytail: one PATCH per room of the type; a failure part-way leaves the earlier rooms saved (API mode).
    for (const r of edit.rooms) {
      const res = await saveRoom(
        {
          place_id: r.place_id,
          name: r.name,
          floor: r.floor,
          kind: r.kind,
          max_guests: r.max_guests,
          price: base,
          weekend_price: weekend,
          amenities: r.amenities,
          active: r.active,
          note: r.note,
        },
        r.id,
      )
      if (typeof res === 'string') {
        actions.restore(snap)
        return toast(res)
      }
    }
    audit({
      k: 'price',
      action: `Sửa giá ${edit.name.toLowerCase()}`,
      before: `${money(edit.base)}${edit.wknd ? ` · cuối tuần ${money(edit.wknd)}` : ''}`,
      after: `${money(base)}${weekend ? ` · cuối tuần ${money(weekend)}` : ''}`,
      note: `${edit.rooms.length} phòng · đặt phòng sắp tới giữ giá cũ`,
      who: usePms.getState().user.name,
    })
    setEdit(undefined)
    toast(
      `Đã lưu giá ${edit.name.toLowerCase()}`,
      API_URL
        ? undefined
        : () => {
            actions.restore(snap)
            useSetup.setState({ audit: prevAudit })
          },
    )
  }

  const t = types[pvType] || types[0]
  const nightly = t ? (isWeekend(pvDate) && t.wknd ? t.wknd : t.base) : 0
  const season = seasonOn(seasons, pvDate)
  const pv = Math.round((nightly * (1 + (season?.pct || 0) / 100)) / 1000) * 1000

  return (
    <>
      <Sec title="Loại phòng" aside={<span className="aside">Ngày thường · cuối tuần (T6, T7)</span>}>
        <div className="panel">
          {types.map((x) => (
            <button
              key={x.name}
              type="button"
              className="row"
              aria-label={`Sửa giá ${x.name}`}
              onClick={() => {
                setEdit(x)
                setBase(x.base || undefined)
                setWknd(x.wknd)
                setTried(false)
              }}
            >
              <span className="grow">
                <span className="t1">{x.name}</span>
                <span className="t2">
                  {x.rooms.length} phòng · tối đa {x.guests} khách{x.mixed && ' · giá từng phòng khác nhau'}
                </span>
              </span>
              <span className="price">
                <b>{x.base ? `${x.mixed ? 'từ ' : ''}${money(x.base)}` : 'Chưa có giá'}</b>
                <span>{x.wknd ? `Cuối tuần ${money(x.wknd)}` : 'Cuối tuần như thường'}</span>
              </span>
            </button>
          ))}
          {!types.length && (
            <div className="empty-row">
              Chưa có phòng. <A to="/rooms/new">Thêm phòng</A>
            </div>
          )}
        </div>
      </Sec>

      {t && (
        <Sec title="Xem thử giá">
          <div className="panel form">
            <div className="grid2">
              <Field label="Loại">
                {(p) => (
                  <select {...p} value={pvType} onChange={(e) => setPvType(Number(e.target.value))}>
                    {types.map((x, i) => (
                      <option key={x.name} value={i}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Ngày">
                {(p) => (
                  <input {...p} type="date" value={pvDate} onChange={(e) => setPvDate(e.target.value || today())} />
                )}
              </Field>
            </div>
            <div className="preview" role="status">
              <b>{money(pv)} / đêm</b>
              <span className="help">
                {fmtDay(pvDate)} · {isWeekend(pvDate) && t.wknd ? 'giá cuối tuần' : 'giá ngày thường'} {money(nightly)}
                {season && ` + ${season.pct}% ${season.name.toLowerCase()}`}
                {longStay && '. Ở từ 7 đêm giảm thêm 10%.'}
              </span>
            </div>
          </div>
        </Sec>
      )}

      {edit && (
        <Sheet title={`Giá ${edit.name.toLowerCase()}`} onClose={() => setEdit(undefined)}>
          <div className="grid2">
            <Field label="Ngày thường (đ)" error={tried && !base && 'Giá ngày thường phải lớn hơn 0.'}>
              {(p) => <MoneyInput {...p} value={base} onChange={setBase} />}
            </Field>
            <Field label="Cuối tuần (đ)" optional>
              {(p) => <MoneyInput {...p} placeholder="Như thường" value={wknd} onChange={setWknd} />}
            </Field>
          </div>
          {!!base && !!wknd && wknd < base && (
            <div className="notice" role="status">
              Giá cuối tuần đang thấp hơn ngày thường. Kiểm tra lại nếu không cố ý.
            </div>
          )}
          <p className="help">
            Áp cho {edit.rooms.length} phòng ({edit.rooms.map((r) => r.name).join(', ')}).
            {upcoming > 0 && ` ${upcoming} đặt phòng sắp tới giữ giá cũ.`}
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={save}>
            Lưu giá
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setEdit(undefined)}>
            Đóng
          </button>
        </Sheet>
      )}
    </>
  )
}

// Save from a sheet: the server's sentence on failure, else close and confirm.
function useSaving(close: () => void) {
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<string | void>, done: string) => {
    setBusy(true)
    const error = await action()
    setBusy(false)
    if (error) return toast(error)
    close()
    toast(done)
  }
  return [busy, run] as const
}

function Seasons() {
  const { place } = useCurrent()
  const { list: seasons, save, remove } = usePlaceList(place.id, 'seasons')
  const [edit, setEdit] = useState<Partial<Season> | null>(null)
  const [busy, run] = useSaving(() => setEdit(null))
  const f = edit || {}
  const dateBad = !!f.from && !!f.to && f.to < f.from
  const overlap = f.from && f.to && seasons.find((x) => x.id !== f.id && !(f.to! < x.from || f.from! > x.to))
  const ready = !!f.name?.trim() && !!f.from && !!f.to && !dateBad && !!f.pct

  const name = f.name?.trim() || ''

  return (
    <Sec
      title="Mùa cao điểm và ngày lễ"
      aside={
        <button type="button" className="link" onClick={() => setEdit({})}>
          + Thêm
        </button>
      }
    >
      <div className="panel">
        {seasons.map((x) => (
          <button key={x.id} type="button" className="row" onClick={() => setEdit(x)}>
            <span className="grow">
              <span className="t1">{x.name}</span>
              <span className="t2">
                {dmy(x.from)} – {dmy(x.to)}
              </span>
            </span>
            <span className="badge tone-warning">+{x.pct}%</span>
          </button>
        ))}
        {!seasons.length && (
          <div className="empty-row">Chưa có mùa nào. Mọi ngày dùng giá ngày thường và cuối tuần.</div>
        )}
      </div>
      <p className="help" style={{ marginTop: 8 }}>
        Hai mùa trùng ngày thì lấy mức cao hơn. Thêm, sửa, xoá mùa không đổi giá đặt phòng đã có.
      </p>

      {edit && (
        <Sheet title={f.id ? f.name : 'Thêm mùa hoặc ngày lễ'} onClose={() => setEdit(null)}>
          <Field label="Tên">
            {(p) => (
              <input
                {...p}
                type="text"
                maxLength={50}
                placeholder="Ví dụ: Tết Nguyên đán"
                value={f.name || ''}
                onChange={(e) => setEdit({ ...f, name: e.target.value })}
              />
            )}
          </Field>
          <div className="grid2">
            <Field label="Từ đêm">
              {(p) => (
                <input
                  {...p}
                  type="date"
                  value={f.from || ''}
                  onChange={(e) => setEdit({ ...f, from: e.target.value })}
                />
              )}
            </Field>
            <Field label="Đến đêm" error={dateBad && 'Đến ngày phải từ ngày bắt đầu trở đi.'}>
              {(p) => (
                <input {...p} type="date" value={f.to || ''} onChange={(e) => setEdit({ ...f, to: e.target.value })} />
              )}
            </Field>
          </div>
          <Field label="Tăng giá (%)">
            {(p) => (
              <input
                {...p}
                type="text"
                inputMode="numeric"
                value={f.pct ?? ''}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 3)
                  setEdit({ ...f, pct: d ? Number(d) : undefined })
                }}
              />
            )}
          </Field>
          {overlap && (
            <div className="notice" role="status">
              Trùng ngày với “{overlap.name}”. Những ngày trùng lấy mức cao hơn.
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!ready || busy}
            onClick={() =>
              run(
                () => save({ id: f.id, name, from: f.from!, to: f.to!, pct: f.pct! }),
                f.id ? `Đã lưu ${name}` : `Đã thêm ${name}`,
              )
            }
          >
            Lưu
          </button>
          {f.id && (
            <button
              type="button"
              className="btn btn-danger btn-block"
              disabled={busy}
              onClick={() => run(() => remove(f.id!), `Đã xoá ${f.name}`)}
            >
              Xoá mùa này
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setEdit(null)}>
            Đóng
          </button>
        </Sheet>
      )}
    </Sec>
  )
}

const perUnit = (x: { price: number; unit?: string }) =>
  x.price ? `${money(x.price)}${x.unit ? ` / ${x.unit}` : ''}` : 'Miễn phí'

function Rules() {
  const { place } = useCurrent()
  const rules = useRules(place.id)
  const { list: surcharges, save, remove } = usePlaceList(place.id, 'surcharges')
  const services = useServices(place.id, SERVICES)
  const [edit, setEdit] = useState<Partial<Surcharge> | null>(null)
  const [busy, run] = useSaving(() => setEdit(null))
  const f = edit || {}
  const name = f.name?.trim() || ''

  async function setRule(p: { long_stay?: boolean; cancel_policy?: Policy }) {
    const error = await rules.save(p)
    if (error) toast(error)
  }

  return (
    <>
      <Sec
        title="Phụ thu theo khách"
        aside={
          <button type="button" className="link" onClick={() => setEdit({ unit: 'đêm' })}>
            + Thêm
          </button>
        }
      >
        <div className="panel">
          {surcharges.map((x) => (
            <button key={x.id} type="button" className="row" onClick={() => setEdit(x)}>
              <span className="grow">
                <span className="t1">{x.name}</span>
              </span>
              <span className="t2">{perUnit(x)}</span>
            </button>
          ))}
          {!surcharges.length && <div className="empty-row">Chưa có phụ thu.</div>}
        </div>
        <p className="help" style={{ marginTop: 8 }}>
          Chỉ để báo cho khách, không tự cộng vào tiền phòng. Thu thì thêm dịch vụ vào đặt phòng.
        </p>
      </Sec>
      <Sec title="Ở dài ngày">
        <div className="panel form">
          <div className="switch-row">
            <div>
              <div style={{ fontWeight: 600 }} id="long-stay">
                Ở từ 7 đêm giảm 10% tiền phòng
              </div>
              <p className="help">Áp tự động cho đặt phòng tạo sau khi bật</p>
            </div>
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={!!rules.longStay}
              aria-labelledby="long-stay"
              disabled={rules.longStay === undefined}
              onClick={() => setRule({ long_stay: !rules.longStay })}
            >
              <span />
            </button>
          </div>
        </div>
      </Sec>
      <Sec title="Chính sách huỷ">
        {rules.policy && (
          <>
            <Segmented
              label="Chính sách huỷ"
              value={rules.policy}
              options={(Object.keys(POLICY) as Policy[]).map((k) => [k, POLICY[k][0]])}
              onChange={(v) => setRule({ cancel_policy: v })}
            />
            <p className="help" style={{ marginTop: 8 }}>
              {rules.text || POLICY[rules.policy][1]} Hiện cho khách xem, không đổi số tiền hoàn khi huỷ.
            </p>
          </>
        )}
      </Sec>
      <Sec title="Dịch vụ tính thêm">
        <dl className="panel">
          {services.map((x) => (
            <KV key={x.id} label={x.name}>
              {perUnit(x)}
            </KV>
          ))}
        </dl>
      </Sec>

      {edit && (
        <Sheet title={f.id ? f.name : 'Thêm phụ thu'} onClose={() => setEdit(null)}>
          <Field label="Tên">
            {(p) => (
              <input
                {...p}
                type="text"
                maxLength={50}
                placeholder="Ví dụ: Người lớn thêm"
                value={f.name || ''}
                onChange={(e) => setEdit({ ...f, name: e.target.value })}
              />
            )}
          </Field>
          <div className="grid2">
            <Field label="Giá (đ)" optional>
              {(p) => (
                <MoneyInput
                  {...p}
                  placeholder="0 = Miễn phí"
                  value={f.price}
                  onChange={(v) => setEdit({ ...f, price: v })}
                />
              )}
            </Field>
            <Field label="Tính theo" optional>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  maxLength={20}
                  placeholder="đêm"
                  value={f.unit || ''}
                  onChange={(e) => setEdit({ ...f, unit: e.target.value })}
                />
              )}
            </Field>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!name || busy}
            onClick={() =>
              run(
                () => save({ id: f.id, name, price: f.price || 0, unit: f.unit?.trim() || undefined }),
                f.id ? `Đã lưu ${name}` : `Đã thêm ${name}`,
              )
            }
          >
            Lưu
          </button>
          {f.id && (
            <button
              type="button"
              className="btn btn-danger btn-block"
              disabled={busy}
              onClick={() => run(() => remove(f.id!), `Đã xoá ${f.name}`)}
            >
              Xoá phụ thu này
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setEdit(null)}>
            Đóng
          </button>
        </Sheet>
      )}
    </>
  )
}

export function Denied() {
  return (
    <Screen>
      <AppBar lead="back" title="Thiết lập" />
      <main className="scroll">
        <div className="sec">
          <div className="panel msg">
            <h2>Chỉ chủ cơ sở mở được trang này</h2>
            <p>Tài khoản Lễ tân không sửa giá, nhân viên hay nhật ký. Nhờ chủ cơ sở nếu cần thay đổi.</p>
            <div style={{ marginTop: 4 }}>
              <A className="btn" to="/more" replace>
                Về Thêm
              </A>
            </div>
          </div>
        </div>
      </main>
    </Screen>
  )
}
