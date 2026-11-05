const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
(async () => {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261105153856_google_calendar_readonly.sql",
      "utf8",
    ),
  );
  await db.exec(
    "insert into google_calendar_links(calendar_id,client_id,calendar_name,time_zone,color,created_by) values ('client1@calendar','client1','Client work','America/New_York','#955020','max')",
  );
  const id = (await db.query("select id from google_calendar_links")).rows[0]
    .id;
  const token = (await db.query("select claim_google_calendar_job() as token"))
    .rows[0].token;
  assert(token);
  assert.equal(
    (await db.query("select claim_google_calendar_job() as token")).rows[0]
      .token,
    null,
  );
  await db.query("select finish_google_calendar_snapshot($1,$2,$3,$4,$5,$6)", [
    token,
    id,
    JSON.stringify([{ id: "google-id", start: "2026-11-06" }]),
    "2026-08-01",
    "2027-11-06",
    "America/New_York",
  ]);
  assert.equal(
    (
      await db.query(
        "select jsonb_array_length(events) as count from google_calendar_links",
      )
    ).rows[0].count,
    1,
  );
  await db.query("select finish_google_calendar_snapshot($1,$2,$3,$4,$5,$6)", [
    token,
    id,
    "[]",
    "2026-08-01",
    "2027-11-06",
    "America/New_York",
  ]);
  assert.equal(
    (
      await db.query(
        "select jsonb_array_length(events) as count from google_calendar_links",
      )
    ).rows[0].count,
    0,
    "deletion reconciles to an empty snapshot",
  );
  await db.query("select release_google_calendar_job($1)", [token]);
  assert.equal(
    (
      await db.query(
        "select finish_google_calendar_snapshot($1,$2,$3,$4,$5,$6) as ok",
        [token, id, "[]", "2026-08-01", "2027-11-06", "UTC"],
      )
    ).rows[0].ok,
    false,
    "stale workers cannot commit",
  );
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const table of [
      "google_calendar_connection",
      "google_calendar_links",
      "google_calendar_oauth_states",
    ])
      await assert.rejects(() => db.query(`select * from ${table}`));
    await assert.rejects(() => db.query("select claim_google_calendar_job()"));
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  assert.equal(
    (await db.query("select count(*) from google_calendar_links")).rows[0]
      .count,
    1,
  );
  await db.close();
  console.log(
    "PASS: migration, exclusive worker lease, atomic replacement/deletion, stale worker rejection, server-only tables/RPC.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
