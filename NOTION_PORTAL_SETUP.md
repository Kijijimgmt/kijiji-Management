# Kijiji Team Portal Notion Setup

The team portal at `client-portal.html` uses the shared Notion database named **Kijiji Client Roster** as its source of truth.

## Required Vercel Environment Variables

Add these in Vercel > Project > Settings > Environment Variables:

```text
NOTION_TOKEN=secret_your_notion_integration_token
NOTION_CLIENT_ROSTER_DATABASE_ID=8579c368e9ae495e82af886ba21db26a
PORTAL_ACCESS_CODE=choose-a-private-team-code
```

`NOTION_CLIENT_ROSTER_DATABASE_ID` is optional while the current roster database stays the same, because the API has the current ID as a fallback. Set it anyway so future migrations are easier.

## Required Notion Step

In Notion, open **Kijiji Client Roster**, click **Share**, and invite/connect the Notion integration tied to `NOTION_TOKEN`.

Without that share step, the portal API will not be allowed to read or update the roster.

## Team Access Code

The portal API requires `PORTAL_ACCESS_CODE`. Share that private code only with Kijiji team members who should be able to view and manage client records.

When someone opens the portal, the browser asks for the code once and keeps it for that browser session.

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

- Client
- Type
- Status
- Contact Email
- Contact Phone
- Lead Source
- Last Touch
- Current Offer
- Next Move
- Progress
- Primary Owner
- Notes

## Organization Guidance

Keep the roster operational and lightweight. Track client name/type, assigned owner, lifecycle stage, next move/date, key contacts, offer or scope, project progress, approvals, and high-level notes.

Do not store passwords, bank or payment-card data, government IDs, private health/legal information, or unnecessarily sensitive personal details.

## Source Of Truth

Notion remains the source of truth. The browser does not save client records to local storage.
