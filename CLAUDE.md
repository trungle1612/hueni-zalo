# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Zalo Mini App PMS for Huế homestay owners and staff, the phone front-end of **hueni-api** (`trungle1612/hueni-api`, usually at `../hueni-api`; read its `CLAUDE.md` for domain rules). Product, users, glossary and principles: `PRODUCT.md`. Screen specs: the [wiki](https://github.com/trungle1612/hueni-zalo/wiki). Cross-repo context and feature briefs: `../hueni-workspace`.

Work is tracked as GitHub issues under epic #15. The matching API work is hueni-api #119 (section C: #153 read, #154 write, #155 report + search, #157 OTA status, #158 activity). Issue bodies are newer than the wiki; if code, issue and wiki disagree, ask.

## Commands

```bash
npm install
npm run dev      # http://127.0.0.1:3000; empty VITE_API_URL in dev = mock mode
npm run build    # tsc && vite build → www/
npm run lint     # eslint src (npm run fix to autofix)
```

No test suite. Verify changes by running the app (`npm run dev`) and, for API work, against hueni-api with an owner and a staff account.

`npm run deploy` / `deploy:live` publish to Zalo via `zmp-cli` (they call `pnpm`). Never run them without explicit approval.

## Architecture

- Entry `src/app.tsx`: zmp-ui `ZMPRouter` + `AnimationRoutes` with react-router-dom routes. Pages in `src/pages/pms/`, shared PMS components in `src/modules/pms/components/`.
- State: zustand stores in `src/modules/pms/` (`pms.store.ts` core: places, rooms, bookings, session; plus `ops`, `guests`, `sales`, `setup` stores; `report.ts`). React Query is installed but unused.
- **API client** `src/modules/pms/api.ts`: `api<T>(path, { method, body })` → `${API_URL}/api/v1${path}` with `Authorization: Bearer <hueni ApiToken>` (from `POST /api/v1/session`, not the Zalo access token). 401 with a token → quiet re-login (`getAccessToken()` + `POST /session`), retry once, else `signOut()`. Errors → `ApiError(message, status, code, body)` (`body.errors` per field); show the server's Vietnamese `message` as-is. `API_URL` in `src/constants/common.ts` from `VITE_API_URL`.
- **Sign-in** `src/pages/pms/login.tsx`: `getAccessToken()` → `POST /api/v1/session`; `not_registered` → explain, then `getPhoneNumber()` token as `phone_token` to link the account created in the web admin. Session `{token, user, places[{id, slug, name, role}]}` in localStorage `pms.session`.
- **Mock data vs API:** with `VITE_API_URL`, the daily screens go through `src/modules/pms/remote.ts` (requests; mock actions without it). Screens still on mock data are listed in `MOCK_ONLY` in `src/modules/pms/live.ts`: hidden in production builds, shown in `vite dev`. Connecting one = wire it to `api()`, delete the client copy of the rule, delete its `MOCK_ONLY` line in the same PR.
- Roles: `owner | staff` per place; `can(place, 'manage' | 'operate')` mirrors hueni-api `allowed_to?`. The UI only hides; the API enforces.
- Types in `pms.store.ts` mirror hueni-api `db/schema.rb`, and hueni-api shapes its `/api/v1` JSON after them. Change them together. Known drift: `hold` status (removed in hueni-api #127), room maintenance shape.
- Styling: Tailwind 3 + `src/modules/pms/pms.scss` (CSS variables). Prettier: 120 cols, single quotes, no semicolons, trailing commas.
- Template leftovers, not used by the PMS: `src/utils/request.ts`, `src/mock/`, `src/pages/menu|orders|info.tsx`, `README.md`, `app-config.json` values.

## Rules

- Domain rules belong to hueni-api; don't add new ones here (`end_date` exclusive, `Booking.occupying`, `RoomDay`, `Booking#date_problems`, `Report`). OTA conflicts are shown, never rejected; cancelled bookings stay.
- Time zone Asia/Ho_Chi_Minh; arrivals before 06:00 count for the previous day.
- All UI copy Vietnamese, short and plain, using the glossary in `PRODUCT.md`. Older users on phones: large tap targets, labels not icon-only, no hover-only actions.
- Privacy: guest data never in URLs, share links, logs or console. Never show full OTA feed URLs (host only). Never commit real homestay data or `.env`.
- `// ponytail:` marks deliberate shortcuts; cite the hueni-api / hueni-zalo issue number in comments that depend on API work.

## Workflow

- One issue → one branch → PR into `main` (`Closes #N`). Never push to `main`.
- Commits: imperative subject in English, body explains why.
- UI work: use the `impeccable` / `frontend-design` skills; critiques live in `.impeccable/critique/`.
