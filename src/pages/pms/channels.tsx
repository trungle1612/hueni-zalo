import './sales.scss'

import dayjs from 'dayjs'
import React, { useState } from 'react'

import { API_URL } from '@/constants/common'
import {
  A,
  AppBar,
  Badge,
  bookingStatus,
  Field,
  KV,
  PlaceSub,
  Screen,
  Sec,
  Sheet,
  toast,
  Tone,
  useCurrent,
  useRecord,
} from '@/modules/pms/components/ui'
import { isLive } from '@/modules/pms/live'
import {
  Booking,
  bookingCode,
  can,
  conflicts,
  Feed,
  FEED_ERROR,
  fmtRange,
  fmtTime,
  guestLabel,
  isOpen,
  isRoomFree,
  isStaying,
  occupiedUntil,
  Provider,
  PROVIDER_NAME,
  today,
  usePms,
} from '@/modules/pms/pms.store'
import { remote, useActivity, useCommissions } from '@/modules/pms/remote'
import { useSales } from '@/modules/pms/sales.store'

const ago = (iso: string) => dayjs(iso).fromNow()
const CHANNELS: { key: Provider; abbr: string }[] = [
  { key: 'booking', abbr: 'B' },
  { key: 'agoda', abbr: 'A' },
  { key: 'airbnb', abbr: 'Ai' },
  { key: 'other', abbr: 'iC' },
]
const ICS = /^https:\/\/[^\s/]+\/\S*\.ics(\?\S*)?$/i

