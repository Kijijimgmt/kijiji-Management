# Google Calendar connection — setup and acceptance test

**Status (November 11, 2026): Medusa is mapped, and the stored connection has event-creation authorization. The last confirmed successful import was November 5. Scheduled polling is prepared but has not been enabled or verified; create/reschedule/delete acceptance tests remain outstanding.** Outlook remains the business email system. Shared client schedules use `kijijimgmt@gmail.com`.

## What was inspected and implemented

The portal is static HTML/CSS/plain JavaScript on Vercel, with CommonJS server functions. Supabase validates approved team logins. Notion stores clients, internal tasks and internal events; Supabase already stores private shared strategies. Existing server-side client authorization is reused for imported events.

The integration uses the existing `api/notion-clients` function with `view=google-calendar`, avoiding an additional deployed function. The Google OAuth library is pinned in `package-lock.json`. The default Calendar authorization is read-only; the optional creation upgrade explicitly requests event read/write access and requires opt-in on each calendar. Max authorizes one integration Google account; clients do not authorize the dashboard individually. OAuth state is one-use, browser-bound, expires in ten minutes, and uses PKCE. The account identity is verified against the configured Gmail. Refresh tokens are encrypted with AES-256-GCM in a private server-only table; access tokens remain server-side and are obtained on demand.

The private migration `supabase/migrations/20261105153856_google_calendar_readonly.sql` has been applied to project `vaqgriohhcccvvxgkhgh`. Database checks confirmed RLS on all three tables, no browser table privileges, and no browser RPC privileges. Google refresh credentials are encrypted server-side; they are never exposed through dashboard responses. The database advisor's “RLS enabled, no policy” INFO is intentional: these are server-only tables with no browser policy/grants.

## Optional event-creation upgrade (November 5, 2026)

The user requested adding Kijiji events directly to a client’s shared Google calendar, so client and management use one schedule. The Google account has now been authorized for viewing, but **Medusa’s calendar was not present in the discovered calendar list**. Her mapping and real-calendar acceptance tests remain pending.

To enable direct creation:

1. Have Medusa share her actual work calendar with `kijijimgmt@gmail.com` using **Make changes to events** (Google may label this “Make changes (see private events as free/busy)”). Accept the invitation in that Gmail account. Full sharing-management permission is unnecessary.
2. Google Cloud → Google Auth Platform → Data Access → Add or remove scopes. Add `https://www.googleapis.com/auth/calendar.events`. Keep the Calendar list read scope and identity scopes. This is the event read/write scope required for a shared calendar; an owned-calendars-only scope cannot write a calendar owned by the client.
3. After the new code is deployed, sign in to the dashboard as Max → Calendar → Google calendar connections → **Enable adding Google events**. Review Google’s new authorization as `kijijimgmt@gmail.com`. The client ID, secret, redirect URI, and encryption key remain the same.
4. Find shared calendars and map Medusa’s work calendar to the Medusa profile. For that mapping, select **Allow adding events for this client**. The server verifies live Google `writer`/`owner` access before enabling it, and checks it again on every creation.
5. Use **Add to client Google Calendar**, enter the title, dates, time zone, location and details, then review the exact client/calendar and select **Add event to Medusa’s Google Calendar**. This creates the event on that shared calendar, not a second Notion event. The form does not send guest invitations. Shared-calendar collaborators can see the event through their existing access.

Each mapping defaults to view-only, including existing mappings and any remapping. Authorized partners can create only on their scoped client calendars after Max enables that mapping. A stable request ID is converted into a Google event ID to prevent duplicate submissions and recover uncertain saves. The server constructs the event payload; caller-supplied attendees or alternate calendar IDs are ignored. All-day last dates are inclusive in the form and converted to Google’s exclusive end date. Missing/ambiguous daylight-saving times are rejected instead of silently shifted. Google success with a delayed dashboard cache is reported as created and can be refreshed with Sync Google now.

