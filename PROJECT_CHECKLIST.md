# Project Checklist

Use this checklist to keep the Kijiji launch organized.

## Accounts

- [ ] GoDaddy login saved securely.
- [ ] Microsoft 365 / Outlook admin login saved securely.
- [ ] Supabase project created.
- [ ] Resend account created.
- [ ] Credentials stored in a password manager.

## Domain + Hosting

- [ ] Domain is registered in GoDaddy.
- [ ] Vercel account is ready.
- [ ] Vercel project is created.
- [ ] Kijiji files are isolated from other projects.
- [ ] `kijiji-management-group/` is deployed as the project root.
- [ ] `kijijimgmt.com` is added to Vercel.
- [ ] `www.kijijimgmt.com` is added to Vercel.
- [ ] GoDaddy DNS points to Vercel.
- [ ] SSL/HTTPS is active.
- [ ] `www` and non-`www` versions both work.

## Email

- [ ] Microsoft 365 domain is verified.
- [ ] Outlook inboxes are working.
- [ ] Microsoft MX record is active.
- [ ] SPF record is valid.
- [ ] DKIM is enabled.
- [ ] DMARC is added.
- [ ] Resend sending subdomain is selected.
- [ ] Resend DNS records are verified.

## Supabase

- [ ] Supabase project is created.
- [ ] `supabase-schema.sql` has been run.
- [ ] RLS is enabled.
- [ ] Insert policy exists for public lead submissions.
- [ ] Supabase URL and anon/publishable key are added to `script.js`.
- [ ] Test lead appears in `strategy_session_leads`.

## Website QA

- [ ] Desktop design reviewed.
- [ ] Mobile design reviewed.
- [ ] Navigation links work.
- [ ] CTA buttons work.
- [ ] Strategy Session form validates required fields.
- [ ] Success/error messages are readable.
- [ ] UTM tracking is captured.
- [ ] Page loads over HTTPS.

## Launch

- [ ] Backup made before deploy.
- [ ] Site deployed to Vercel.
- [ ] Live domain tested.
- [ ] Test form submitted.
- [ ] Test email notification received.
- [ ] Client-ready launch notes written in `CHANGELOG.md`.
