# Vercel Deployment Guide

Use Vercel for hosting and keep GoDaddy as the domain registrar/DNS manager.

## Recommended Setup

| Area | Tool |
| --- | --- |
| Domain registration | GoDaddy |
| DNS management | GoDaddy |
| Website hosting | Vercel |
| Business inboxes | Microsoft Outlook / Microsoft 365 |
| Lead database | Supabase |
| Automated emails | Resend |

## Deploy The Site

Best path:

1. Create or sign in to a Vercel account.
2. Create a new project.
3. Upload/import this folder:

```text
kijiji-management-group/
```

4. Use static defaults:
   - Framework preset: `Other`
   - Build command: leave blank
   - Output directory: leave blank
   - Install command: leave blank

Vercel should serve `index.html` automatically.

## Connect `kijijimgmt.com`

In Vercel:

1. Open the project.
2. Go to Settings > Domains.
3. Add:

```text
kijijimgmt.com
www.kijijimgmt.com
```

4. Vercel will show the exact DNS records it wants.

In GoDaddy DNS:

- Replace the current `A` record for `@` that points to `WebsiteBuilder Site`.
- Add the Vercel apex/root record Vercel provides.
- Add the `www` CNAME record Vercel provides.

Vercel's general-purpose records are currently:

```text
Type: A
Name: @
Value: 76.76.21.21
```

```text
Type: CNAME
Name: www
Value: cname.vercel-dns-0.com
```

Use the exact values Vercel shows in the project dashboard if they differ.

## Do Not Change Email DNS

Do not delete Microsoft Outlook / Microsoft 365 records:

- MX records
- SPF TXT record
- DKIM CNAME records
- DMARC TXT record
- Autodiscover record

Website hosting records and email records can coexist.

## DNS Timing

DNS changes can take minutes to several hours. Vercel and GoDaddy may show different statuses while records propagate.

## Final QA

- `https://kijijimgmt.com` loads the site.
- `https://www.kijijimgmt.com` loads or redirects correctly.
- Outlook email still works.
- Strategy Session form still validates.
- Once Supabase keys are connected, test a live lead submission.

## References

- Vercel custom domain setup: https://vercel.com/docs/domains/set-up-custom-domain
- Vercel domain redirects: https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting
