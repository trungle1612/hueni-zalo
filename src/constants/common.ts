// hueni-api. Empty only in `vite dev` without VITE_API_URL: mock data and mock sign-in.
export const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'https://api.hueni.me')
