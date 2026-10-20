import dayjs from 'dayjs'
import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Page } from 'zmp-ui'

import { PageContainer } from '@/components'
import { ActivityRow } from '@/modules/pms/components/activity-row'
import { BackHeader, Card, Empty } from '@/modules/pms/components/ui'
import { can, usePms } from '@/modules/pms/pms.store'

const PAGE = 50

const dayTitle = (date: dayjs.Dayjs) => {
  if (date.isSame(dayjs(), 'day')) return 'Hôm nay'
  if (date.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Hôm qua'
  return date.format('dddd DD/MM')
}

// Owner only (wiki §6h): who changed what in the homestay.
export default function ActivityPage() {
  const { slug } = useParams()
  const { places, rooms, activities } = usePms()
  const [limit, setLimit] = useState(PAGE)
  const place = places.find((p) => p.slug === slug)

  if (!place || !can(place, 'manage')) {
    return (
      <Page>
        <BackHeader title="Hoạt động" />
        <PageContainer withHeader>
          <Empty action={{ label: 'Về Hôm nay', to: '/' }}>
            {place ? 'Chỉ chủ homestay xem được hoạt động.' : 'Không tìm thấy homestay này.'}
          </Empty>
        </PageContainer>
      </Page>
    )
  }

  const all = activities.filter((a) => a.place_id === place.id).sort((a, b) => b.at.localeCompare(a.at))
  const shown = all.slice(0, limit)
  const groups = shown.reduce<Record<string, typeof shown>>((acc, a) => {
    const key = dayjs(a.at).format('YYYY-MM-DD')
    ;(acc[key] ||= []).push(a)
    return acc
  }, {})

  return (
    <Page restoreScroll>
      <BackHeader title={`Hoạt động · ${place.name}`} />
      <PageContainer withHeader>
        <div className="p-4 space-y-4 pb-10">
          {!all.length && (
            <Card>
              <Empty>Chưa có hoạt động nào. Nhận phòng, trả phòng, đặt phòng… sẽ hiện ở đây.</Empty>
            </Card>
          )}
          {Object.entries(groups).map(([date, items]) => (
            <section key={date} className="space-y-1">
              <h2 className="text-lg font-semibold m-0 px-1 first-letter:uppercase">{dayTitle(dayjs(date))}</h2>
              <Card className="px-4 divide-y divide-border">
                {items.map((a) => (
                  <ActivityRow key={a.id} activity={a} roomName={rooms.find((r) => r.id === a.room_id)?.name} />
                ))}
              </Card>
            </section>
          ))}
          {all.length > limit && (
            <Button fullWidth size="medium" variant="secondary" onClick={() => setLimit(limit + PAGE)}>
              Xem cũ hơn
            </Button>
          )}
        </div>
      </PageContainer>
    </Page>
  )
}
