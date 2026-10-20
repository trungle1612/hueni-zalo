import React from 'react'
import { BottomNavigation, Icon, useNavigate } from 'zmp-ui'

import { usePms } from './pms.store'

const TABS = [
  { key: '/', label: 'Hôm nay', icon: 'zi-home' },
  { key: '/calendar', label: 'Lịch phòng', icon: 'zi-calendar' },
  { key: '/feeds', label: 'Kênh OTA', icon: 'zi-retry' },
  { key: '/report', label: 'Báo cáo', icon: 'zi-poll' },
] as const

export function PmsTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  const navigate = useNavigate()
  // Báo cáo is owner-only: staff never see the tab.
  const owner = usePms((s) => s.places.some((p) => p.role === 'owner'))
  return (
    <BottomNavigation fixed activeKey={active} onChange={(key) => navigate(key, { animate: false, replace: true })}>
      {TABS.filter((t) => owner || t.key !== '/report').map((t) => (
        <BottomNavigation.Item key={t.key} label={t.label} icon={<Icon icon={t.icon} />} />
      ))}
    </BottomNavigation>
  )
}
