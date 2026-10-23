# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Homestay owners in Huế** — Vietnamese-speaking, on phones, often older and not comfortable with software. Role `owner` per homestay: all daily operations plus owner-only actions (Hoàn tác, prices).
- **Front-desk staff** — same profile; work at the desk on a phone: check-in/out, cleaning, lưu trú. Role `staff`: no prices, no owner-only actions.

Both already use Zalo daily; the mini app meets them there.

## Product Purpose

Zalo Mini App front-end for hueni-api (`../../hueni-api`), the mini PMS behind hueni.me's "Phòng trống" tab. It lets owners and staff run a homestay's day from inside Zalo. Success: answer "which rooms are free, who arrives/leaves today, what needs cleaning" in seconds, and act on it with one thumb — keeping vacancy on hueni.me correct.

## Positioning

Free listing traffic: accurate room status here puts a homestay's free rooms on hueni.me in front of travellers planning a Huế trip — direct guests without OTA commission. The mini app removes friction from keeping that status true: no browser, no password, it lives in Zalo.

## Operating Context

- Small family homestays, a handful of rooms each; bookings from Airbnb, Booking.com (iCal, synced by hueni-api) and direct (phone/Zalo, entered by hand).
- Daily rhythm: Hôm nay board → arrivals, departures, in-house guests, dirty rooms. Late arrivals after midnight count for the previous day until 06:00.
- Legal lưu trú declaration per guest; the app only reminds, it does not submit.
- Time zone Asia/Ho_Chi_Minh.

## Capabilities and Constraints

- **Scope: daily operations + owner report** — Hôm nay board, calendar, bookings (create/edit, hold/confirmed/cancelled), check-in/out, early check-in, room move, Dọn xong, lưu trú badge, OTA sync status, activity log, and the owner-only monthly Báo cáo (added 2026-10-20). Owner-only room setup in the app (add/edit/delete a room, floor, type, capacity, nightly and Fri–Sat price, amenities, open for new bookings; added 2026-10-23). Adding/removing calendar feeds and members stays in the hueni-api web admin.
- **Auth: Zalo identity** — mini app access token (`zmp-sdk getAccessToken`) → hueni-api maps to `users.zalo_id`. No password in the mini app. Accounts are still created/approved in the web admin.
- Domain rules come from hueni-api and must not be re-invented here: `end_date` exclusive; `Booking.occupying` defines "occupied"; `RoomDay` defines room state today; overlap rule = `Booking#date_problems`; OTA bookings are shown as conflicts, never rejected; cancelled bookings stay as history.
- Authorization per homestay: `:manage` = owner, `:operate` = owner or staff. The API enforces it; the UI hides what the user may not do.
- Stack fixed: Zalo Mini App (zmp-sdk, zmp-ui), React 18, Vite, Tailwind 3, zustand, react-query.
- **Open:** hueni-api has no JSON endpoints for admin operations yet (only `GET /v1/vacancy`); the current UI runs on in-memory mock data (`src/modules/pms/pms.store.ts`).

## Brand Commitments

- All UI copy in Vietnamese, plain and short; established terms shared with hueni-api: Hôm nay, Phòng trống, Nhận phòng / Trả phòng, Nhận phòng sớm, Dọn xong, Đã khai báo lưu trú, Hoàn tác, OTA đã huỷ, Lịch sử, Giữ chỗ, Chờ khách.

## Evidence on Hand

- Mock data in `src/modules/pms/pms.store.ts` is made-up. Real homestay data lives in the private hue-ni repo and must never be committed here.
- No testimonials, owner counts, booking volumes or traffic numbers exist — do not fabricate them.

## Product Principles

1. Vacancy truth first — every screen serves an accurate "room free/occupied" answer.
2. One-thumb operations — daily front-desk actions fast and obvious on a phone for non-technical users.
3. Record facts, don't block reality — check-in/out record what happened; OTA bookings shown as conflicts, not rejected.
4. Never lose history — cancelled and OTA-removed bookings stay visible.
5. Privacy by default — guest data stays inside the app; never in share links or logs.

## Accessibility & Inclusion

Older, low-tech-comfort users on phones: large tap targets, readable text sizes, clear Vietnamese labels over icons alone, no hover-only actions.
