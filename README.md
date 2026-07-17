# Kijiji Management Group Website

Premium static landing page for Kijiji Management Group.

## What This Project Contains

- Static website: `index.html`, `styles.css`, `script.js`
- Brand and page assets: `assets/`
- Supabase lead capture prep: `supabase-schema.sql`, `SUPABASE_SETUP.md`
- Project operations docs: `DEPLOYMENT.md`, `EMAIL_SETUP.md`, `PROJECT_CHECKLIST.md`, `CHANGELOG.md`

## Current Status

- Website design is built locally.
- Strategy Session intake form is on the page.
- Supabase submission code is prepared, but credentials are not connected yet.
- GoDaddy domain/hosting will be used for launch.
- Microsoft Outlook is used for business email inboxes.

## Recommended Ownership Map

| Area | Tool | Purpose |
| --- | --- | --- |
| Domain | GoDaddy | Domain registration and DNS |
| Hosting | Vercel | Public website hosting |
| Business inboxes | Microsoft Outlook / Microsoft 365 | Human email accounts |
| Lead database | Supabase | Strategy Session submissions |
| Automated emails | Resend | Form confirmations and internal notifications |

## Local Files To Deploy

Deploy this folder as the Vercel project root:

```text
kijiji-management-group/
```

Do not deploy the parent `New project` folder. It contains unrelated projects.

## Important Security Notes

- Do not place Supabase `service_role` keys in frontend code.
- Do not place Resend API keys in frontend code.
- Browser code should only use the Supabase public anon/publishable key.
- Automated emails should be sent from a server-side endpoint, such as a Supabase Edge Function, not directly from `script.js`.

## Key Docs

- Launch steps: `DEPLOYMENT.md`
- Vercel deployment: `VERCEL_DEPLOYMENT.md`
- Email plan: `EMAIL_SETUP.md`
- Supabase setup: `SUPABASE_SETUP.md`
- Project checklist: `PROJECT_CHECKLIST.md`
- Change history: `CHANGELOG.md`
