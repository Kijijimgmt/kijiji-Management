# Kijiji Team Portal Notion Setup

The team portal at `client-portal.html` uses the shared Notion **Kijiji Management operating system** as its source of truth.

## Required Vercel Environment Variables

Add these in Vercel > Project > Settings > Environment Variables:

```text
NOTION_TOKEN=secret_your_notion_integration_token
NOTION_CLIENT_ROSTER_DATA_SOURCE_ID=03c5f70c-fb49-4d09-9de8-7fb8a45a04c7
NOTION_ACTIONS_DATA_SOURCE_ID=662c1c0d-d255-4fe9-8260-5dc4f293b051
NOTION_OPPORTUNITIES_DATA_SOURCE_ID=8548a9d4-1ffe-4787-90fc-3eb0a0085531
NOTION_EVENTS_DATA_SOURCE_ID=4bf7373c-c744-4fe3-854e-ff0470954497
SUPABASE_URL=https://your-active-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
ALLOW_PORTAL_CODE_FALLBACK=false
PORTAL_ACCESS_CODE=optional-private-team-code-only-if-fallback-is-enabled
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/kijiji/ops-webhook
SLACK_SIGNING_SECRET=your-slack-app-signing-secret
SLACK_ALLOWED_TEAM_IDS=T1234567890
SLACK_ALLOWED_CHANNEL_IDS=C1234567890
SLACK_ALLOWED_USER_IDS=U1234567890,U2345678901
NOTION_ACTIVITY_LOG_DATA_SOURCE_ID=optional_activity_log_collection_id
CRON_SECRET=generate-a-long-random-secret
HEALTH_CHECK_TOKEN=optional-health-token-if-not-using-cron-secret
DISABLE_NOTION_WRITES=false
ALLOW_PREVIEW_NOTION_WRITES=false
```

The data source IDs are optional while the current Notion operating system stays the same, because the API has the current IDs as fallbacks. Set them anyway so future migrations are easier.

`SLACK_WEBHOOK_URL` is optional, but should be added in **Vercel Production** when the team wants internal alerts in Slack. Keep it server-side only. Do not add the webhook URL to browser JavaScript, HTML, or any public client-side config.

`SLACK_SIGNING_SECRET` is required for Slack slash commands. The allowlist values are optional but recommended:

- `SLACK_ALLOWED_TEAM_IDS`: restricts `/kijiji` to the approved Slack workspace.
- `SLACK_ALLOWED_CHANNEL_IDS`: restricts `/kijiji` to `#kijiji-ops`; use the channel ID, not the channel name.
- `SLACK_ALLOWED_USER_IDS`: restricts dashboard writes to approved Slack users.

`NOTION_ACTIVITY_LOG_DATA_SOURCE_ID` is optional but recommended for production operations. See `OPERATIONS_READINESS.md` for the Activity Log schema.

`CRON_SECRET` or `HEALTH_CHECK_TOKEN` is required for authenticated deep health checks at `/api/health?deep=1`. The basic `/api/health` endpoint is safe to call without a token.

Preview deployments block Notion writes by default unless `ALLOW_PREVIEW_NOTION_WRITES=true`. Only enable that after Preview environment variables point to duplicated staging Notion data sources.

## Required Notion Step

In Notion, open each shared data source, click **Share**, and invite/connect the Notion integration tied to `NOTION_TOKEN`.

Required shared data sources:

- Client Roster: `collection://03c5f70c-fb49-4d09-9de8-7fb8a45a04c7`
- Actions: `collection://662c1c0d-d255-4fe9-8260-5dc4f293b051`
- Opportunities & Deals: `collection://8548a9d4-1ffe-4787-90fc-3eb0a0085531`
- Events & Releases: `collection://4bf7373c-c744-4fe3-854e-ff0470954497`
- Optional Activity Log: the collection ID you create for `NOTION_ACTIVITY_LOG_DATA_SOURCE_ID`

Without that share step, the portal API will not be allowed to read or update the dashboard data. If the live portal unlocks but says Notion setup is needed, this share step is the first thing to check.

## Activity Log, Health Checks, And Staging

The portal now includes production-hardening support for:

- Activity history for portal saves, Slack slash-command writes, and website lead intake.
- `/api/health` basic status and authenticated `/api/health?deep=1` Notion access checks.
- Preview write protection to avoid accidental production Notion writes from staging deployments.

The full setup and backup workflow lives in `OPERATIONS_READINESS.md`.

## Supabase Auth Team Sign-In

The portal uses Supabase Auth magic links for individual team sign-in. The browser sends the Supabase session token to `/api/notion-clients`, and the server verifies the user with Supabase before reading or writing Notion.

Approved emails and roles are enforced server-side:

- `max@kijijimgmt.com`: admin/full command center
- `joe@kijijimgmt.com`: member, defaults to assigned My Work
- `erik@kijijimgmt.com`: member, defaults to assigned My Work

Joe and Erik receive only their assigned tasks, deals, events, and related clients from the API. Non-admin writes are limited to tasks, deals, and events already assigned to them, and new records are assigned to their verified owner automatically.

Supabase setup:

1. In Supabase Auth, enable the Email provider and magic-link/OTP sign-in.
2. Set Site URL to `https://www.kijijimgmt.com/client-portal`.
3. Add redirect URLs:
   - `https://www.kijijimgmt.com/client-portal`
   - `https://kijijimgmt.com/client-portal`
   - any Vercel preview URL used for testing
4. In Vercel Production, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from Supabase **Project Settings > API**.
5. Redeploy Production.

