import './sales.scss'

import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'

import { API_URL } from '@/constants/common'
import { api, ApiError } from '@/modules/pms/api'
import { A, AppBar, PlaceSub, Screen, Sec, Sheet, toast, useCurrent } from '@/modules/pms/components/ui'
import {
  addDays,
  Booking,
  bookingCode,
  can,
  daysBetween,
  dueOf,
  fmtDate,
  guestLabel,
  isStaying,
  money,
  occupiedUntil,
  occupies,
  today,
  usePms,
  weekday,
} from '@/modules/pms/pms.store'
import { buildReport, Channel, CHANNEL_LABEL, monthStart, Report } from '@/modules/pms/report'
import { groupCode, useSales } from '@/modules/pms/sales.store'

const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD')
const million = (n: number) =>
  (n / 1e6)
    .toFixed(n >= 1e7 ? 1 : 2)
    .replace(/\.?0+$/, '')
    .replace('.', ',')
const percent = (x?: number) => (x === undefined ? '—' : `${Math.round(x * 100)}%`)

function periods() {
  const t = today()
  const prev = dayjs(t).subtract(1, 'month')
  return [
    { tab: '7 ngày', start: addDays(t, -6), end: t, byDay: true },
    { tab: 'Tháng này', start: monthStart(t), end: fmt(dayjs(t).endOf('month')), byDay: false },
    {
      tab: `Tháng ${prev.month() + 1}`,
      start: fmt(prev.startOf('month')),
      end: fmt(prev.endOf('month')),
      byDay: false,
    },
  ]
}

// GET /places/:id/report (wiki Mini-App-API, Báo cáo): the server's Report, owners only.
type ApiReport = {
  first: string
  last: string
  days: number
  current: boolean
  future: boolean
  empty: boolean
  revenue: number
  sold: number
  available: number
  occupancy: number | null
  adr: number | null
  unpriced: boolean
  ahead: number
  ahead_revenue: number
  alos: number | null
  booking_count: number
  outcomes: { confirmed: number; cancelled: number }
  ota_cancelled: number
  cancellation_rate: number | null
  due: number
  channels: {
    key: Channel
    nights: number
    bookings: number
    revenue: number
    commission: number | null
    net: number
  }[]
  rooms: { room_id: number; name: string; sold: number; revenue: number | null }[]
  debts: (Booking & { due: number; overdue: boolean })[]
}
const query = (p: { start: string; byDay: boolean }) => (p.byDay ? 'period=7d' : `month=${p.start.slice(0, 7)}`)

// The server's report in the shape the page draws. It has no revenue per day, so no chart.
// ponytail: ask hueni-api for nightly revenue if owners miss the chart.
const fromApi = (x: ApiReport): Report => ({
  month: x.first,
  last: x.last,
  nightly: {},
  current: x.current,
  future: x.future,
  partial: x.current,
  days: x.days,
  rooms: x.rooms.map((r) => ({
    room: { id: r.room_id, name: r.name } as Report['rooms'][number]['room'],
    sold: r.sold,
    held: 0,
    revenue: r.revenue ?? undefined,
  })),
  sold: x.sold,
  held: 0,
  available: x.available,
  occupancy: x.occupancy ?? undefined,
  revenue: x.revenue,
  adr: x.adr ?? undefined,
  unpricedRooms: x.unpriced,
  ahead: x.ahead,
  aheadRevenue: x.ahead_revenue,
  channels: x.channels,
  bookingCount: x.booking_count,
  outcomes: { ...x.outcomes, hold: 0 },
  alos: x.alos ?? undefined,
  otaCancelled: x.ota_cancelled,
  cancellationRate: x.cancellation_rate ?? undefined,
  empty: x.empty,
})

// "15 – 21/10/2026"
const rangeLabel = (a: string, b: string) => {
  const [da, db] = [dayjs(a), dayjs(b)]
  return `${da.date()}${da.month() === db.month() ? '' : `/${da.month() + 1}`} – ${db.format('D/M/YYYY')}`
}

