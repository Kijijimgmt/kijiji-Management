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

## Source Of Truth

Notion remains the source of truth. The browser does not save client records to local storage.
