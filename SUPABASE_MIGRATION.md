# Moving Kijiji operational storage to Supabase

## Status — November 22, 2026

The private Supabase tables and document bucket now contain 105 recovered operational records and 21 verified template files. Client/task/opportunity/event CSV imports are complete for the supplied exports; page bodies, profile history, original attachments, and four ambiguous reverse references remain recovery gaps. The November 22 access repair switches the existing dashboard to these recovered records after readiness checks. Original exports and import reports are retained privately outside this repository.

Compatibility fixes include explicitly named writable properties, normalized event types, separate follow-up/last-touch dates, a fresh empty activity collection, an empty industry-brief collection (not a claim that brief history was recovered), and server-only notification storage. The live Google connection retains its actual status; calendar authorization is not repaired by this storage switch.

The code in this checkout adds an opt-in storage adapter across client/task/opportunity/event CRUD, artist profile entries, files, industry brief metadata, website inquiries, reminders, Slack commands, activity logging, and health checks. Existing Google OAuth, calendar cache, shared strategy storage, Jotform credentials, and partner authorization logic stay in place. Frontend navigation and layouts are unchanged.

This is a compatibility migration: source schemas and original page/block properties are retained as JSONB alongside indexed collection IDs. This deliberately preserves unknown fields, original record IDs, relations, task document markers, and existing strategy/calendar links. It does not yet turn every field into a normalized SQL column. Introduce normalized reporting tables later, after the preserved data has been verified.

## Existing configuration

Server only:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — never put this in browser code, chat, or a committed file.
- `PORTAL_DATA_BACKEND` — absent or `notion` keeps the current backend; `supabase` selects the new backend only when database readiness is also enabled.

Existing `SUPABASE_PUBLISHABLE_KEY` and team sign-in continue unchanged. Existing Notion source IDs are retained as collection identifiers; retain their environment overrides during migration.

`DISABLE_PORTAL_WRITES=true` freezes normal portal writes. The old `DISABLE_NOTION_WRITES` guard is also honored. A preview is read-only unless its corresponding preview-write flag is explicitly enabled. Test writes against a separate staging project, not against the production data copy.

Database tables have RLS enabled and no browser grants or policies. Only the server role can access them, through existing authenticated and authorized endpoints. Supabase's RLS-without-policies informational notice is intentional here. Signed document links expire after 15 minutes. Existing Files visibility is retained: all approved team members can read the shared library; client folder selection is not a confidentiality boundary.

## Transfer steps

1. Restore access to the source Notion workspace. An arbitrary CSV export is not a substitute for linked records, page blocks, and binary attachments. If restoring API access is impossible, inventory a complete workspace export and build an explicit import conversion for its format.
2. Supply existing server credentials in a trusted shell environment. Do not print keys. Run the following from this repository, with the backup directory OUTSIDE the website project:

   ```sh
   node scripts/migrate-portal-storage.cjs export '/absolute/private/portal-backup'
   node scripts/migrate-portal-storage.cjs inspect '/absolute/private/portal-backup'
   node scripts/migrate-portal-storage.cjs import '/absolute/private/portal-backup'
   node scripts/migrate-portal-storage.cjs verify '/absolute/private/portal-backup'
   ```

3. The export reads configured client/action/opportunity/event/document/industry-brief collections and an activity collection if configured. It paginates records, long relations and page blocks recursively. Uploaded files are downloaded and checksummed before a complete manifest is written. External links are inventoried, not copied. The export does not include unrelated workspace pages, comments, Notion version history, or recover already-trashed pages. Review those separately if they must be retained.
4. The importer preserves IDs and uploads actual file bytes to a private bucket, replacing expiring Notion file URLs with durable object paths. It is rerunnable while staging is inactive. It refuses to overwrite an already activated database. Attachments larger than the dashboard's existing 3 MB limit stop the transfer for review rather than being silently skipped.
5. Verification checks collection/record/block counts, every copied payload, and stored attachment checksums. It reports unresolved relations, formula/rollup fields, and external URLs. Formula and rollup values are snapshots; implement equivalents for fields that must keep calculating before approving the switch. External Notion links may need replacements. No command automatically enables readiness.
6. Freeze Notion writes for a final fresh export/import/verification. Also pause external automations that write to Notion; prevent team edits during the cutover. Verify a fresh snapshot and ensure all required integrations now target the dashboard's endpoints or Supabase.
7. Test a separate staging deployment/project: Max/Joe/Erik/Emad visibility; create/edit/archive a task; attached contract download; client profile/social/meeting entries; opportunities and website leads; industry briefs; notification behavior; calendar mappings. Confirm internal writes do not change client-owned Google events unexpectedly. Check mobile and desktop against real records. Automated fixtures alone do not establish these workflows work with production data.
8. After content and workflow checks pass, record the cutover verification, set `portal_storage_state.ready=true`, set Production `PORTAL_DATA_BACKEND=supabase`, and deploy the reviewed code. Check authenticated pages and deep health immediately. Do not enable the flag while the source database is blocked or empty.
9. Keep the original backup and frozen Notion data until the team confirms the transfer. To roll back after new Supabase edits, first freeze writes and reconcile those edits; simply switching to Notion would hide them. Remove source tokens only once recovery and integrations have been checked.

## Verification performed so far

- 60 automated tests pass, including migration readiness, original IDs, pagination beyond the API response limit, title normalization, atomic updates, workspace entry preservation, private signed file URLs, attachment conversion, unchanged client visibility for Joe/Erik/Max, and rejection before data access for unauthenticated requests.
- On the actual Supabase database, an insert/update/archive test succeeded inside a rolled-back transaction. Separate field updates preserved earlier fields. Test records were not retained.
- All four staging tables have RLS enabled. Anonymous and authenticated browser roles cannot select records or execute the patch function. The file bucket is private. Readiness remains false.
- Counts, stored payloads and all 21 template file checksums have been verified. Production login, page loading and downloads must be verified during the November 22 access repair. Google authorization remains a separate check.