// Owner only: room revenue estimate, occupancy, sources and the best rooms for a period.
export default function ReportPage() {
  const { bookings, activities } = usePms()
  const { place, rooms } = useCurrent()
  const { commission, groups } = useSales()
  const [period, setPeriod] = useState(0)
  const [sel, setSel] = useState<number>()
  const [exporting, setExporting] = useState(false)
  const [server, setServer] = useState<ApiReport | string>() // the report, or why it didn't load
  const owner = can(place, 'manage')
  const p = periods()[period]
  const q = query(p)

  useEffect(() => {
    if (!API_URL || !owner) return
    setServer(undefined)
    api<ApiReport>(`/places/${place.id}/report?${q}`)
      .then(setServer)
      .catch((e) => setServer(e instanceof ApiError ? e.message : 'Không tải được báo cáo.'))
  }, [place.id, q, owner])

  if (!owner) {
    return (
      <Screen tab="/report">
        <AppBar title="Báo cáo" sub={<PlaceSub />} />
        <main className="scroll">
          <div className="sec">
            <div className="panel msg">
              <h2>Bạn chưa có quyền xem báo cáo</h2>
              <p>
                Tài khoản <b style={{ color: 'var(--text)' }}>Lễ tân</b> xem và xử lý được đặt phòng, phòng và thanh
                toán, nhưng không xem doanh thu.
              </p>
              <p>Chủ cơ sở có thể cấp quyền trên trang quản trị hueni, mục Nhân viên.</p>
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

  if (API_URL && typeof server !== 'object')
    return (
      <Screen tab="/report">
        <AppBar title="Báo cáo" sub={<PlaceSub />} />
        <main className="scroll">
          <div className="empty">{server || 'Đang tải…'}</div>
        </main>
      </Screen>
    )

  const rep = typeof server === 'object' ? server : undefined
  const r = rep ? fromApi(rep) : buildReport({ place, rooms, bookings, activities }, p.start, p.end)
  const range = rangeLabel(r.month, r.last)
  const ids = new Set(rooms.map((x) => x.id))
  const due = rep
    ? rep.due
    : bookings
        .filter((b) => ids.has(b.room_id) && occupies(b, r.month, addDays(r.last, 1)))
        .reduce(
          (n, b) =>
            n +
            dueOf(
              b,
              rooms.find((x) => x.id === b.room_id),
            ),
          0,
        )

  // Bars: one per day for 7 days, else weeks starting on the 1st, 8th, 15th, 22nd (the last runs to the end).
  const bars: { label: string; value: number }[] = []
  if (p.byDay) {
    for (let d = r.month; d <= r.last; d = addDays(d, 1)) bars.push({ label: weekday(d), value: r.nightly[d] || 0 })
  } else {
    ;[1, 8, 15, 22].forEach((from, i, all) => {
      const a = fmt(dayjs(r.month).date(from))
      if (a > r.last) return
      const b = i === all.length - 1 ? r.last : [fmt(dayjs(r.month).date(from + 6)), r.last].sort()[0]
      let value = 0
      for (let d = a; d <= b; d = addDays(d, 1)) value += r.nightly[d] || 0
      bars.push({ label: `${from}–${dayjs(b).date()}`, value })
    })
  }
  const max = Math.max(...bars.map((b) => b.value))
  const maxM = max / 1e6
  const step = maxM <= 5 ? 1 : maxM <= 20 ? 5 : 10
  const scale = Math.max(step, Math.ceil(maxM / step) * step)
  const maxIdx = bars.findIndex((b) => b.value === max)
  const flat = bars.every((b) => b.value === bars[0].value)
  const on = sel ?? (flat ? -1 : maxIdx)
  const chartTitle = !max
    ? 'Chưa có doanh thu trong kỳ này'
    : flat
      ? 'Doanh thu đều trong kỳ'
      : `${bars[maxIdx].label} cao nhất ${p.byDay ? 'tuần' : 'tháng'}`

  const channels = rep
    ? rep.channels
        .filter((c) => c.revenue)
        .sort((a, b) => b.revenue - a.revenue)
        .map((c) => ({ ...c, pct: c.commission || 0 }))
    : r.channels
        .filter((c) => c.revenue)
        .sort((a, b) => b.revenue - a.revenue)
        .map((c) => ({ ...c, pct: commission[c.key], net: Math.round((c.revenue * (100 - commission[c.key])) / 100) }))

  // Công nợ chưa thu: every open balance of the place, not only this period. A group billed as one is one line.
  const receivables = receivablesOf(
    rep ? rep.debts : bookings.filter((b) => ids.has(b.room_id)),
    (b) =>
      rep?.debts.find((d) => d.id === b.id)?.due ??
      dueOf(
        b,
        rooms.find((x) => x.id === b.room_id),
      ),
  ).map((x) => {
    const g = x.b.group_id
      ? groups.find((y) => y.id === x.b.group_id && y.bill === 'one' && !y.own.includes(x.b.id))
      : undefined
    return { ...x, g }
  })
  const lines = Object.values(
    receivables.reduce<Record<string, (typeof receivables)[number][]>>((acc, x) => {
      const k = x.g ? `g${x.g.id}` : `b${x.b.id}`
      ;(acc[k] = acc[k] || []).push(x)
      return acc
    }, {}),
  ).map((items) => ({ ...items[0], due: items.reduce((n, x) => n + x.due, 0), count: items.length }))
  const owed = lines.reduce((n, x) => n + x.due, 0)
  const top = r.rooms
    .filter((x) => x.sold)
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0) || b.sold - a.sold)
    .slice(0, 5)

  async function download() {
    if (API_URL) return downloadFromServer()
    const lines = [
      ['Báo cáo', place.name, range],
      ['Doanh thu (đ)', r.revenue],
      ['Phòng có khách', `${percent(r.occupancy)} (${r.sold}/${r.available} đêm)`],
      ['Giá trung bình 1 đêm (đ)', r.adr ? Math.round(r.adr) : ''],
      ['Còn phải thu (đ)', due],
      [],
      ['Ngày', 'Doanh thu (đ)'],
      ...Object.keys(r.nightly)
        .sort()
        .map((d) => [d, r.nightly[d]]),
      [],
      ['Nguồn', 'Số đêm', 'Doanh thu (đ)', 'Hoa hồng (%)', 'Thực nhận (đ)'],
      ...r.channels.map((c) => [
        CHANNEL_LABEL[c.key],
        c.nights,
        c.revenue,
        commission[c.key],
        Math.round((c.revenue * (100 - commission[c.key])) / 100),
      ]),
      [],
      ['Phòng', 'Số đêm', 'Doanh thu (đ)'],
      ...r.rooms.map((x) => [x.room.name, x.sold, x.revenue ?? '']),
    ]
    const csv = '﻿' + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const name = `bao-cao-${r.month}-${r.last}.csv`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
    setExporting(false)
    toast(`Đã tạo ${name}, xem trong mục Tải về`)
  }

  // GET …/report.csv needs the bearer, so fetch it, then save the blob. Same name as the web's.
  async function downloadFromServer() {
    const res = await fetch(`${API_URL}/api/v1/places/${place.id}/report.csv?${query(p)}`, {
      headers: { Authorization: `Bearer ${usePms.getState().token}` },
    }).catch(() => undefined)
    setExporting(false)
    if (!res?.ok) return toast('Không tải được file CSV. Thử lại sau ít phút.')
    const name = `bao-cao-${place.slug}-${r.month}-${r.last}.csv`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await res.blob())
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
    toast(`Đã tạo ${name}, xem trong mục Tải về`)
  }

  return (
    <Screen tab="/report">
      <AppBar title="Báo cáo" sub={<PlaceSub prefix={range} />}>
        <button type="button" className="btn btn-sm" onClick={() => setExporting(true)}>
          Xuất CSV
        </button>
      </AppBar>
      <div className="seg" role="group" aria-label="Kỳ báo cáo">
        {periods().map((x, i) => (
          <button
            key={x.tab}
            type="button"
            aria-pressed={i === period}
            onClick={() => (setPeriod(i), setSel(undefined))}
          >
            {x.tab}
          </button>
        ))}
      </div>

      <main className="scroll">
        <div className="sec">
          <div className="panel kpis">
            <div className="kpi">
              <span>Doanh thu</span>
              <b>{money(r.revenue)}</b>
            </div>
            <div className="kpi">
              <span>Phòng có khách</span>
              <b>{percent(r.occupancy)}</b>
              <small>
                {r.sold}/{r.available} đêm
              </small>
            </div>
            <div className="kpi">
              <span>Giá trung bình 1 đêm</span>
              <b>{r.adr ? money(Math.round(r.adr / 1000) * 1000) : '—'}</b>
            </div>
            <div className="kpi">
              <span>Còn phải thu</span>
              <b style={due ? { color: 'var(--warn)' } : undefined}>{money(due)}</b>
            </div>
          </div>
        </div>

        {!rep && (
          <Sec title={chartTitle} aside={<span className="aside">triệu đồng</span>}>
            <div className="panel chart">
              <div
                className="plot"
                role="group"
                aria-label={`${chartTitle}. ${bars.map((b) => `${b.label}: ${million(b.value)} triệu`).join('; ')}`}
              >
                <div className="gl" style={{ top: 16 }}>
                  <span>{scale}</span>
                </div>
                <div className="gl" style={{ top: 72 }}>
                  <span>{String(scale / 2).replace('.', ',')}</span>
                </div>
                <div className="gl" style={{ top: '100%', borderTop: 0 }}>
                  <span>0</span>
                </div>
                <div className="bars">
                  {bars.map((b, i) => (
                    <button
                      key={b.label}
                      type="button"
                      className="bcol"
                      aria-label={`${b.label}: ${million(b.value)} triệu`}
                      aria-pressed={i === on}
                      onClick={() => setSel(i)}
                    >
                      <span className="v">{million(b.value)}</span>
                      <span className="b" style={{ height: Math.round((b.value / 1e6 / scale) * 112) }} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="xl" aria-hidden="true">
                {bars.map((b, i) => (
                  <span key={b.label} className={i === on ? 'on' : undefined}>
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          </Sec>
        )}

        <Sec title="Theo nguồn đặt">
          <div className="panel">
            {channels.length ? (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Nguồn</th>
                    <th scope="col" className="n">
                      Doanh thu
                    </th>
                    <th scope="col" className="n">
                      Thực nhận
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((c) => (
                    <tr key={c.key}>
                      <td>
                        {CHANNEL_LABEL[c.key]}
                        <small className="sub">
                          {c.nights} đêm · {c.pct ? `hoa hồng ${c.pct}%` : 'không hoa hồng'}
                        </small>
                      </td>
                      <td className="n">{money(c.revenue)}</td>
                      <td className="n" style={{ fontWeight: 600 }}>
                        {money(c.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-row">Chưa có đêm nào bán được trong kỳ này.</div>
            )}
          </div>
        </Sec>

        {lines.length > 0 && (
          <Sec title="Công nợ chưa thu" aside={<span className="aside">{money(owed)}</span>}>
            <div className="panel">
              {lines.map((x) => (
                <A
                  key={x.g ? `g${x.g.id}` : x.b.id}
                  className="row"
                  to={x.g ? `/groups/${x.g.id}` : `/bookings/${x.b.id}`}
                >
                  <span className="grow">
                    <span className="t1">
                      {x.g ? `${x.g.name} · ${groupCode(x.g)}` : `${guestLabel(x.b)} · ${bookingCode(x.b)}`}
                    </span>
                    <span className="t2" style={x.late ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                      {x.g ? `${x.count} phòng · ` : ''}
                      {x.when}
                    </span>
                  </span>
                  <b style={x.late ? { color: 'var(--danger)' } : undefined}>{money(x.due)}</b>
                </A>
              ))}
            </div>
          </Sec>
        )}

        {top.length > 0 && (
          <Sec title={`${top.length} phòng doanh thu cao nhất`}>
            <div className="panel">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Phòng</th>
                    <th scope="col" className="n">
                      Số đêm
                    </th>
                    <th scope="col" className="n">
                      Doanh thu
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((x) => (
                    <tr key={x.room.id}>
                      <td style={{ fontWeight: 600 }}>{x.room.name}</td>
                      <td className="n">{x.sold}</td>
                      <td className="n">{x.revenue ? money(x.revenue) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Sec>
        )}

        <p className="foot">
          Chạm vào cột để xem số liệu. Doanh thu ước tính theo đêm khách đã ở × giá mỗi đêm, gồm cả khoản còn phải thu.
          Thực nhận = doanh thu trừ hoa hồng kênh (cài ở Kênh bán phòng). Công suất = số đêm có khách ÷ (
          {r.rooms.length} phòng × {r.days} ngày).
          {r.unpricedRooms && ' Phòng chưa có giá không tính vào doanh thu.'}
        </p>
      </main>

      {exporting && (
        <Sheet title={`Xuất báo cáo ${range}`} onClose={() => setExporting(false)}>
          <p className="help">
            CSV, mở được bằng Excel. Gồm chỉ số, doanh thu theo ngày, theo nguồn và theo từng phòng.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={download}>
            Tải file CSV
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setExporting(false)}>
            Đóng
          </button>
        </Sheet>
      )}
    </Screen>
  )
}

// Open balances, overdue first: once the guest has left (or should have), the money is late.
function receivablesOf(all: Booking[], dueFor: (b: Booking) => number) {
  const t = today()
  return all
    .filter((b) => b.status !== 'cancelled')
    .map((b) => {
      const out = b.checked_out_at ? occupiedUntil(b) : b.end_date
      const left = !!b.checked_out_at || (!isStaying(b) && b.end_date < t)
      const late = left && daysBetween(out, t) > 0
      const on = (d: string) => (d === t ? 'hôm nay' : fmtDate(d))
      const when = late
        ? `Quá hạn ${daysBetween(out, t)} ngày · trả ${fmtDate(out)}`
        : left
          ? 'Chưa thu · đã trả phòng hôm nay'
          : isStaying(b)
            ? `Thu khi trả phòng ${on(b.end_date)}`
            : `Thu khi nhận phòng ${on(b.start_date)}`
      return { b, due: dueFor(b), late, when }
    })
    .filter((x) => x.due > 0)
    .sort((a, b) => Number(b.late) - Number(a.late) || a.b.start_date.localeCompare(b.b.start_date))
}
