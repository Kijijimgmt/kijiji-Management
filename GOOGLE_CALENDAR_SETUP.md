# Google Calendar connection — setup and acceptance test

**Status (November 5, 2026): setup controls deployed (commit da1d9f6); no Google account authorized and no real shared-calendar test completed.** Outlook remains the business email system. Google is used only to read calendars shared with `kijijimgmt@gmail.com`.

## What was inspected and implemented

The portal is static HTML/CSS/plain JavaScript on Vercel, with CommonJS server functions. Supabase validates approved team logins. Notion stores clients, internal tasks and internal events; Supabase already stores private shared strategies. Existing server-side client authorization is reused for imported events.

The integration uses the existing `api/notion-clients` function with `view=google-calendar`, avoiding an additional deployed function. The Google OAuth library is pinned in `package-lock.json`. Calendar scopes are read-only. Max authorizes one integration Google account; clients do not authorize the dashboard individually. OAuth state is one-use, browser-bound, expires in ten minutes, and uses PKCE. The account identity is verified against the configured Gmail. Refresh tokens are encrypted with AES-256-GCM in a private server-only table; access tokens remain server-side and are obtained on demand.

The private migration `supabase/migrations/20261105153856_google_calendar_readonly.sql` has been applied to project `vaqgriohhcccvvxgkhgh`. Database checks confirmed RLS on all three tables, no browser table privileges, and no browser RPC privileges. No Google credentials were stored. The database advisor's “RLS enabled, no policy” INFO is intentional: these are server-only tables with no browser policy/grants.

## 1. Share and accept a work calendar

On a computer, the client opens Google Calendar → their work calendar → Settings and sharing → Share with specific people/groups (wording may be “Shared with”). Add **kijijimgmt@gmail.com**, select **See all event details / See event details**, and send the invitation. Do not enable public access. Use a dedicated work calendar rather than a personal calendar if the client wants to keep personal events out of the dashboard.

Sign in to **kijijimgmt@gmail.com** and click the invitation link to add/accept the calendar. Confirm it appears in that account's Google Calendar and an ordinary test event's title and time are visible. Organization sharing policies may restrict external detail access. Busy-only calendars cannot be mapped by this integration. Private events, if returned, are displayed as private busy events without notes/location.

## 2. Create the Google Cloud OAuth client

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/) with the account that will own this integration's Cloud project. Create/select a project named `Kijiji Calendar Integration` (the name is your choice).
2. APIs & Services → Library → search **Google Calendar API** → Enable.
3. Google Auth platform → Branding → Get Started. App name: `Kijiji Management Calendar`. Use an email you monitor for support and developer contact. If asked, add authorized domain `kijijimgmt.com` and accurate homepage/privacy policy links. Do not invent a privacy-policy URL or mark this as a Google Workspace internal app: a consumer Gmail requires an External audience.
4. Audience → External. For the first test, leave publishing status **Testing** and add `kijijimgmt@gmail.com` as a test user.
5. Data Access → Add scopes:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email` (Google may display this as `email`)
   - `https://www.googleapis.com/auth/calendar.events.readonly`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   No calendar write, sharing, Gmail/mailbox, or full Drive scopes are needed.
6. Clients → Create client → **Web application**. Name: `Kijiji Dashboard Production`.
7. Under **Authorized redirect URIs**, add this exact URI, including the query string and order:

   `https://www.kijijimgmt.com/api/notion-clients?view=google-calendar&action=callback`

   No JavaScript origin is needed for this server authorization flow. Do not enter a `file://` URL, the Supabase Auth callback, or a changing Vercel preview URL.
8. Copy the OAuth **Client ID** and **Client secret** into Vercel's server environment variables below. Do not paste the secret into chat or a frontend file.

Google External/Testing refresh tokens with Calendar permissions normally expire after **seven days**. Use Testing for the pilot, then complete the applicable Google production/verification requirements before relying on unattended use. Publishing status and verification are different; do not assume publishing alone removes warnings or restrictions. Reauthorize after changing the app status/scopes as needed. Google can revoke offline access for other reasons too, so the reconnect path remains necessary.

