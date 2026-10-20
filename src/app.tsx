import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { Suspense } from 'react'
import { Route } from 'react-router-dom'
import { AnimationRoutes, App, SnackbarProvider, ZMPRouter } from 'zmp-ui'

import ActivityPage from './pages/pms/activity'
import BookingPage from './pages/pms/booking'
import BookingFormPage from './pages/pms/booking-form'
import CalendarPage from './pages/pms/calendar'
import FeedsPage from './pages/pms/feeds'
import PlacePage from './pages/pms/place'
import ReportPage from './pages/pms/report'
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
                <Route path="/" element={<TodayPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/feeds" element={<FeedsPage />} />
                <Route path="/report" element={<ReportPage />} />
                <Route path="/places/:slug" element={<PlacePage />} />
                <Route path="/places/:slug/activity" element={<ActivityPage />} />
                <Route path="/bookings/new" element={<BookingFormPage />} />
                <Route path="/bookings/:id" element={<BookingPage />} />
                <Route path="/bookings/:id/edit" element={<BookingFormPage />} />
              </AnimationRoutes>
            </ZMPRouter>
          </SnackbarProvider>
        </QueryClientProvider>
      </Suspense>
    </App>
  )
}
export default MyApp
