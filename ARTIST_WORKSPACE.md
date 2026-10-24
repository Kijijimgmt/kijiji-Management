# Artist workspace

Open Clients, select an artist, and use Overview, Tasks, Events & tickets, Socials, Marketing, or Files. Existing task and event editors still handle assignments and updates. The full original client roadmap is available beneath Overview.

Profiles, dated metric snapshots, and marketing drafts save as marked JSON code blocks on the existing Notion client page. Entries are append-only so partner submissions do not overwrite each other. The latest profile entry is the current profile; metric panels use the latest observation date, with submission time breaking ties. Historical entries remain accessible. Blank numbers are unknown, not zero. Tickets and revenue are cumulative snapshots, not transactions to sum.

All requests use the existing authenticated client endpoint and its filtered client roster. Partners can access profiles for artists visible in their assigned workspace. Existing preview and write-disable guards apply. No new serverless function or database migration is required.

## AI setup

Set OPENAI_API_KEY on the server to enable AI drafting. OPENAI_ARTIST_MODEL optionally overrides the default gpt-4.1-mini model. The API key is never returned to the browser. Draft generation uses the OpenAI Responses API with store:false and sends the artist name, bio, priority, accessible linked events, recent manual metrics, and the user's brief. It does not send contracts or other file contents. Generation only fills an editable draft; Save draft shares it in the artist workspace.

Email delivery, audience lists, social publishing, and automatic ticket/social imports are not connected. The UI labels these limitations. Saved drafts can be copied to the team's email or publishing tool. No messages are sent by this feature.

## Verification

Run `node --test tests/artist-workspace.test.js` and syntax checks for artist-workspace.js, portal.js, api/notion-clients.js, and api/lib/artist-workspace.js. Browser checks should cover all tabs, light/dark themes, narrow screens, failed-save draft retention, and zero-versus-missing metrics. A production-authorized save is still needed to verify the connected Notion service; local mocks must not be treated as that verification.
