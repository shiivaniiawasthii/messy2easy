# Gym Manager by Messy2Easy

Gym membership management web app by Messy2Easy Solutions for small gyms (built for Kanpur gym owners, used mostly on mobile browsers). React 19 + Vite 8 + TypeScript. Backend: Supabase (Postgres, Auth, Row Level Security, one Edge Function).

## Run

```bash
pnpm install
pnpm dev               # http://localhost:8443 (also on the LAN for phone testing)
pnpm exec tsc --noEmit # type-check (vite build does not type-check)
pnpm build             # production build into dist/
pnpm test              # unit tests (node --test, src/**/*.test.ts)
```

Needs Node 20.19+ (Node 22/24 recommended).

## Structure

```
src/
  main.tsx              entry; mounts <App/>
  App.tsx               app state, screen switching, store provider, global modals
  navigation.ts         Screen type, menu items, back-button labels
  index.css             all styles (plain CSS classes; Tailwind is imported only for its base reset)
  store/store.ts        StoreContext + useStore(), localStorage load/save
  data/types.ts         data types (Member, Payment, ...)
  data/appData.ts       read a gym's rows + turn them into AppData (shared with the server)
  data/db.ts            load (via appData.ts) + save gym data in Supabase
  auth/                 login, set-password screen, AuthGate
  admin/                Messy2Easy platform admin (gyms + owners)
  lib/                  pure helpers: format.ts (dates, money, phone), members.ts (status, dues,
                        rankings, "needs attention" lists), periods.ts (date ranges, chart buckets, financial year), download.ts (CSV),
                        summary.ts + summaryText.ts (owner daily summary), notifications.ts (calls the function),
                        registration.ts (public registration form: link, load, submit, error messages)
  components/           reusable UI: Icon, Button/Badge/Avatar, Modal, SearchBox, Pagination, charts...
  layout/               Sidebar (desktop), Topbar, MobileNav (phone bottom bar + "More" sheet)
  pages/                one file per screen: Dashboard, Members, MemberProfile, MemberForm, Attendance,
                        Payments, MemberPayments, Earnings, Renewals, Plans, Settings, Login,
                        Register (public form, no login)
  modals/               RecordPaymentModal, RenewModal (opened from several pages)
```

## State and data

- Login: `auth/AuthGate.tsx` decides what to show (login, set password, platform admin page, or the app). Owners/staff log in with their mobile number (mapped to `<phone>@login.messy2easy.in`); the platform admin can use an email.
- Data lives in Supabase (Postgres + Row Level Security). `data/db.ts` loads the gym's data into one `AppData` object (`data/types.ts`) and has the write functions (`db.addMember`, `db.recordPayment`, `db.renew`, `db.checkIn`, ...).
- `App.tsx` holds `AppData` in state and shares it through React Context (`useStore()` gives `data`, `today`, `account`, `reload()` and navigation helpers). After a write, call `reload()`. Data also reloads when the app comes back to the screen.
- Check-ins older than `ATTENDANCE_DAYS_LOADED` (120 days) are not loaded yet.
- Derived values (status, balance, totals, charts) are computed on render; the database view `member_overview` computes balance/status/expiry server-side.
- Accounts (create gym + owner, invite staff, reset password, remove) go through the `accounts` Edge Function (`supabase/functions/accounts`), which uses the service-role key on the server only.
- Self-service registration: the owner turns on a secret link per gym (`gyms.registration_token`, Dashboard → "Member registration form"). `/?join=<token>` opens `pages/Register.tsx` instead of `AuthGate` (a query parameter, so no host rewrites are needed). The visitor has no table access: the page reads the gym with the `registration_form` database function and submits through the `register` Edge Function (validates with `src/lib/intake.ts`, checks and stores the required Aadhaar copy in the private `member-documents` bucket, then calls `register_member`, which only the service role may run: gym from the token, duplicates by gym + phone refused, max 30 per gym per hour). Answers are in `members.intake` (jsonb); only owners can read Aadhaar files. A registered person is a member with `source = 'form'` and no membership, so status `"Pending"` (`member.pending`); "Activate" opens `RenewModal`, which creates the first membership via `renew_membership`. Use `firstMembershipIds()` (not "start date = joining date") to tell joining from renewals.
- Owner bell: Activity (from the `activity_log` table, filled by triggers; owners only), Needs attention, Report (`src/lib/report.ts` → Excel via SheetJS, loaded on demand, or WhatsApp share text).
- Owner daily summary (optional, hidden until a channel is configured): `notifications` Edge Function + Supabase cron every 15 min (see README "Owner notifications"). It imports `src/data/appData.ts`, `src/lib/summary.ts` and their imports directly, so those files use explicit `.ts` import extensions and no browser-only APIs.

## Supabase

```bash
npx supabase db push                               # apply new files in supabase/migrations
npx supabase functions deploy accounts --use-api   # deploy an Edge Function (also: notifications --no-verify-jwt)
```

Env: `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). Never put the service-role key or DB password in a `VITE_` variable.

## Conventions

- Named exports (`export function Members`), except `App` which is the default export.
- Money is whole rupees (integers). Dates are local `YYYY-MM-DD`; timestamps local `YYYY-MM-DDTHH:MM:SS` (IST).
- Phones are stored as 10 digits; show them with `formatPhone`.
- Keep the existing CSS classes and look; phone styles live in `@media (max-width: 760px)` blocks. The block at the end of `index.css` marked "Phone readability (generated)" raises small font sizes on phones.
- Use double quotes for strings containing apostrophes.