This upgrade adds event creation only. Existing Google events remain view-only in the dashboard; rescheduling/canceling them still happens in Google Calendar. No real event has been created or changed by this implementation yet. Run a permitted test on the correctly shared calendar before declaring direct creation operational. Automatic polling is still pending scheduler setup.

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
   These are the default viewing scopes. For the optional creation feature also add `https://www.googleapis.com/auth/calendar.events`, then explicitly approve the upgrade described above. No sharing-management, Gmail/mailbox, or full Drive scopes are needed.
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

1. Apply `supabase/migrations/20261111174748_calendar_scheduler_repair.sql` (already applied to the existing production Supabase project on November 11). It enables Cron/network extensions and creates server-only scheduler controls.
2. After deploying this cleanup, sign in as Max → Calendar → Calendar settings → **Enable automatic sync**. The server first checks a successful real sync, then securely copies the existing server `CRON_SECRET` into Vault and enables the five-minute job. No secret needs to be copied into chat or browser code.
3. If the manual sync fails, repair Google authorization/sharing first; the button will not enable a scheduler over an unsuccessful connection. The visible status distinguishes automatic sync from the last successful calendar import.
4. Check Cron job runs and HTTP results. A successful request enqueue alone is not proof the sync endpoint succeeded; confirm a 200 response and advancing calendar `last_success_at`.
5. Check again with all dashboard tabs closed. Browser cache refreshes are not the scheduler. Do not describe automatic sync as operational until this check passes.

For larger rosters, the job processes the oldest attempted calendars first within a bounded time budget. Unprocessed calendars are picked up by later polls. Ordinary few-calendar accounts target five-minute freshness; heavy calendars/large rosters can take additional polls. Each calendar is limited to 3,000 expanded events in a rolling window of **90 days past to 366 days future**. If that limit is exceeded, the old snapshot remains and an error requests a smaller work calendar or a follow-up scaling change. The dashboard does not provide unlimited historical imports.

## Sync correctness and recovery

- Fetches **all pages** of `events.list` for each calendar with `singleEvents=true`; Google expands recurring events and applies exceptions. Storage uses the Google calendar ID for mappings and Google event ID for each instance. Recurring instance IDs/original start data are preserved.
- Each successful snapshot atomically replaces that calendar's previous snapshot. Events deleted, canceled, moved outside the window, or removed by series changes therefore disappear. Retries deduplicate by event ID. A failed/partial fetch never publishes a partial snapshot.
- Full reconciliation is intentional for this roster: no `syncToken` is persisted, so there is no invalid-sync-token state to recover. If Google expires a pagination token (410), that calendar retries the full fetch. If incremental sync is added later it must implement Google's 410 full-reset protocol and exact parameter constraints.
- All-day events retain date-only values with Google's exclusive end date. Timed events preserve offsets and original zone and are shown in the selected display zone, including daylight-saving transitions and multi-day spans.
- Calendar synchronization uses GET calls. The optional, explicitly enabled event-creation action uses events.insert (POST) only after scope, client, mapping and live calendar edit-access checks. OAuth token exchange/refresh is server-side. No existing-event update or delete action is implemented.
- Expired/revoked refresh authorization shows a reconnect message and stops exposing cached events until Max reconnects. Removed calendar sharing hides that calendar's cached events once detected, preserving the mapping so sharing can be repaired. Temporary/network/rate-limit failures keep the last successful snapshot with a delayed status.
- Calendar and OAuth data use private tables with RLS and explicit revoke/grants. Client scope is checked on every dashboard API read; frontend filters are not the security boundary. Disconnecting a mapping clears its cached events without changing Google Calendar.

## Acceptance test — must be completed with a real shared calendar

**Not completed.** Authorization and a saved Medusa import are confirmed, but a current create/move/delete cycle and unattended polling are not. Mock tests cannot substitute for these checks.

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

- `node --test tests/google-calendar.test.js tests/google-calendar-create.test.js tests/artist-workspace.test.js tests/client-strategy.test.js tests/strategy-evidence.test.js`
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