## 3. Vercel environment variables

In Vercel → `kijiji-management` → Settings → Environment Variables, set **Production** values (and only configure Preview separately if intentionally testing a separate connection):

| Variable | Value |
|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | Google Web application Client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Its Client secret; server-only secret |
| `GOOGLE_CALENDAR_REDIRECT_URI` | `https://www.kijijimgmt.com/api/notion-clients?view=google-calendar&action=callback` |
| `GOOGLE_CALENDAR_ACCOUNT_EMAIL` | `kijijimgmt@gmail.com` |
| `GOOGLE_CALENDAR_ENCRYPTION_KEY` | A new random **64-character hexadecimal** key, generated below; server-only secret |
| `CRON_SECRET` | Keep the existing secret if already configured for health/reminders. If absent, generate one. Use the exact same value in Supabase Vault for the scheduler. |
| `SUPABASE_URL` | Existing value: `https://vaqgriohhcccvvxgkhgh.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only value; do not change it just for Calendar |

The existing Notion and Supabase publishable/auth settings remain required. Do not prefix secrets with `NEXT_PUBLIC_`, place them in HTML, or commit `.env` files. Generate the encryption key locally using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Generate a missing CRON_SECRET the same way, using a different value. Keep the encryption key in a secure password manager; changing it requires reconnecting Google because existing encrypted refresh credentials will no longer decrypt.

Redeploy production after saving environment variables. Configuration is not authorization: a saved Client ID alone does not connect Google.

## 4. Authorize and map in the dashboard

1. Sign in as Max through the normal secure Supabase team login.
2. Calendar → **Google calendar connections** → **Connect Google account**.
3. Select **kijijimgmt@gmail.com** and grant the two Calendar read permissions. Complete Google consent yourself. The dashboard will reject a different account.
4. After returning to Calendar, select **Find shared calendars**.
5. Select the accepted client work calendar, choose the exact client profile, and choose a distinct color → **Save mapping**. Matching is explicit; names are never guessed. One Google calendar can map to only one client. Mapping changes clear old cached events before importing for the new client.
6. Select **Sync Google now** and check each calendar's status and last successful sync. Calendar views provide client/source filters and a Google display time-zone selector. The client's **Events & tickets** tab shows the imported schedule separately from internal events and ticket records.

Partners can read events for clients already authorized by the existing dashboard rules and manually sync that scope. Only Max can connect, discover calendars, or change mappings. Imported events have read-only details, never internal edit controls.

## 5. Enable automatic polling

Vercel Hobby schedules only once daily, so a five-minute Vercel cron expression would fail deployment. Use the existing Supabase project's Cron module instead; it calls the same authenticated Vercel endpoint. No push channel, public calendar, or webhook is required.

1. In Supabase Integrations → Cron, enable `pg_cron` if not already enabled. Enable `pg_net` under Database → Extensions if needed.
2. In Supabase Vault, create a secret named **`kijiji_calendar_cron_secret`** with the existing Vercel **CRON_SECRET** as its value. Use the Vault UI so you do not put a secret literal into a saved SQL query.
3. After production is deployed and the real-calendar manual test passes, run `google-calendar-scheduler.sql` in this project's SQL Editor. It schedules every five minutes, reads the secret from Vault, and sends an authenticated HTTP POST. The SQL file contains no secret value.
4. Check Cron job runs and HTTP results. A successful `net.http_post` enqueue alone is not proof the sync endpoint succeeded; inspect `net._http_response` by request ID and confirm a 200 result and advancing calendar `last_success_at`. The UI marks old snapshots as delayed after 15 minutes.
5. Check again while all dashboard tabs are closed. Automatic sync must continue independently of a browser tab. The browser only refreshes the saved cache every minute; it is not the scheduler.

For larger rosters, the job processes the oldest attempted calendars first within a bounded time budget. Unprocessed calendars are picked up by later polls. Ordinary few-calendar accounts target five-minute freshness; heavy calendars/large rosters can take additional polls. Each calendar is limited to 3,000 expanded events in a rolling window of **90 days past to 366 days future**. If that limit is exceeded, the old snapshot remains and an error requests a smaller work calendar or a follow-up scaling change. The dashboard does not provide unlimited historical imports.

## Sync correctness and recovery

- Fetches **all pages** of `events.list` for each calendar with `singleEvents=true`; Google expands recurring events and applies exceptions. Storage uses the Google calendar ID for mappings and Google event ID for each instance. Recurring instance IDs/original start data are preserved.
- Each successful snapshot atomically replaces that calendar's previous snapshot. Events deleted, canceled, moved outside the window, or removed by series changes therefore disappear. Retries deduplicate by event ID. A failed/partial fetch never publishes a partial snapshot.
- Full reconciliation is intentional for this roster: no `syncToken` is persisted, so there is no invalid-sync-token state to recover. If Google expires a pagination token (410), that calendar retries the full fetch. If incremental sync is added later it must implement Google's 410 full-reset protocol and exact parameter constraints.
- All-day events retain date-only values with Google's exclusive end date. Timed events preserve offsets and original zone and are shown in the selected display zone, including daylight-saving transitions and multi-day spans.
- Every Google Calendar resource call is GET. OAuth token exchange/refresh is server-side. No event create/update/delete call is implemented.
- Expired/revoked refresh authorization shows a reconnect message and stops exposing cached events until Max reconnects. Removed calendar sharing hides that calendar's cached events once detected, preserving the mapping so sharing can be repaired. Temporary/network/rate-limit failures keep the last successful snapshot with a delayed status.
- Calendar and OAuth data use private tables with RLS and explicit revoke/grants. Client scope is checked on every dashboard API read; frontend filters are not the security boundary. Disconnecting a mapping clears its cached events without changing Google Calendar.

## Acceptance test — must be completed with a real shared calendar

**Not completed.** No Google OAuth configuration/consent or accepted shared calendar has been confirmed. Mock tests cannot substitute for this.

Use a dedicated test work calendar with the client calendar owner's permission:

1. Accept sharing to the integration Gmail and map to the correct client.
2. Have the calendar owner create `Kijiji sync test` with a known time and zone. Sync and verify exactly one imported event, the correct client, time and color, and no edit control.
3. Have the owner reschedule the same event. Sync; verify the original slot is empty and there is still exactly one event in its new slot.
4. Have the owner delete that event. Sync; verify it is absent from grid, agenda and client profile.
5. Create a recurring series; move one occurrence and cancel another. Verify the moved instance appears once and the canceled instance is absent.
6. Test a multi-day all-day event and events around a daylight-saving transition. Verify exclusive end dates and both selected display zones.
7. Check as Joe/Erik and a team account without that client's access. The authorized partner sees it; the unauthorized account cannot retrieve it by calling the API directly either.
8. Revoke the share, sync, and confirm imported details disappear with a useful repair message. Re-share/accept and verify recovery. Revoke app authorization and test Max's reconnect flow.
9. Verify the five-minute scheduler updates data with all dashboard tabs closed. Record actual create/move/delete timestamps, event IDs and corresponding successful sync times before marking the integration operational.

## Deployment verification

The production deployment completed successfully. The deployed portal includes the new Calendar controls. Unauthenticated calendar reads and scheduler calls both return HTTP 401. The scheduler has not been enabled. This verifies protected deployment, not real Google synchronization.

## Automated verification

- `node --test tests/google-calendar.test.js tests/artist-workspace.test.js tests/client-strategy.test.js tests/strategy-evidence.test.js`
- `PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/google-calendar.database.cjs`
- `PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_EXECUTABLE=/path/to/browser node tests/google-calendar.browser.cjs`

## Official references checked November 5, 2026

- [Google sharing and invitation acceptance](https://support.google.com/calendar/answer/37082)
- [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Google server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Refresh token expiry / seven-day Testing limit](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Event listing, pagination, zones and sync-token constraints](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
- [Recurring events and exceptions](https://developers.google.com/workspace/calendar/api/guides/recurringevents)
- [Vercel Hobby cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Supabase Cron and Vault scheduling pattern](https://supabase.com/docs/guides/functions/schedule-functions)
