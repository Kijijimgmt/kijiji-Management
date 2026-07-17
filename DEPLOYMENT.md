# Deployment Guide

Use this guide to keep launch steps separate from design and database work.

The recommended hosting path is now:

```text
GoDaddy domain/DNS -> Vercel hosting
```

Use `VERCEL_DEPLOYMENT.md` for the exact Vercel steps.

## 1. Before Uploading

- Review the page locally in a browser.
- Confirm `index.html`, `styles.css`, `script.js`, and `assets/` are all present.
- Confirm the form looks right on desktop and mobile.
- Confirm Supabase credentials are either connected or intentionally blank.

## 2. Hosting Structure

Recommended Vercel project root:

```text
kijiji-management-group/
  index.html
  styles.css
  script.js
  assets/
  vercel.json
  SUPABASE_SETUP.md
  supabase-schema.sql
```

Do not deploy the parent `New project` folder.

## 3. Domain Setup

In Vercel:

1. Add `kijijimgmt.com`.
2. Add `www.kijijimgmt.com`.
3. Copy the DNS records Vercel provides.

In GoDaddy:

1. Open DNS for `kijijimgmt.com`.
2. Replace the current website-builder `A` record for `@` with Vercel's record.
3. Add/update the `www` CNAME record with Vercel's record.
4. Keep Outlook email records untouched.

## 4. Form Setup

The intake form is Supabase-ready.

Before launch, decide whether submissions should be live:

- If yes, complete `SUPABASE_SETUP.md`.
- If no, leave the credentials blank and do not promote the page publicly yet.

## 5. Post-Launch QA

Run this checklist after publishing:

- Home page loads on desktop and mobile.
- Navigation links scroll to the right sections.
- Strategy Session form validates required fields.
- Test submission appears in Supabase.
- UTM fields are captured when visiting with a URL like:

```text
https://yourdomain.com/?utm_source=instagram&utm_medium=bio&utm_campaign=launch
```

- Microsoft Outlook mailboxes still receive email.
- Resend DNS records do not disrupt Microsoft 365 MX records.

## 6. Rollback

Keep a dated copy of the last working website folder before each major update:

```text
kijiji-management-group-backup-YYYY-MM-DD/
```

If something breaks, redeploy the previous working Vercel deployment.
