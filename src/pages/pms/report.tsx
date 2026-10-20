import dayjs from 'dayjs'
import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Header, Icon, Page, Select } from 'zmp-ui'

import { PageContainer } from '@/components'
import { Card, Empty, Tag } from '@/modules/pms/components/ui'
import { usePms } from '@/modules/pms/pms.store'
import { PmsTabs } from '@/modules/pms/pms-tabs'
import {
  buildReport,
  Channel,
  CHANNEL_LABEL,
  monthStart,
  previousReport,
  reportDelta,
  reportPeriod,
} from '@/modules/pms/report'
import { clsx } from '@/utils/clsx'
import { formatMoney } from '@/utils/format'

const percent = (x?: number) => (x === undefined ? undefined : `${Math.round(x * 100)}%`)
const oneDecimal = (x: number) => x.toFixed(1).replace(/\.0$/, '').replace('.', ',')

const CHANNEL_COLOR: Record<Channel, string> = {
  manual: 'bg-primary',
  airbnb: 'bg-rose-400',
  booking: 'bg-sky-600',
  other: 'bg-stone-400',
}

function Delta({ value }: { value?: ReturnType<typeof reportDelta> }) {
  if (!value) return null
  return <Tag tone={value.good === undefined ? 'gray' : value.good ? 'green' : 'red'}>{value.text}</Tag>
}

