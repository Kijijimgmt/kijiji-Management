# Shared client strategy

## Activation

The implementation is local until deployed. New strategy generation needs:

1. Run `migrations/20261027_client_strategies.sql` in the existing Supabase project's SQL editor. It creates private strategy tables and atomic server-only functions; it does not modify client records.
2. Confirm server environment variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JOTFORM_API_KEY`, and `JOTFORM_FORM_IDS`. Keep all secrets server-side.
3. Set `OPENAI_API_KEY` in the deployment environment. Optional `OPENAI_STRATEGY_MODEL` defaults to `gpt-4.1-mini`; the selected model must support Responses web search. Generation uses paid API calls, not a ChatGPT subscription.
4. Deploy and verify with a real assessment and authorized team account. Local tests use mocked AI/Jotform responses; a real researched generation has not been verified.

No new serverless endpoint is added. Strategy requests use `/api/notion-clients?view=strategy&clientId=...`. The underscore-prefixed helper avoids consuming another Vercel function slot. The existing endpoint has a 60-second duration limit.

## Team workflow

Reports → Jotform response → **Build / open client strategy** → select the correct client. This explicit choice avoids guessing which artist an assessment describes.

- The first successful generation saves one shared internal draft per client. Reopening or clicking again returns it.
- Assigned partners can read and propose strategies; the existing admin role approves the Current Plan. Currently this is Max. No roles or partner layouts are changed.
- Only one generation per client can run at a time. A failed request releases its lock; interrupted requests expire after three minutes.
- Alternative approaches and updates require a direction and an approved base plan. They remain proposals until deliberately approved. Stale approval attempts cannot overwrite a newer Current Plan.
- Previous versions retain their author, assessment snapshot, creation time, research citations and approval history.
- Client-facing drafts derive from the saved approved plan and reuse the existing draft for that version. They are never sent automatically.
- The AI does not create tasks, hire people, spend money, or send messages. Team review remains necessary.

Research distinguishes client-reported facts, cited market evidence, assumptions and experiments. Recommendations cover current capabilities, gaps, realistic first steps, management/client responsibilities, justified specialist roles and questions that would change decisions. Source citations do not replace human fact-checking.

## Verification

- `node --test tests/client-strategy.test.js tests/artist-workspace.test.js`
- `PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/client-strategy.database.cjs`
- `PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_EXECUTABLE=/path/to/browser node tests/client-strategy.browser.cjs`
- `PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_EXECUTABLE=/path/to/browser node tests/artist-workspace.browser.cjs`

The database tests execute the migration against PostgreSQL via PGlite, including concurrent claims, stale approvals, expired workers and denied browser-role access. Browser checks cover saved draft reuse, role controls, failure recovery, mobile themes and the dashboard tour.
