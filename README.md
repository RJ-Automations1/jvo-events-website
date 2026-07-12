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

## CBE Vendor Onboarding & Payment Tracking Platform

A self-contained internal platform for the **Center for Black Entrepreneurship**
lives alongside the events site. It's a Phase I framework for tracking every
vendor from onboarding through final payment.

- **UI:** `/cbe` (login at `/cbe/login`) — a light admin theme, distinct from the
  dark marketing site.
- **API:** `/api/cbe/*` (Express router in `server/cbe/`).
- **Storage:** a JSON file (`server/cbe/data/`) + uploaded documents
  (`server/cbe/uploads/`), both gitignored. Persistence is isolated in
  `server/cbe/store.js` so it can be swapped for a database later.

### What it does (Phase I)

- **Public self-service portal** (`/cbe`) — the front door. Vendors and students
  apply themselves (no login) via their own forms; every submission flows to the
  staff master dashboard. Toggle with `CBE_PUBLIC_INTAKE`.
- **Master Dashboard** — vendor + student counts, dollars requested/paid/outstanding,
  onboarding progress, and a searchable/filterable table (filter by program or by
  applicant type).
- **FedEx-style progress tracker** — a per-applicant stepper showing what's done
  (with dates), the current stage, and what's left, on the detail page.
- **Program-specific views** — filter the dashboard by program; a per-program
  roll-up table. Programs: LIFT ATL, LIFT National, Scholars, Research Fellows,
  Sparkhouse, Spelpreneur, I-Corps, General CBE.
- **Role-based access** — `leadership` sees all programs; `pm` sees only assigned
  programs. Enforced server-side on every read and write.
- **New-vendor onboarding** — permanent profile + demographics + document uploads
  (W-9, ACH, application…) with an 8-step onboarding checklist.
- **Returning-vendor payment requests** — search an existing vendor and log a new
  engagement without re-onboarding; the profile is preserved.
- **Engagement / payment tracking** — an 18-step workflow checklist per
  engagement (invitation letter → ICA → SSJD → invoice → requisition → payment
  complete), finance reference numbers (Req/PO/SQ/BO), and amounts.
- **Cognito Forms webhook** — `POST /api/cbe/cognito-hook` auto-creates a vendor
  or a returning-vendor payment request from a form submission.

### Setup

Configure staff logins and (optionally) the webhook secret in the environment —
see the **CBE** block in `.env.example`. Minimum to go live:

```bash
CBE_USERS=[{"email":"tiera@cbecenter.org","name":"Tiera Holmes","role":"leadership","password":"a-strong-password"}]
CBE_COGNITO_SECRET=some-long-random-string   # if using the Cognito webhook
```

With nothing set, a built-in leadership login is used
(`tieraholmes@spelman.edu` / `cbe2026`) so the platform is usable immediately.
Change the password with `CBE_DEV_PASSWORD`, or define the full staff roster with
`CBE_USERS`, before this holds real data.

**Render free plan caveat:** the free tier has an *ephemeral* filesystem (no
persistent disk) and sleeps after ~15 min idle, so the CBE data store + uploads
**reset on every redeploy and cold start**. That's fine for a first-draft/demo.
Before it holds real vendor records, move to a paid plan with a mounted disk and
point `CBE_DATA_FILE` / `CBE_UPLOAD_DIR` at it.

## Adding your images

Drop photos into `public/manus-storage/` (see the README there). The hero uses
`DSC00352-HDR_0739586b.jpg`; the gallery references `gallery-02.jpg … gallery-08.jpg`
(adjust paths in `src/pages/Gallery.tsx`).
