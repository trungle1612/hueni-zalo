import dayjs from 'dayjs'
import React from 'react'
import { Button, Header, Icon, Page } from 'zmp-ui'

import { PageContainer } from '@/components'
import { useNotify } from '@/modules/pms/components/stay-buttons'
import { Card, Empty, Tag, WarnIcon } from '@/modules/pms/components/ui'
import { Feed, FEED_ERROR, placeRooms, PROVIDER_NAME, usePms } from '@/modules/pms/pms.store'
import { PmsTabs } from '@/modules/pms/pms-tabs'

const ago = (iso: string) => dayjs(iso).fromNow()

// Read-only sync status + Đồng bộ ngay (wiki §6d). Adding / removing feeds stays in the web admin.
export default function FeedsPage() {
  const { places, rooms, feeds } = usePms()

  return (
    <>
      <Page restoreScroll>
        <Header title="Kênh OTA" showBackIcon={false} />
        <PageContainer withHeader withBottomNav>
          <div className="p-4 space-y-6">
            <p className="text-base text-text-secondary px-1 m-0">
              hueni tự lấy lịch Airbnb / Booking.com mỗi giờ để phòng trống luôn đúng. Thêm hoặc xoá kênh trên trang
              quản trị hueni.
            </p>
            {places.map((place) => {
              const list = placeRooms(rooms, place.id)
                .map((room) => ({ room, feeds: feeds.filter((f) => f.room_id === room.id) }))
                .sort((a, b) => Number(b.feeds.some((f) => f.last_error)) - Number(a.feeds.some((f) => f.last_error)))
              return (
                <section key={place.id} className="space-y-3">
                  <h2 className="text-xl font-semibold m-0 px-1">{place.name}</h2>
                  {!list.length && (
                    <Card>
                      <Empty>Homestay chưa có phòng.</Empty>
                    </Card>
                  )}
                  {list.map(({ room, feeds }) => {
                    const errors = feeds.filter((f) => f.last_error).length
                    return (
                      <Card key={room.id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-lg font-semibold m-0">Phòng {room.name}</h3>
                          {!feeds.length ? (
                            <Tag>Chưa nối OTA</Tag>
                          ) : errors ? (
                            <Tag tone="red">{errors} kênh lỗi</Tag>
                          ) : (
                            <Tag tone="green">Đang đồng bộ tốt</Tag>
                          )}
                        </div>
                        {feeds.map((f) => (
                          <FeedRow key={f.id} feed={f} />
                        ))}
                      </Card>
                    )
                  })}
                </section>
              )
            })}
          </div>
        </PageContainer>
      </Page>
      <PmsTabs active="/feeds" />
    </>
  )
}

function FeedRow({ feed }: { feed: Feed }) {
  const notify = useNotify()
  const actions = usePms((s) => s.actions)
  const status = !feed.last_synced_at
    ? 'Chưa đồng bộ lần nào'
    : feed.last_error
      ? `Lỗi ${ago(feed.last_synced_at)}${feed.last_ok_at ? ` · lần được gần nhất ${ago(feed.last_ok_at)}` : ''}`
      : `Đã đồng bộ ${ago(feed.last_synced_at)}`

  return (
    <div className="border-0 border-t border-solid border-border pt-3 space-y-3">
      <div>
        <div className="text-base font-semibold">{PROVIDER_NAME[feed.provider]}</div>
        <div className={feed.last_error ? 'text-base text-red-800' : 'text-base text-text-secondary'}>{status}</div>
      </div>
      {feed.last_error && (
        <div className="flex gap-2 items-start text-base bg-red-50 text-red-900 rounded-xl px-3 py-3">
          <WarnIcon label="Lỗi" size={20} />
          <span>{FEED_ERROR[feed.last_error]}</span>
        </div>
      )}
      <Button
        fullWidth
        size="medium"
        variant="secondary"
        prefixIcon={<Icon icon="zi-retry" />}
        onClick={() => notify(actions.sync(feed.id), 'Đã đồng bộ. Phòng trống đã cập nhật')}
      >
        Đồng bộ ngay
      </Button>
    </div>
  )
}
