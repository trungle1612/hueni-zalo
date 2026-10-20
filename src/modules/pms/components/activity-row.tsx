import dayjs from 'dayjs'
import React from 'react'
import { Icon } from 'zmp-ui'

import { clsx } from '@/utils/clsx'

import { Activity, ActivityKind } from '../pms.store'
import { Tag } from './ui'

const KIND: Record<ActivityKind, { icon: string; className: string }> = {
  booking: { icon: 'zi-calendar', className: 'bg-primary-soft text-primary-pressed' },
  stay: { icon: 'zi-user-check', className: 'bg-sky-100 text-sky-800' },
  room: { icon: 'zi-home', className: 'bg-stone-200 text-stone-800' },
  sync: { icon: 'zi-retry', className: 'bg-gray-100 text-gray-700' },
  error: { icon: 'zi-warning', className: 'bg-red-100 text-red-800' },
}

export function ActivityRow({ activity, roomName }: { activity: Activity; roomName?: string }) {
  const kind = KIND[activity.kind]
  return (
    <div className="flex gap-3 py-3">
      <span className={clsx('w-10 h-10 rounded-full flex items-center justify-center shrink-0', kind.className)}>
        <Icon icon={kind.icon as 'zi-home'} size={20} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-base">
          {roomName && <Tag className="bg-ng-10 text-text mr-1">Phòng {roomName}</Tag>}
          <span className={clsx('font-semibold', activity.kind === 'error' && 'text-red-800')}>{activity.action}</span>
          {activity.detail && <span className="text-text-secondary"> · {activity.detail}</span>}
        </div>
        <div className="text-sm text-text-secondary mt-0.5">{activity.actor}</div>
      </div>
      <div className="text-sm text-text-secondary shrink-0">{dayjs(activity.at).format('HH:mm')}</div>
    </div>
  )
}