// Owner only (wiki §6i): estimated room revenue, occupancy, channels, arrivals for one month.
export default function ReportPage() {
  const [params, setParams] = useSearchParams()
  const { places, rooms, bookings, activities, currentSlug } = usePms()
  const owned = places.filter((p) => p.role === 'owner')
  const [slug, setSlug] = useState(
    params.get('place') || owned.find((p) => p.slug === currentSlug)?.slug || owned[0]?.slug,
  )
  const place = owned.find((p) => p.slug === slug)
  const month = monthStart(params.get('month') ? `${params.get('month')}-01` : dayjs().format('YYYY-MM-DD'))
  const setMonth = (m: dayjs.Dayjs) =>
    setParams({ month: m.format('YYYY-MM'), ...(slug ? { place: slug } : {}) }, { replace: true })

  if (!place) {
    return (
      <>
        <Page>
          <Header title="Báo cáo" showBackIcon={false} />
          <PageContainer withHeader withBottomNav>
            <Empty action={{ label: 'Về Hôm nay', to: '/' }}>Chỉ chủ homestay xem được báo cáo.</Empty>
          </PageContainer>
        </Page>
        <PmsTabs active="/report" />
      </>
    )
  }

  const input = { place, rooms, bookings, activities }
  const r = buildReport(input, month)
  const prev = r.future ? undefined : previousReport(input, r)
  const compared = prev && `so với ${reportPeriod(prev)}`
  const m = dayjs(r.month)

  const stats = [
    {
      label: 'Phòng có khách',
      value: percent(r.occupancy),
      sub: `${r.sold} trong ${r.available} đêm`,
      delta: prev && reportDelta(r.occupancy, prev.occupancy, 'points'),
    },
    {
      label: 'Giá trung bình mỗi đêm',
      value: r.adr !== undefined ? formatMoney(Math.round(r.adr)) : undefined,
      delta: prev && reportDelta(r.adr, prev.adr, 'percent'),
    },
    {
      label: 'Khách ở trung bình',
      value: r.alos !== undefined ? `${oneDecimal(r.alos)} đêm` : undefined,
      delta: prev && reportDelta(r.alos, prev.alos, 'nights'),
    },
    {
      label: 'Khách huỷ',
      value: percent(r.cancellationRate),
      sub: `${r.outcomes.cancelled + r.otaCancelled} trong ${r.bookingCount + r.otaCancelled} lượt`,
      delta: prev && reportDelta(r.cancellationRate, prev.cancellationRate, 'points', false),
    },
  ].filter((s) => s.value)

  const outcomes = (
    [
      ['Đã xác nhận', r.outcomes.confirmed],
      ['Giữ chỗ', r.outcomes.hold],
      ['Đã huỷ (gồm không đến)', r.outcomes.cancelled],
      ['Airbnb / Booking.com đã huỷ', r.otaCancelled],
    ] as const
  ).filter(([, n]) => n > 0)

  const ahead = r.ahead > 0 && (
    <p className="text-base m-0 pt-3 border-0 border-t border-solid border-border">
      Đã đặt trước <b>{r.ahead} đêm</b> từ {dayjs(r.last).add(1, 'day').format('D/M')} đến cuối tháng
      {r.aheadRevenue > 0 && ` · khoảng ${formatMoney(r.aheadRevenue)}`}
    </p>
  )

  return (
    <>
      <Page restoreScroll>
        <Header title="Báo cáo" showBackIcon={false} />
        <PageContainer withHeader withBottomNav>
          <div className="p-4 space-y-4 pb-8">
            {owned.length > 1 && (
              <Select
                label="Homestay"
                value={slug}
                onChange={(v) => {
                  setSlug(String(v))
                  setParams({ month: m.format('YYYY-MM'), place: String(v) }, { replace: true })
                }}
                closeOnSelect
              >
                {owned.map((p) => (
                  <Select.Option key={p.slug} value={p.slug} title={p.name} />
                ))}
              </Select>
            )}

            <Card className="p-2 flex items-center justify-between gap-1">
              <Button
                size="medium"
                variant="tertiary"
                prefixIcon={<Icon icon="zi-chevron-left" />}
                onClick={() => setMonth(m.subtract(1, 'month'))}
              >
                Tháng {m.subtract(1, 'month').month() + 1}
              </Button>
              <div className="text-center min-w-0">
                <h2 className="text-lg font-semibold m-0">Tháng {m.format('MM/YYYY')}</h2>
                {r.current ? (
                  <div className="text-sm text-text-secondary">đến hôm nay, {dayjs(r.last).format('D/M')}</div>
                ) : (
                  <button
                    className="text-base font-semibold text-primary-pressed bg-transparent border-0 p-0 min-h-[32px] underline underline-offset-4"
                    onClick={() => setMonth(dayjs())}
                  >
                    Về tháng này
                  </button>
                )}
              </div>
              <Button
                size="medium"
                variant="tertiary"
                suffixIcon={<Icon icon="zi-chevron-right" />}
                onClick={() => setMonth(m.add(1, 'month'))}
              >
                Tháng {m.add(1, 'month').month() + 1}
              </Button>
            </Card>

            {r.empty ? (
              <Card className="p-4 space-y-3">
                <p className="text-lg font-semibold m-0">
                  {r.future
                    ? `Chưa có ai đặt phòng cho tháng ${m.month() + 1}.`
                    : r.current
                      ? `Chưa có đêm nào có khách từ 1/${m.month() + 1} đến hôm nay.`
                      : `Tháng ${m.month() + 1} không có đêm nào có khách và không có lượt đặt nào.`}
                </p>
                {ahead}
              </Card>
            ) : (
              <>
                <Card className="p-4 space-y-2">
                  <h2 className="text-base font-medium text-text-secondary m-0">
                    {r.future ? `Đã đặt trước cho tháng ${m.month() + 1}` : `Tiền phòng ${reportPeriod(r)} (ước tính)`}
                  </h2>
                  <p className="text-4xl font-bold m-0">{formatMoney(r.revenue)}</p>
                  <p className="text-base m-0 flex flex-wrap items-center gap-2">
                    {r.future ? `${r.sold} đêm đã có khách đặt.` : `Từ ${r.sold} đêm có khách.`}
                    {prev && reportDelta(r.revenue, prev.revenue, 'percent') && (
                      <span className="inline-flex items-center gap-2">
                        <Delta value={reportDelta(r.revenue, prev.revenue, 'percent')} /> {compared}
                      </span>
                    )}
                  </p>
                  <p className="text-base text-text-secondary m-0">
                    Số đêm × giá phòng hiện tại, chưa trừ hoa hồng Airbnb / Booking.com.
                    {r.unpricedRooms && ' Phòng chưa có giá không được tính.'}
                  </p>
                  {!r.future && ahead}
                </Card>

                {stats.length > 0 && (
                  <Card className="p-4 space-y-3">
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-5 m-0">
                      {stats.map((s) => (
                        <div key={s.label} className="space-y-1">
                          <dt className="text-base text-text-secondary">{s.label}</dt>
                          <dd className="text-2xl font-bold m-0">{s.value}</dd>
                          {(s.sub || s.delta) && (
                            <dd className="m-0 flex flex-wrap items-center gap-1 text-sm">
                              {s.sub}
                              <Delta value={s.delta} />
                            </dd>
                          )}
                        </div>
                      ))}
                    </dl>
                    {stats.some((s) => s.delta) && (
                      <p className="text-sm text-text-secondary m-0">Tăng / giảm {compared}.</p>
                    )}
                  </Card>
                )}

                <Card className="p-4 space-y-3">
                  <h2 className="text-lg font-semibold m-0">Theo phòng</h2>
                  <ul className="list-none p-0 m-0 space-y-4">
                    {r.rooms.map((row) => (
                      <li key={row.room.id} className="space-y-1">
                        <div className="flex justify-between gap-3 text-base">
                          <span className="font-semibold">Phòng {row.room.name}</span>
                          <span className={row.revenue === undefined ? 'text-amber-900' : 'font-medium'}>
                            {row.revenue === undefined ? 'Chưa có giá' : formatMoney(row.revenue)}
                          </span>
                        </div>
                        <div
                          className="h-2 rounded-full bg-ng-10 overflow-hidden"
                          role="img"
                          aria-label={`${row.sold} trên ${r.days} đêm có khách`}
                        >
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(row.sold / r.days) * 100}%` }}
                          />
                        </div>
                        <div className="text-sm text-text-secondary">
                          {row.sold} / {r.days} đêm có khách
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between text-base font-semibold pt-3 border-0 border-t border-solid border-border">
                    <span>
                      Tổng · {r.sold} / {r.available} đêm
                    </span>
                    <span>{formatMoney(r.revenue)}</span>
                  </div>
                  {r.held > 0 && (
                    <p className="text-sm text-text-secondary m-0">
                      Thêm {r.held} đêm giữ chỗ chưa xác nhận, không tính ở trên.
                    </p>
                  )}
                </Card>

                {r.channels.some((c) => c.nights > 0) && (
                  <Card className="p-4 space-y-3">
                    <h2 className="text-lg font-semibold m-0">Khách từ đâu</h2>
                    <div className="flex h-3 rounded-full overflow-hidden gap-0.5" aria-hidden>
                      {r.channels
                        .filter((c) => c.nights > 0)
                        .map((c) => (
                          <div
                            key={c.key}
                            className={CHANNEL_COLOR[c.key]}
                            style={{ width: `${(c.nights / r.sold) * 100}%` }}
                          />
                        ))}
                    </div>
                    <ul className="list-none p-0 m-0 divide-y divide-border">
                      {r.channels.map((c) => (
                        <li key={c.key} className="flex items-center justify-between gap-3 py-2 text-base">
                          <span className="flex items-center gap-2">
                            <span className={clsx('w-3 h-3 rounded-full shrink-0', CHANNEL_COLOR[c.key])} aria-hidden />
                            {CHANNEL_LABEL[c.key]}
                          </span>
                          <span className="text-right">
                            {c.nights} đêm · {percent(r.sold ? c.nights / r.sold : 0)}
                            <span className="block text-sm text-text-secondary">{formatMoney(c.revenue)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {outcomes.length > 0 && (
                  <Card className="p-4 space-y-1">
                    <h2 className="text-lg font-semibold m-0">Lượt khách đến {reportPeriod(r)}</h2>
                    <ul className="list-none p-0 m-0 divide-y divide-border">
                      {outcomes.map(([label, n]) => (
                        <li key={label} className="flex justify-between py-2 text-base">
                          <span>{label}</span>
                          <span className="font-semibold">{n}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            )}
          </div>
        </PageContainer>
      </Page>
      <PmsTabs active="/report" />
    </>
  )
}
