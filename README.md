# JVO Events Website

Marketing + booking site for **JVO Events** — an event space in Jonesboro, Arkansas.

- **Stack:** Vite + React + TypeScript + Tailwind, with a small Express server.
- **Booking:** the Book Now form posts to `/api/book`, which forwards to **Deskworks Satellite** (the API key stays server-side).
- **Hosting:** Render (one Web Service serves the built site *and* the API).

## Pages

`/` Home · `/gallery` Gallery · `/about` About & Services · `/contact` Contact · `/book` Book Now

## Local development

```bash
npm install
cp .env.example .env      # fill in Deskworks vars when you have them (optional for UI work)
npm run dev               # Vite on :5173, Express API on :8787 (Vite proxies /api → :8787)
```

Open http://localhost:5173. Booking submissions hit the local Express server; without
Deskworks credentials the booking endpoint returns a **stub success** so the full flow is
testable.

## Production build (mirrors Render)

```bash
npm run build             # outputs dist/
npm start                 # Express serves dist/ + /api on one port (PORT, default 8787)
```

## Deploying to Render

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → select the repo (uses `render.yaml`).
3. After it creates the service, set **Environment** variables:
   - `DESKWORKS_API_KEY` — your Deskworks key
   - `DESKWORKS_BASE_URL` — e.g. `https://your-space.deskworks.com/api`
4. Deploy. Render runs `npm install && npm run build`, then `node server.js`.

## Wiring the real Deskworks booking

Everything Deskworks lives in **`server/deskworks.js`** → `createDeskworksReservation()`.
It currently returns a stub. To go live, fill in the `fetch(...)` block marked `TODO`
with the real create-reservation endpoint, auth header, and field names from your
Deskworks API docs. No other file needs to change.

## Google Calendar availability (block booked dates)

The Book Now date picker greys out dates already taken on the JVO Google
Calendar. It reads the calendar **server-side** via a Google **service account**
— never an account password.

One-time setup (~5 min, all in `server/googleCalendar.js`'s header too):
1. [console.cloud.google.com](https://console.cloud.google.com) → new/!existing project → enable **Google Calendar API**.
2. Credentials → **Create Service Account** → make a **JSON key**, download it.
3. In Google Calendar (as `jonesborovirtualoffice`), the booking calendar →
   Settings → **Share with specific people** → add the service account's email
   with **"See all event details"**.
4. Set Render env vars:
   - `GOOGLE_CALENDAR_ID` — Calendar Settings → "Integrate calendar" → Calendar ID
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — the entire JSON key on one line

Until set, every date shows available (the endpoint returns an empty booked
list). Endpoints: `GET /api/availability` (booked dates) and `/api/book`
rejects a date that's already taken.

## Adding your images

Drop photos into `public/manus-storage/` (see the README there). The hero uses
`DSC00352-HDR_0739586b.jpg`; the gallery references `gallery-02.jpg … gallery-08.jpg`
(adjust paths in `src/pages/Gallery.tsx`).
