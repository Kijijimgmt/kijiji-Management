# Kijiji Supabase Lead Capture Setup

The page is already wired for Supabase but intentionally has blank credentials.

1. Create a Supabase project.
2. Open the SQL editor and run `supabase-schema.sql`.
3. Go to Project Settings > API Keys.
4. Copy the project URL and public anon/publishable key.
5. In `script.js`, fill:

```js
const supabaseConfig = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY",
  table: "strategy_session_leads",
};
```

Do not put the service role key in browser code.

The form sends:
- Contact fields
- Client category and stage
- Services needed
- Bottleneck and readiness
- UTM values
- Page URL, referrer, user agent, and timestamp
