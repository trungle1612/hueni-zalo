import React from 'react'
import { useNavigate } from 'zmp-ui'

import { api } from '@/modules/pms/api'
import { A, AppBar, Badge, PlaceSub, Screen, Sec, useCurrent } from '@/modules/pms/components/ui'
import { isLive } from '@/modules/pms/live'
import { can, failingFeeds, isStaying, needsCleaning, usePms } from '@/modules/pms/pms.store'

type Item = { to: string; title: string; sub: string; badge?: React.ReactNode }

// Thêm: the modules beyond the four daily tabs. Owner-only setup is hidden from staff.
export default function MorePage() {
  const navigate = useNavigate()
  const { user, token, bookings, feeds, rooms: allRooms, actions } = usePms()
  const { place, rooms } = useCurrent()
  const owner = can(place, 'manage')
  const ids = new Set(rooms.map((r) => r.id))
  const undeclared = bookings.filter((b) => ids.has(b.room_id) && isStaying(b) && !b.declared_at).length
  const dirty = rooms.filter(needsCleaning).length
  const failing = failingFeeds(feeds, allRooms, place.id)

  const all: [string, Item[]][] = [
    [
      'Vận hành hằng ngày',
      [
        {
          to: '/registration',
          title: 'Khai báo lưu trú',
          sub: 'Khách ở qua đêm, hạn 23:00 mỗi ngày',
          badge: undeclared > 0 && <Badge tone="warning">{undeclared} chưa gửi</Badge>,
        },
        { to: '/shift', title: 'Giao ca', sub: 'Đếm két, ghi khoản chi, bàn giao ca sau' },
        {
          to: '/housekeeping',
          title: 'Buồng phòng',
          sub: dirty ? `${dirty} phòng cần dọn hôm nay` : 'Không có phòng cần dọn',
        },
      ],
    ],
    [
      'Khách và bán phòng',
      [
        { to: '/guests', title: 'Hồ sơ khách', sub: 'Khách quen, ghi chú cho lễ tân' },
        { to: '/groups/new', title: 'Đặt phòng theo đoàn', sub: 'Nhiều phòng, một người đại diện' },
        {
          to: '/channels',
          title: 'Kênh bán phòng',
          sub: 'Airbnb, Booking.com, Agoda',
          badge: failing > 0 && <Badge tone="danger">{failing} kênh lỗi</Badge>,
        },
        ...(owner
          ? [
              { to: '/booking-site', title: 'Trang đặt phòng trực tiếp', sub: 'Khách tự đặt, không mất hoa hồng' },
              { to: '/messages', title: 'Tin nhắn tự động', sub: 'Xác nhận, nhắc đến, cảm ơn · Zalo, SMS' },
            ]
          : []),
      ],
    ],
    ...(owner
      ? ([
          [
            'Thiết lập · chủ cơ sở',
            [
              { to: '/rates', title: 'Loại phòng và giá', sub: 'Giá theo loại, mùa cao điểm, phụ thu' },
              { to: '/rooms/new', title: 'Thêm phòng', sub: `${rooms.length} phòng đang có` },
              { to: '/staff', title: 'Nhân viên và nhật ký', sub: 'Quyền của từng người, thao tác cần chú ý' },
            ],
          ],
        ] as [string, Item[]][])
      : []),
  ]

  // Screens still on mock data are hidden with the API (#21); so is a group left empty.
  const groups = all
    .map(([title, items]) => [title, items.filter((it) => isLive(it.to))] as [string, Item[]])
    .filter(([, items]) => items.length)

  return (
    <Screen tab="/more">
      <AppBar title="Thêm" sub={<PlaceSub />} />
      <main className="scroll">
        {groups.map(([title, items]) => (
          <Sec key={title} title={title}>
            <div className="panel">
              {items.map((it) => (
                <A key={it.to} className="row" to={it.to}>
                  <span className="grow">
                    <span className="t1">{it.title}</span>
                    <span className="t2">{it.sub}</span>
                  </span>
                  {it.badge}
                </A>
              ))}
            </div>
          </Sec>
        ))}
        <Sec title="Tài khoản">
          <div className="panel">
            <div className="row">
              <span className="grow">
                <span className="t1">{user.name}</span>
                <span className="t2">
                  {owner ? 'Chủ cơ sở' : 'Lễ tân'} · {place.name}
                </span>
              </span>
            </div>
            <button
              type="button"
              className="row"
              onClick={() => {
                // Best effort: the token is forgotten here either way.
                if (token) api('/session', { method: 'DELETE' }).catch(() => {})
                actions.signOut()
                navigate('/login', { replace: true })
              }}
            >
              Đăng xuất
            </button>
          </div>
        </Sec>
        <div className="end" />
      </main>
    </Screen>
  )
}
