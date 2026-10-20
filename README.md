# Gym Manager by Messy2Easy

Gym membership management web app by Messy2Easy Solutions (React + Vite + TypeScript, Supabase backend, hosted on Vercel).
Developer notes (structure, conventions, how to run) are in [AGENTS.md](AGENTS.md).

```bash
pnpm install
pnpm dev        # http://localhost:8443
pnpm test       # unit tests (daily summary)
pnpm build
```

## Reports and activity (free, no setup)

- **Bell → Activity (owner only):** every change by the owner or staff — members added/edited/deleted, payments
  recorded/edited/deleted, renewals, check-ins, plans, expenses, gym profile — with who did it and when.
  Database triggers fill `activity_log` (`supabase/migrations/20261016090000_activity_log.sql`), so nothing is missed
  whatever screen or API made the change. The red number counts new actions by other people (check-ins excluded).
  Entries older than 180 days are removed daily.
- **Bell → Report and Settings → Reports (owner only):** today / yesterday / this month / last month.
  **Download Excel** (sheets: Summary, Payments, Check-ins, Expenses, Members, Follow up) and
  **Share on WhatsApp** (opens the owner's own WhatsApp with the summary text; no API, no cost).
  Code: `src/lib/report.ts`, `src/components/ReportPanel.tsx`. The Excel library (SheetJS, from cdn.sheetjs.com)
  loads only when a report is downloaded.

## Member registration form (free, no setup)

- **Dashboard → Member registration form, or Members → Registration link (owner only):** create the gym's link, copy it, share it on WhatsApp or open
  the form. "Make a new link" stops the old one; "Turn off link" stops registrations.
- **Public form** (`/?join=<token>`, no login, works on phones): name and mobile required; email, date of birth, gender,
  address and emergency contact optional. The person gets a member ID (e.g. `M-0042`).
- The registration shows up in **Members** with status **Pending** (also in Dashboard → Focus here, the owner's bell and
  Attendance search). **Activate** = choose a plan and start date (end date is calculated) and record the payment.
- Owner/staff can still **Add member** themselves (now also with email, gender and address). A mobile number that is
  already in the gym is refused, in the app and again in the database (`create_member`), with the existing member's
  name; if that person registered through the form, the error offers **Open profile to activate** instead.
- Database: `supabase/migrations/20261020090000_member_registration.sql`. The public page can only call two functions;
  they take the gym from the link, validate everything, refuse a mobile number already in that gym, and accept at most
  30 registrations per gym per hour.

## Owner notifications (daily summary)

> Optional, paid channels. The settings stay hidden in the app until Email or WhatsApp keys are added.

Each gym owner can get a daily summary on WhatsApp and/or email at a time they choose
(Settings → Notifications). Staff never get it and can't see or change the settings.

### How it works

```
Supabase cron (every 15 min)
  └─ POST /functions/v1/notifications {"action":"run"}  + header x-cron-secret
       └─ for each gym with the summary on, whose send time has come (IST, up to 2 h late):
            build the summary  →  sendNotification(channel, to, payload)  →  notification_log
```

| Piece | Where |
|---|---|
| Summary numbers (same code as the Dashboard / Renewals page) | `src/lib/summary.ts`, `src/lib/members.ts` |
| Message wording (one place, ready for a Hindi version) | `src/lib/summaryText.ts` → `SUMMARY_STRINGS` |
| Reading a gym's data (same code as the app) | `src/data/appData.ts` |
| Edge Function (cron run, settings, test send) | `supabase/functions/notifications/index.ts` |
| Providers behind `sendNotification(channel, to, payload)` | `supabase/functions/_shared/notify.ts` |
| Tables `notification_settings`, `notification_log`, duplicate guard | `supabase/migrations/20261012120000_owner_notifications.sql` |
| Cron job | `supabase/migrations/20261012120100_notifications_cron.sql` |
| Settings screen | `src/pages/NotificationSettings.tsx` |

**Why Supabase cron and not Vercel Cron:** Vercel's free (Hobby) plan allows cron only once a day,
and a 15-minute schedule makes the deployment fail. Supabase cron is free, and the service-role key
never leaves Supabase. Vercel only hosts the website, so there are **no notification variables in Vercel**.

**No duplicates:** before sending, the function claims `(gym, IST date, channel)` in `notification_log`
(unique index). A second cron run the same day gets nothing to claim and skips. A failed send is retried by
later runs, at most 3 attempts a day. Test sends are logged separately (max 10 a day per gym).

**Security:** the tables have no access for app users at all. Everything goes through the Edge Function,
which returns 403 unless the caller is an active owner of a gym whose subscription is open.

### Environment variables (Supabase → Project Settings → Edge Functions → Secrets)

| Name | Required | What |
|---|---|---|
| `CRON_SECRET` | yes | Random secret. The same value must be in Vault as `notifications_cron_secret`. **Already set.** |
| `APP_URL` | yes | Link in the messages, e.g. `https://messy2easy.vercel.app`. **Already set.** |
| `RESEND_API_KEY` | for email | API key from resend.com |
| `NOTIFY_EMAIL_FROM` | for email | Sender, e.g. `Messy2Easy <summary@messy2easy.in>` (domain verified in Resend) |
| `WHATSAPP_TOKEN` | for WhatsApp | Permanent access token of a Meta system user |
| `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | Phone number ID from WhatsApp Manager (not the phone number) |
| `WHATSAPP_TEMPLATE_NAME` | for WhatsApp | Name of the approved template, e.g. `daily_gym_summary` |
| `WHATSAPP_TEMPLATE_LANG` | optional | Template language code, default `en` |
| `EMAIL_PROVIDER`, `WHATSAPP_PROVIDER` | optional | Provider to use, default `resend` / `meta` (for swapping providers later) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically.
Set secrets with the dashboard or `npx supabase secrets set NAME=value`. If a channel's keys are missing, the
settings screen shows "Not connected yet" and the log records "not set up yet".

Vault secrets used by the cron job (SQL editor; already created for this project):

```sql
select vault.create_secret('<same value as CRON_SECRET>', 'notifications_cron_secret');
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notifications', 'notifications_url');
```

### Email (Resend)

1. Create an account at resend.com → **Domains** → add your domain (e.g. `messy2easy.in`) and add the DNS records it shows.
   Without a verified domain Resend only delivers to your own address.
2. **API Keys** → create a key with "Sending access".
3. Set `RESEND_API_KEY` and `NOTIFY_EMAIL_FROM` (an address on the verified domain).

### WhatsApp Business Cloud API (Meta)

Business-initiated WhatsApp messages must use a template approved by Meta.

1. **Meta Business account:** business.facebook.com → create/verify the business (Messy2Easy Solutions).
   Business verification may ask for GST/registration documents.
2. **App:** developers.facebook.com → My Apps → Create app → type *Business* → add the **WhatsApp** product.
3. **Phone number:** WhatsApp Manager → Phone numbers → add a number that is **not** already used on the
   WhatsApp app (or use Meta's test number to start). Copy its **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
4. **Permanent token:** Business Settings → Users → System users → add a system user (Admin) → Add assets → your
   app and WhatsApp account (full control) → Generate token with `whatsapp_business_messaging` and
   `whatsapp_business_management` → `WHATSAPP_TOKEN`. (The 24-hour token on the app page is only for testing.)
5. **Template:** WhatsApp Manager → Message templates → Create:
   - Category: **Utility** · Name: `daily_gym_summary` · Language: **English** (`en`)
   - Body (8 variables, in this order; the app fills them):
     ```
     {{1}} — Daily summary, {{2}}
     💰 Collected today: {{3}}
     ✅ Check-ins today: {{4}}
     ⏰ Expiring in 3 days: {{5}}
     ❌ Expired, not renewed: {{6}}
     🧾 Pending dues: {{7}}
     😴 Stopped coming: {{8}}
     ```
   - Sample values for review: `Wolves Area gym`, `Mon 12 Oct`, `₹1,500 (3 payments, UPI ₹1,000 · Cash ₹500)`, `18`,
     `3 — Rahul Verma (today), Pooja Singh (15 Oct)`, `1 — Anjali Dubey`, `₹3,700 from 5 members`, `0`
   - Button (optional): *Visit website* → "Open Gym Manager" → `https://messy2easy.vercel.app`
   - Submit; approval usually takes minutes to a day. Then set `WHATSAPP_TEMPLATE_NAME=daily_gym_summary`.
6. Costs: Meta charges per utility conversation in India (check current rates in WhatsApp Manager → Pricing).

If WhatsApp isn't set up or a message fails, and the owner saved an email address, the summary is sent by email
instead and the log says "(instead of WhatsApp)".

### Testing

- `pnpm test` — summary builder: no members, all zero, dues, expired/expiring, chosen sections, IST near midnight
  (tests run in UTC like the server), email escaping, WhatsApp parameters, schedule window.
- Owner: Settings → Notifications → **Send test summary now** sends the real summary and shows the result per channel.
- Check the cron: `select * from cron.job_run_details order by start_time desc limit 5;` and the function's reply in
  `select status_code, content from net._http_response order by id desc limit 5;`
