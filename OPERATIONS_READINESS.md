# Kijiji Portal Operations Readiness

This portal keeps the current passcode access model. Do not add email-based identity enforcement here until Kijiji chooses a real auth provider.

## Activity History

The API can write a safe activity trail for portal, Slack slash-command, and website lead writes.

Create a Notion data source named **Kijiji Activity Log** and share it with the same Notion integration used by the portal. Recommended properties:

```text
Activity        title
Time            date
Actor           rich text
Source          select: portal, slack, website, health, system
Action          select: created, updated, checked
Resource        select: client, action, opportunity, event, lead, system
Resource ID     rich text
Resource URL    url
Summary         rich text
Status          select: Success, Skipped, Failed
```

Then add this Vercel Production environment variable:

```text
NOTION_ACTIVITY_LOG_DATA_SOURCE_ID=your_activity_log_collection_id
```

The activity logger intentionally avoids secrets and excessive personal data. If the Activity Log is missing or unavailable, writes still complete and the API logs a server-side warning.

## Health And Monitoring

Basic endpoint:

```text
https://www.kijijimgmt.com/api/health
```

Deep endpoint:

```text
https://www.kijijimgmt.com/api/health?deep=1
```

The basic check returns only safe configuration booleans. The deep check verifies the Notion integration can access the core data sources and requires one of these Vercel environment variables:

```text
CRON_SECRET=generate-a-long-random-secret
```

or

```text
HEALTH_CHECK_TOKEN=generate-a-long-random-secret
```

`vercel.json` includes a daily Vercel Cron check at 13:00 UTC. Vercel Cron will authenticate the request with `CRON_SECRET` when it is configured. Until then, the cron route returns a setup-required response instead of exposing deep status publicly.

## Backups

Use Notion as the system of record and keep a practical weekly export routine:

1. Every Friday, export the four operating data sources from Notion as CSV:
   - Client Roster
   - Actions
   - Opportunities & Deals
   - Events & Releases
2. Store the export in the Kijiji Microsoft OneDrive or SharePoint business folder:

```text
Kijiji Management / Operations / Backups / YYYY-MM-DD /
```

3. Keep at least 12 weekly exports.
4. Do not store passwords, bank/payment-card data, government IDs, private health/legal information, or unnecessarily sensitive personal details in the portal or backups.

Automated backups can be added later after Kijiji chooses a durable storage target and provides server-side storage credentials. Do not put storage keys in browser code.

## Safe Staging Workflow

Production should write only to the real Kijiji Notion operating system.

Preview/staging should use one of these safe modes:

- Default safe mode: leave `ALLOW_PREVIEW_NOTION_WRITES` unset. Vercel Preview deployments can read only after unlock, but all Notion writes are blocked.
- Full staging mode: duplicate the four Notion data sources, share them with the integration, set Preview environment variables to the staging IDs, then set:

```text
ALLOW_PREVIEW_NOTION_WRITES=true
```

Emergency freeze for any environment:

```text
DISABLE_NOTION_WRITES=true
```

That blocks portal, Slack slash-command, and website lead writes while preserving read-only diagnostics.
