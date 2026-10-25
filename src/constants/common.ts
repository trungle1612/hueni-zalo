export const APP_ID = window.APP_ID
// hueni-api. Empty only in `vite dev` without VITE_API_URL: mock data and mock sign-in.
export const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'https://api.hueni.me')
export const INIT_URL = new URL(window.location.href)
export const APP_ENV = INIT_URL.searchParams.get('env')
export const IS_DEV = import.meta.env.DEV || APP_ENV === 'DEVELOPMENT'
export const IS_TESTING = import.meta.env.DEV || APP_ENV === 'TESTING'
export const DEFAULT_ORDER_SESSION_ID = INIT_URL.searchParams.get('orderSession') || undefined
