import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { Suspense } from 'react'
import { Route } from 'react-router-dom'
import { AnimationRoutes, App, SnackbarProvider, ZMPRouter } from 'zmp-ui'

import BookingPage from './pages/pms/booking'
import NewBookingPage from './pages/pms/booking-new'
import CalendarPage from './pages/pms/calendar'
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
                <Route path="/bookings/new" element={<NewBookingPage />} />
                <Route path="/bookings/:id" element={<BookingPage />} />
              </AnimationRoutes>
            </ZMPRouter>
          </SnackbarProvider>
        </QueryClientProvider>
      </Suspense>
    </App>
  )
}
export default MyApp