If the portal says Supabase Auth is unreachable, confirm the project is active in Supabase and that `SUPABASE_URL` resolves in the format `https://your-project-ref.supabase.co`.

The portal includes a **Log Out** button. It clears the browser's Supabase session and removes loaded roster data from the page.

`PORTAL_ACCESS_CODE` is no longer the primary access method. Keep `ALLOW_PORTAL_CODE_FALLBACK=false` in production. Only set `ALLOW_PORTAL_CODE_FALLBACK=true` temporarily during a migration window if the team intentionally wants the old shared passcode fallback.

## Slack Notifications

The portal API can send concise internal alerts to Slack channel `#kijiji-ops` after successful Notion saves for:

- Website leads: new strategy session requests from `kijijimgmt.com`.
- Tasks: create/update, including owner, priority, due date, client, next step, and blocker state.
- Opportunities & Deals: create/update, including stage, owner, priority, next action date, client, next step, and blocker state.
- Events & Releases: create/update, including type, status, owner, date, client, and notes.

To enable this:

1. In Slack, create an incoming webhook for `#kijiji-ops`.
2. In Vercel, open the Kijiji project > **Settings** > **Environment Variables**.
3. Add `SLACK_WEBHOOK_URL` for **Production** only.
4. Redeploy the latest production deployment.

If `SLACK_WEBHOOK_URL` is missing or Slack is unavailable, Notion saves still complete. Slack notification failures are logged server-side and are never sent to the browser.

## Website Strategy Session Intake

The public landing page form posts to `https://www.kijijimgmt.com/api/strategy-session-lead`.

That endpoint:

- Validates the required form fields server-side.
- Uses a honeypot field, minimum completion-time check, origin check, and a best-effort short rate limit.
- Creates a new lead/opportunity in **Opportunities & Deals**.
- Sends a `#kijiji-ops` Slack alert when `SLACK_WEBHOOK_URL` is configured.
- Sends Resend email notifications and the Supabase archive when those optional environment variables are configured.

The website form does not write directly to Notion, Slack, or Supabase from browser JavaScript. If the endpoint returns `notion_not_configured` or `notion_access_missing`, set `NOTION_TOKEN` in Vercel Production and share the Opportunities & Deals data source with that Notion integration.

## Slack Slash Command: Dashboard Updates

Use an authenticated Slack slash command for Slack-to-dashboard updates. Do not use passive channel-message ingestion for writes.

Slack app setup:

1. Create or open the Kijiji Slack app at api.slack.com.
2. Go to **Slash Commands** > **Create New Command**.
3. Command: `/kijiji`
4. Request URL: `https://www.kijijimgmt.com/api/slack-commands`
5. Short description: `Update the Kijiji team dashboard`
6. Usage hint: `task title="..." owner=Maxwell due=YYYY-MM-DD`
7. Go to **OAuth & Permissions** and make sure the app has the `commands` scope.
8. Install or reinstall the app into the Kijiji Slack workspace.
9. Copy the app **Signing Secret** from **Basic Information**.
10. In Vercel Production, set `SLACK_SIGNING_SECRET`.
11. Recommended: set `SLACK_ALLOWED_TEAM_IDS` and `SLACK_ALLOWED_CHANNEL_IDS` to the workspace and `#kijiji-ops` IDs.
12. Redeploy Production.

Supported commands:

```text
/kijiji help
/kijiji status
/kijiji task title="Send launch plan" owner=Maxwell due=2026-08-30 client="Broshigeez" priority=High blocker=yes notes="Waiting on assets"
/kijiji deal name="Brand partnership" stage=Pitching owner=Joe date=2026-09-04 client="Andra Pastry Chef" next="Send scope"
/kijiji event name="Single release" type=Release date=2026-09-12 owner=Erik client="Bobby Outside" notes="Assets due Friday"
```

The slash command only creates new tasks, deals, and events. Edit existing records inside the Kijiji portal. The API verifies Slack's request signature server-side using `SLACK_SIGNING_SECRET` before writing to Notion.

## What The Portal Can Manage

- Clients: name/type, status, focus level, owner, contact, lead source, scope, next move, progress, last touch, internal notes, and a shared roadmap.
- Actions: action, status, owner, priority, due date, related client, blocker, and notes.
- Opportunities & Deals: stage, owner, priority, next action date, related client, blocker, and next step.
- Events & Releases: type, status, owner, date, related client, and notes.

## Client Roadmaps

Each client profile includes an operational roadmap with four phases: **Align**, **Build**, **Activate**, and **Scale**. The roadmap uses the existing Notion data rather than creating a separate source that the team would need to maintain.

- The client's **Progress** value controls the active roadmap phase.
- The client's **Next Move** appears as the current focus.
- Client-linked tasks, opportunities, events, releases, and milestones appear together in date order on the timeline.
- **Add Task** creates a task with the client relationship already selected.
- **Add Milestone** creates a dated record in Events & Releases with the client relationship already selected.

Maxwell can edit client-level progress and next move. Joe and Erik can view roadmaps for the clients returned by their secure team access and update their assigned linked work.

## Organization Guidance

Keep the roster operational and lightweight. Track client name/type, assigned owner, lifecycle stage, next move/date, key contacts, offer or scope, project progress, approvals, and high-level notes.

Do not store passwords, bank or payment-card data, government IDs, private health/legal information, or unnecessarily sensitive personal details.

## Source Of Truth

Notion remains the source of truth. The browser does not save client records to local storage.
