import { API_URL } from '@/constants/common'

// Screens (and parts of screens) still on mock data, each until its hueni-api endpoint lands. In a production
// build (API_URL set) they are hidden so owners never act on fake data; `vite dev` without VITE_API_URL shows all.
// Connecting one = deleting its line in the same PR.
// ponytail: static list; move to server-driven flags only if per-homestay rollout is needed.
const MOCK_ONLY = [
  '/registration', // #29 Khai báo lưu trú
  '/shift', // #27 Giao ca
  '/housekeeping', // #26 Buồng phòng
  '/guests', // #25 Hồ sơ khách
  '/booking-site', // #32 Trang đặt phòng trực tiếp
  '/messages', // #31 Tin nhắn tự động
  '/rates', // #23 Loại phòng và giá (seasons, surcharges, policy)
  '/staff', // #28 Nhân viên và nhật ký
  'folio-documents', // #30, #31 Phiếu thu gửi Zalo, hoá đơn điện tử
]

// A path or one of its sub-paths (/guests covers /guests/12).
export const isLive = (path: string) => !API_URL || !MOCK_ONLY.some((p) => path === p || path.startsWith(`${p}/`))
