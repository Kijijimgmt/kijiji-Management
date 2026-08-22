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
PORTAL_ACCESS_CODE=choose-a-private-team-code
```

The data source IDs are optional while the current Notion operating system stays the same, because the API has the current IDs as fallbacks. Set them anyway so future migrations are easier.

## Required Notion Step

In Notion, open each shared data source, click **Share**, and invite/connect the Notion integration tied to `NOTION_TOKEN`.

Required shared data sources:

- Client Roster: `collection://03c5f70c-fb49-4d09-9de8-7fb8a45a04c7`
- Actions: `collection://662c1c0d-d255-4fe9-8260-5dc4f293b051`
- Opportunities & Deals: `collection://8548a9d4-1ffe-4787-90fc-3eb0a0085531`
- Events & Releases: `collection://4bf7373c-c744-4fe3-854e-ff0470954497`

Without that share step, the portal API will not be allowed to read or update the dashboard data. If the live portal unlocks but says Notion setup is needed, this share step is the first thing to check.

## Team Access Code

The portal API requires `PORTAL_ACCESS_CODE`. Share that private code only with Kijiji team members who should be able to view and manage client records.

When someone opens the portal, the browser shows an unlock form and keeps the passcode only in that browser session.

The portal includes a **Log Out** button. It clears the browser's saved access-code session and removes loaded roster data from the page.

## Email-Based Team Restriction

The approved team emails are:

- max@kijijimgmt.com
- erik@kijijimgmt.com
- joe@kijijimgmt.com

Do not enforce this with a browser email field or a client-side allowlist. Email restriction must be handled by a real identity provider that proves the signed-in user's email to the server before the Notion API is called.

Good options:

- Supabase Auth with Microsoft/Azure or email magic-link login
- Clerk, Auth0, or another hosted identity provider
- Vercel-level authentication/protection if it can pass a trusted verified email claim to the app

After the provider is chosen, enforce the allowlist in `api/notion-clients.js` using the provider's verified server-side session/JWT email claim, then keep `PORTAL_ACCESS_CODE` only as a secondary layer or remove it.

## What The Portal Can Manage

- Clients: name/type, status, focus level, owner, contact, lead source, scope, next move, progress, last touch, and internal notes.
- Actions: action, status, owner, priority, due date, related client, blocker, and notes.
- Opportunities & Deals: read-only pipeline visibility by stage.
- Events & Releases: read-only upcoming calendar visibility.

## Organization Guidance

Keep the roster operational and lightweight. Track client name/type, assigned owner, lifecycle stage, next move/date, key contacts, offer or scope, project progress, approvals, and high-level notes.

Do not store passwords, bank or payment-card data, government IDs, private health/legal information, or unnecessarily sensitive personal details.

## Source Of Truth

Notion remains the source of truth. The browser does not save client records to local storage.
