import React from 'react'
import { BottomNavigation, Icon, useNavigate } from 'zmp-ui'

const TABS = [
  { key: '/', label: 'Hôm nay', icon: 'zi-home' },
  { key: '/calendar', label: 'Lịch', icon: 'zi-calendar' },
  { key: '/bookings/new', label: 'Đặt phòng', icon: 'zi-plus-circle' },
] as const

export function PmsTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  const navigate = useNavigate()
  return (
    <BottomNavigation fixed activeKey={active} onChange={(key) => navigate(key, { animate: false, replace: true })}>
      {TABS.map((t) => (
        <BottomNavigation.Item key={t.key} label={t.label} icon={<Icon icon={t.icon} />} />
      ))}
    </BottomNavigation>
  )
}
