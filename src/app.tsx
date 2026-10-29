import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { Suspense, useEffect } from 'react'
import { Navigate, Route } from 'react-router-dom'
import { AnimationRoutes, App, SnackbarProvider, ZMPRouter } from 'zmp-ui'

import { api } from './modules/pms/api'
import { toast, ToastHost } from './modules/pms/components/ui'
import { isLive } from './modules/pms/live'
import { Session, usePms } from './modules/pms/pms.store'
import { load } from './modules/pms/remote'
import BookingPage from './pages/pms/booking'
import BookingFormPage from './pages/pms/booking-form'
import BookingSitePage from './pages/pms/booking-site'
import CalendarPage from './pages/pms/calendar'
import ChannelsPage from './pages/pms/channels'
import FolioPage from './pages/pms/folio'
import GroupBookingPage from './pages/pms/group-booking'
import GuestsPage from './pages/pms/guests'
import HousekeepingPage from './pages/pms/housekeeping'
import LoginPage from './pages/pms/login'
import MessagesPage from './pages/pms/messages'
import MorePage from './pages/pms/more'
import RatesPage from './pages/pms/rates'
import RegistrationPage from './pages/pms/registration'
import ReportPage from './pages/pms/report'
import RoomFormPage from './pages/pms/room-form'
import RoomsPage from './pages/pms/rooms'
import SearchPage from './pages/pms/search'
import ShiftPage from './pages/pms/shift'
import StaffPage from './pages/pms/staff'
import TodayPage from './pages/pms/today'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
    },
  },
})

// Homestays added or removed on the web since last time. Offline or failing: keep what was stored.
function refreshMe() {
  const { token, actions } = usePms.getState()
  if (!token) return
  api<Omit<Session, 'token'>>('/me')
    .then((me) => {
      const now = usePms.getState().token // may have been renewed meanwhile
      if (!me.places.length) return actions.signOut()
      actions.signIn({ ...me, token: now })
      reload()
    })
    .catch(() => {})
}

// Rooms and bookings of every homestay; again whenever the app comes back to the front.
const reload = () => load().then((error) => error && toast(error))

// A screen still on mock data: a direct link lands on Hôm nay (#21).
const live = (path: string, page: React.ReactElement) => (isLive(path) ? page : <Navigate to="/" replace />)

const MyApp = () => {
  const token = usePms((s) => s.token)
  useEffect(refreshMe, [])
  useEffect(() => {
    if (!token) return
    reload()
    const onShow = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [token])
  return (
    <App>
      <Suspense>
        <QueryClientProvider client={queryClient}>
          <SnackbarProvider>
            <ZMPRouter>
              <AnimationRoutes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<TodayPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/rooms" element={<RoomsPage />} />
                <Route path="/rooms/new" element={<RoomFormPage />} />
                <Route path="/rooms/:id/edit" element={<RoomFormPage />} />
                <Route path="/report" element={<ReportPage />} />
                <Route path="/more" element={<MorePage />} />
                <Route path="/registration" element={live('/registration', <RegistrationPage />)} />
                <Route path="/shift" element={live('/shift', <ShiftPage />)} />
                <Route path="/housekeeping" element={live('/housekeeping', <HousekeepingPage />)} />
                <Route path="/guests" element={live('/guests', <GuestsPage />)} />
                <Route path="/guests/:id" element={live('/guests/:id', <GuestsPage />)} />
                <Route path="/messages" element={live('/messages', <MessagesPage />)} />
                <Route path="/groups/new" element={live('/groups/new', <GroupBookingPage />)} />
                <Route path="/groups/:id" element={live('/groups/:id', <GroupBookingPage />)} />
                <Route path="/channels" element={<ChannelsPage />} />
                <Route path="/booking-site" element={live('/booking-site', <BookingSitePage />)} />
                <Route path="/rates" element={live('/rates', <RatesPage />)} />
                <Route path="/staff" element={live('/staff', <StaffPage />)} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/bookings/new" element={<BookingFormPage />} />
                <Route path="/bookings/:id" element={<BookingPage />} />
                <Route path="/bookings/:id/edit" element={<BookingFormPage />} />
                <Route path="/bookings/:id/folio" element={<FolioPage />} />
              </AnimationRoutes>
              <ToastHost />
            </ZMPRouter>
          </SnackbarProvider>
        </QueryClientProvider>
      </Suspense>
    </App>
  )
}
export default MyApp
