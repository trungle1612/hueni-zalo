import dayjs from 'dayjs'
import React from 'react'

import { AppBar, Badge, PlaceSub, Screen, Sec, toast, useCurrent } from '@/modules/pms/components/ui'
import { Feed, FEED_ERROR, PROVIDER_NAME, usePms } from '@/modules/pms/pms.store'

const ago = (iso: string) => dayjs(iso).fromNow()

// Read-only sync status + Đồng bộ ngay. Adding / removing feeds stays in the web admin.
export default function FeedsPage() {
  const { feeds, actions } = usePms()
  const { rooms } = useCurrent()
  const list = rooms
    .map((room) => ({ room, feeds: feeds.filter((f) => f.room_id === room.id) }))
    .sort((a, b) => Number(b.feeds.some((f) => f.last_error)) - Number(a.feeds.some((f) => f.last_error)))

  const status = (f: Feed) =>
    !f.last_synced_at
      ? 'Chưa đồng bộ lần nào'
      : f.last_error
        ? `Lỗi ${ago(f.last_synced_at)}${f.last_ok_at ? ` · đồng bộ được lần cuối ${ago(f.last_ok_at)}` : ''}`
        : `Đã đồng bộ ${ago(f.last_synced_at)}`

  return (
    <Screen>
      <AppBar lead="back" title="Kênh OTA" sub={<PlaceSub />} />
      <main className="scroll">
        <div className="sec">
          <p className="help">
            hueni tự lấy lịch Airbnb / Booking.com mỗi giờ để phòng trống luôn đúng. Thêm hoặc xoá kênh trên trang quản
            trị hueni.
          </p>
        </div>
        {list.map(({ room, feeds }) => (
          <Sec
            key={room.id}
            title={`Phòng ${room.name}`}
            aside={
              !feeds.length ? (
                <span className="aside">Chưa nối OTA</span>
              ) : feeds.some((f) => f.last_error) ? (
                <Badge tone="danger">{feeds.filter((f) => f.last_error).length} kênh lỗi</Badge>
              ) : undefined
            }
          >
            {feeds.length > 0 && (
              <div className="panel">
                {feeds.map((f) => (
                  <div key={f.id} className="row" style={{ flexWrap: 'wrap' }}>
                    <span className="grow">
                      <span className="t1">{PROVIDER_NAME[f.provider]}</span>
                      <span
                        className="t2"
                        style={{ whiteSpace: 'normal', ...(f.last_error ? { color: 'var(--danger)' } : {}) }}
                      >
                        {status(f)}
                      </span>
                    </span>
                    {/* A dead link can't be retried from here: the fix is a new link in the web admin. */}
                    {f.last_error !== 'gone' && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => toast(actions.sync(f.id) || 'Đã đồng bộ. Phòng trống đã cập nhật')}
                      >
                        {f.last_error ? 'Thử lại' : 'Đồng bộ ngay'}
                      </button>
                    )}
                    {f.last_error && (
                      <div className="alert" style={{ flexBasis: '100%' }}>
                        {FEED_ERROR[f.last_error]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Sec>
        ))}
        <div className="end" />
      </main>
    </Screen>
  )
}
