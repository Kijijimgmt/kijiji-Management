# Email Setup: Outlook + Resend

Use Microsoft Outlook for business inboxes. Use Resend for automated website emails.

## Recommendation

Keep these jobs separate:

| Email Type | Recommended Tool | Example |
| --- | --- | --- |
| Human inboxes | Microsoft Outlook / Microsoft 365 | `hello@yourdomain.com`, `info@yourdomain.com` |
| Lead notifications | Resend | “New Strategy Session request” to the team |
| Auto-replies | Resend | “We received your request” to the lead |

This gives you reliable business inboxes while keeping automated sending separate and trackable.

## Important DNS Rule

Do not create multiple SPF records for the same domain.

Microsoft notes that a domain should have a single SPF TXT record. If multiple services send mail from the root domain, their SPF includes must be combined into one record. Resend also recommends using a sending subdomain, which avoids most conflicts.

## Best Setup

Use Microsoft 365 on the root domain:

```text
yourdomain.com
```

Use Resend on a subdomain:

```text
send.yourdomain.com
```

or:

```text
notifications.yourdomain.com
```

This keeps Outlook responsible for inbox delivery and Resend responsible for automated outbound messages.

## Microsoft Outlook / Microsoft 365

Microsoft 365 should own the main email records:

- MX record for mailbox delivery
- SPF TXT record for Microsoft 365
- Autodiscover CNAME
- DKIM CNAME records
- DMARC TXT record

Microsoft's typical SPF value is:

```text
v=spf1 include:spf.protection.outlook.com -all
```

Use the exact values shown in the Microsoft 365 admin center, because tenant-specific DKIM records vary.

## Resend

In Resend:

1. Add a domain or subdomain, preferably `send.yourdomain.com`.
2. Copy the DNS records Resend provides.
3. Add those records in GoDaddy DNS.
4. Wait for Resend to verify SPF and DKIM.
5. Add DMARC for stronger trust.

Do not put the Resend API key in `script.js`.

## How Resend Should Connect To This Site

The static website submits leads through a server-side Vercel endpoint. The endpoint saves the lead to Supabase and sends internal notifications with Resend:

```text
Website form -> Vercel /api/strategy-session-lead -> Supabase + Resend
```

Use cases:

- Send internal notification to `joe@kijijimgmt.com`, `erik@kijijimgmt.com`, and `max@kijijimgmt.com`.
- Send confirmation to the lead.
- Later, send follow-up sequences or hand off to CRM.

Set these Vercel environment variables:

```text
RESEND_API_KEY=your_resend_key
LEAD_NOTIFICATION_FROM=Kijiji Management <leads@notify.kijijimgmt.com>
LEAD_NOTIFICATION_RECIPIENTS=joe@kijijimgmt.com,erik@kijijimgmt.com,max@kijijimgmt.com
SUPABASE_URL=https://vaqgriohhcccvvxgkhgh.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_LEADS_TABLE=strategy_session_leads
```

Only `RESEND_API_KEY` is secret. Keep it out of GitHub and frontend files.

## Why Not Send Resend Emails Directly From The Browser?

The Resend API key is secret. If it is placed in browser JavaScript, anyone can inspect it and abuse the account.

Use a server-side function instead.

## DNS Checklist

- GoDaddy domain points to Vercel hosting.
- Microsoft 365 MX record stays active for inboxes.
- Microsoft 365 SPF/DKIM/DMARC are configured.
- Resend uses `notify.kijijimgmt.com`.
- Resend SPF/DKIM records are verified.
- No duplicate SPF TXT records exist on the same hostname.

## References

- Microsoft 365 custom domain DNS setup: https://learn.microsoft.com/en-us/microsoft-365/admin/get-help-with-domains/create-dns-records-at-any-dns-hosting-provider
- Microsoft 365 external DNS records: https://learn.microsoft.com/en-us/microsoft-365/enterprise/external-domain-name-system-records
- Resend domain verification: https://resend.com/docs/dashboard/domains/introduction
- Resend DMARC guide: https://resend.com/docs/dashboard/domains/dmarc
