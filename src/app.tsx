import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { Suspense } from 'react'
import { Route } from 'react-router-dom'
import { AnimationRoutes, App, SnackbarProvider, ZMPRouter } from 'zmp-ui'

import { ToastHost } from './modules/pms/components/ui'
import BookingPage from './pages/pms/booking'
import BookingFormPage from './pages/pms/booking-form'
import CalendarPage from './pages/pms/calendar'
import FeedsPage from './pages/pms/feeds'
import LoginPage from './pages/pms/login'
import ReportPage from './pages/pms/report'
import RoomFormPage from './pages/pms/room-form'
import RoomsPage from './pages/pms/rooms'
import SearchPage from './pages/pms/search'
import TodayPage from './pages/pms/today'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
    },
  },
})

const MyApp = () => {
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
                <Route path="/feeds" element={<FeedsPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/bookings/new" element={<BookingFormPage />} />
                <Route path="/bookings/:id" element={<BookingPage />} />
                <Route path="/bookings/:id/edit" element={<BookingFormPage />} />
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