// iCal channels per OTA: each room has its own link; only the host is kept and shown (the URL carries OTA tokens).
export default function ChannelsPage() {
  const { feeds, bookings, activities } = usePms()
  const { place, rooms, roomOf } = useCurrent()
  const owner = can(place, 'manage')
  const sales = useSales()
  const { commission, save: saveCommission } = useCommissions(place.id, sales.commission, (k, pct) =>
    sales.setCommission(k as Provider, pct),
  )
  const record = useRecord()
  const [open, setOpen] = useState<Provider>()
  const [fixing, setFixing] = useState(false)

  const ids = new Set(rooms.map((r) => r.id))
  const mine = feeds.filter((f) => ids.has(f.room_id))
  const errCount = mine.filter((f) => f.last_error).length
  const clash = conflicts(bookings.filter((b) => ids.has(b.room_id)))[0]
  const month = dayjs().format('YYYY-MM')
  const server = useActivity(API_URL && owner ? `/places/${place.id}/activity` : undefined)
  const log = (API_URL ? server.lines : activities.filter((a) => a.place_id === place.id))
    .filter((a) => a.kind === 'sync' || a.kind === 'error')
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5)

  async function syncAll() {
    // One at a time: each waits for its OTA. A link synced under a minute ago is skipped.
    for (const f of mine) await remote.sync(f.id)
    const bad = usePms.getState().feeds.filter((f) => ids.has(f.room_id) && f.last_error).length
    toast(bad ? `Đồng bộ xong · ${bad} link vẫn lỗi` : 'Đồng bộ xong. Phòng trống đã cập nhật')
  }

  return (
    <Screen>
      <AppBar
        lead="back"
        title="Kênh bán phòng"
        sub={<PlaceSub prefix={errCount ? `${errCount} link lỗi` : 'Tự đồng bộ mỗi giờ'} />}
      />
      <main className="scroll">
        {clash && (
          <div className="sec">
            <div className="notice err" role="alert">
              <span>
                <b>
                  Trùng phòng {roomOf(clash.ota.room_id)?.name} · {fmtRange(clash.ota)}.
                </b>{' '}
                {PROVIDER_NAME[clash.ota.provider || 'other']} đẩy về một đặt phòng chồng lên{' '}
                {bookingCode(clash.manual)}.
              </span>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => setFixing(true)}>
                Xử lý
              </button>
            </div>
          </div>
        )}

        <Sec title="Kênh đã thiết lập">
          <div className="panel">
            {CHANNELS.filter((c) => c.key !== 'other' || mine.some((f) => f.provider === 'other')).map(
              ({ key, abbr }) => {
                const list = mine.filter((f) => f.provider === key)
                const bad = list.filter((f) => f.last_error).length
                const count = bookings.filter(
                  (b) => ids.has(b.room_id) && b.provider === key && b.start_date.startsWith(month),
                ).length
                const [label, tone]: [string, Tone] = !list.length
                  ? ['Chưa kết nối', 'neutral']
                  : bad
                    ? ['Lỗi', 'danger']
                    : ['Đang chạy', 'positive']
                return (
                  <button
                    key={key}
                    type="button"
                    className="row"
                    aria-label={`${PROVIDER_NAME[key]}, ${label}`}
                    onClick={() => setOpen(key)}
                  >
                    <span className="logo" aria-hidden="true">
                      {abbr}
                    </span>
                    <span className="grow">
                      <span className="t1">{PROVIDER_NAME[key]}</span>
                      <span className="t2">
                        {list.length
                          ? `Hoa hồng ${commission[key] ?? 0}% · ${list.length} phòng · ${count} đặt tháng này`
                          : 'Chưa nhập link lịch'}
                      </span>
                    </span>
                    <Badge tone={tone}>{label}</Badge>
                  </button>
                )
              },
            )}
            {owner && isLive('/booking-site') && (
              <A className="row" to="/booking-site">
                <span className="logo" aria-hidden="true">
                  W
                </span>
                <span className="grow">
                  <span className="t1">Trang đặt phòng riêng</span>
                  <span className="t2">Khách tự đặt · không mất hoa hồng</span>
                </span>
                <Badge tone="info">Trong hueni</Badge>
              </A>
            )}
          </div>
          <p className="help" style={{ marginTop: 8 }}>
            iCal chỉ đồng bộ phòng trống / đã đặt, không đồng bộ giá. Giá trên từng kênh vẫn sửa trong trang quản lý của
            kênh đó.
          </p>
        </Sec>

        {log.length > 0 && (
          <Sec title="Lần đồng bộ gần đây">
            <div className="panel">
              {log.map((a) => (
                <div key={a.id} className="row">
                  <span className="grow">
                    <span className="t1" style={a.kind === 'error' ? { color: 'var(--danger)' } : undefined}>
                      {a.actor}: {a.action.toLowerCase()}
                      {a.detail && ` · ${a.detail}`}
                    </span>
                    <span className="t2">
                      Phòng {a.room_id && roomOf(a.room_id)?.name} · {fmtTime(a.at)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Sec>
        )}
        <div className="end" />
      </main>

      {mine.length > 0 && (
        <div className="footer-bar">
          <button type="button" className="btn btn-primary btn-block" onClick={syncAll}>
            Đồng bộ ngay
          </button>
        </div>
      )}

      {open && (
        <ChannelSheet
          provider={open}
          feeds={mine.filter((f) => f.provider === open)}
          owner={owner}
          commission={commission[open] ?? 0}
          onCommission={async (pct) => {
            if (pct === (commission[open] ?? 0)) return
            const error = await saveCommission(open, pct)
            if (error) toast(error)
          }}
          onClose={() => setOpen(undefined)}
        />
      )}
      {fixing && clash && (
        <ConflictSheet
          ota={clash.ota}
          manual={clash.manual}
          onClose={() => setFixing(false)}
          onMove={async (roomId, name) => {
            const m = clash.manual
            const { id: _id, source: _s, ...draft } = m
            const error = await record(
              () =>
                isStaying(m)
                  ? remote.move(m.id, roomId)
                  : remote.update(m.id, {
                      ...draft,
                      status: m.status === 'hold' ? 'hold' : 'confirmed',
                      room_id: roomId,
                    }),
              `Đã chuyển ${guestLabel(m)} sang phòng ${name}`,
            )
            if (!error) setFixing(false)
          }}
        />
      )}
    </Screen>
  )
}

function ChannelSheet({
  provider,
  feeds,
  owner,
  commission,
  onCommission,
  onClose,
}: {
  provider: Provider
  feeds: Feed[]
  owner: boolean
  commission: number
  onCommission: (pct: number) => void
  onClose: () => void
}) {
  const { actions } = usePms()
  const { rooms, roomOf } = useCurrent()
  const free = rooms.filter((r) => !feeds.some((f) => f.room_id === r.id))
  const [roomId, setRoomId] = useState<number | undefined>(free[0]?.id)
  const [url, setUrl] = useState('')
  const [pct, setPct] = useState(String(commission))
  const [tried, setTried] = useState(false)
  const name = PROVIDER_NAME[provider]
  const urlBad = !ICS.test(url.trim())

  const status = (f: Feed) =>
    !f.last_synced_at
      ? 'Chưa đồng bộ lần nào'
      : f.last_error
        ? `Lỗi ${ago(f.last_synced_at)}${f.last_ok_at ? ` · đồng bộ được lần cuối ${ago(f.last_ok_at)}` : ''}`
        : `Đã đồng bộ ${ago(f.last_synced_at)}`

  function add() {
    setTried(true)
    if (urlBad || roomId === undefined) return
    const id = Math.max(0, ...usePms.getState().feeds.map((f) => f.id)) + 1
    // ponytail: the mock keeps only the host; hueni-api stores the full URL server-side.
    usePms.setState((s) => ({ feeds: [...s.feeds, { id, room_id: roomId, provider, host: new URL(url.trim()).host }] }))
    const error = actions.sync(id)
    toast(error || `${name} đã đọc được lịch phòng ${roomOf(roomId)?.name}`)
    setUrl('')
    setTried(false)
    setRoomId(free.find((r) => r.id !== roomId)?.id)
  }

  function remove(f: Feed) {
    const before = usePms.getState().feeds
    usePms.setState({ feeds: before.filter((x) => x.id !== f.id) })
    toast(`Đã ngắt ${name} phòng ${roomOf(f.room_id)?.name}. Phòng không còn chặn theo lịch kênh này.`, () =>
      usePms.setState({ feeds: before }),
    )
  }

  return (
    <Sheet title={name} onClose={onClose}>
      {feeds.length > 0 && (
        <div className="panel">
          {feeds.map((f) => (
            <div key={f.id} className="row" style={{ flexWrap: 'wrap' }}>
              <span className="rn">{roomOf(f.room_id)?.name}</span>
              <span className="grow">
                <span className="t1">{f.host}</span>
                <span
                  className="t2"
                  style={{ whiteSpace: 'normal', ...(f.last_error ? { color: 'var(--danger)' } : {}) }}
                >
                  {status(f)}
                </span>
              </span>
              {(f.last_error !== 'gone' || owner) && (
                <div style={{ display: 'flex', gap: 8, flexBasis: '100%' }}>
                  {/* A dead link can't be retried: the fix is a new link. */}
                  {f.last_error !== 'gone' && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={async () => toast((await remote.sync(f.id)) || 'Đã đồng bộ. Phòng trống đã cập nhật')}
                    >
                      {f.last_error ? 'Thử lại' : 'Đồng bộ ngay'}
                    </button>
                  )}
                  {/* With hueni-api, links are added and removed on the web (wiki Mini-App-API, Kênh OTA). */}
                  {owner && !API_URL && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(f)}>
                      Ngắt kết nối
                    </button>
                  )}
                </div>
              )}
              {f.last_error && (
                <div className="alert" style={{ flexBasis: '100%' }}>
                  {f.error_message || FEED_ERROR[f.last_error]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {owner && free.length > 0 && API_URL && (
        <p className="help">Thêm hoặc ngắt link lịch trên trang quản trị hueni, mục Kênh OTA.</p>
      )}
      {owner && free.length > 0 && !API_URL && (
        <div className="panel form">
          <Field label="Phòng">
            {(p) => (
              <select {...p} value={roomId} onChange={(e) => setRoomId(Number(e.target.value))}>
                {free.map((r) => (
                  <option key={r.id} value={r.id}>
                    Phòng {r.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label={`Link lịch iCal từ ${name}`}
            error={tried && urlBad && 'Link phải bắt đầu bằng https:// và kết thúc bằng .ics'}
            help="Lấy trong trang quản lý của kênh, mục xuất lịch."
          >
            {(p) => (
              <input
                {...p}
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://…/….ics"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            )}
          </Field>
          <button type="button" className="btn btn-primary btn-block" disabled={!url.trim()} onClick={add}>
            Kết nối phòng {roomOf(roomId ?? -1)?.name}
          </button>
        </div>
      )}
      {owner ? (
        <Field label="Hoa hồng (%)" help="Dùng để tính doanh thu thực nhận trong Báo cáo.">
          {(p) => (
            <input
              {...p}
              type="text"
              inputMode="numeric"
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/\D/g, '').slice(0, 2))}
              onBlur={() => onCommission(Number(pct) || 0)}
            />
          )}
        </Field>
      ) : (
        <p className="help">Hoa hồng {commission}%. Chủ cơ sở thêm hoặc ngắt link lịch.</p>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-block"
        onClick={() => (onCommission(Number(pct) || 0), onClose())}
      >
        Đóng
      </button>
    </Sheet>
  )
}

type Fix = 'move' | 'contact' | 'reject'

function ConflictSheet({
  ota,
  manual,
  onClose,
  onMove,
}: {
  ota: Booking
  manual: Booking
  onClose: () => void
  onMove: (roomId: number, name: string) => void
}) {
  const bookings = usePms((s) => s.bookings)
  const { rooms, roomOf } = useCurrent()
  const [pick, setPick] = useState<Fix>()
  const here = roomOf(manual.room_id)
  const from = isStaying(manual) ? today() : manual.start_date
  const target = rooms
    .filter(
      (r) => r.id !== manual.room_id && isOpen(r) && isRoomFree(bookings, r.id, from, occupiedUntil(manual), manual.id),
    )
    .sort((a, b) => Number((b.kind || '') === (here?.kind || '')) - Number((a.kind || '') === (here?.kind || '')))[0]
  const otaName = PROVIDER_NAME[ota.provider || 'other']
  const options: [Fix, string, string][] = [
    ...(target && manual.source === 'manual'
      ? ([
          [
            'move',
            `Chuyển ${guestLabel(manual)} sang phòng ${target.name}`,
            `${target.kind || 'Phòng'}, trống ${fmtRange(manual)}. Khách OTA giữ phòng ${here?.name}.`,
          ],
        ] as [Fix, string, string][])
      : []),
    ['contact', 'Giữ nguyên, tôi tự liên hệ', `Vẫn hiện trong Cần xử lý trên Hôm nay. Phòng ${here?.name} vẫn trùng.`],
    [
      'reject',
      `Báo ${otaName} không nhận đặt phòng`,
      `Làm trên trang ${otaName}. Có thể bị phạt theo chính sách kênh.`,
    ],
  ]

  return (
    <Sheet title={`Xử lý trùng phòng ${here?.name}`} onClose={onClose}>
      <dl className="panel">
        <KV label={`Trực tiếp · ${bookingCode(manual)}`}>
          {guestLabel(manual)} · {fmtRange(manual)} · {bookingStatus(manual).label.toLowerCase()}
        </KV>
        <KV label={otaName}>
          {guestLabel(ota)} · {fmtRange(ota)}
        </KV>
      </dl>
      <div className="list" role="group" aria-label="Cách xử lý">
        {options.map(([key, title, sub]) => (
          <button key={key} type="button" className="pick" aria-pressed={pick === key} onClick={() => setPick(key)}>
            <span className="grow">
              <span className="t1">{title}</span>
              <span className="t2" style={{ whiteSpace: 'normal' }}>
                {sub}
              </span>
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!pick}
        onClick={() => {
          if (pick === 'move') return onMove(target!.id, target!.name)
          toast(
            pick === 'reject'
              ? `Nhớ từ chối trên trang ${otaName}. Lịch tự hết trùng khi kênh huỷ.`
              : 'Đã để lại trong Cần xử lý hôm nay',
          )
          onClose()
        }}
      >
        Xác nhận
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
        Để sau
      </button>
    </Sheet>
  )
}
