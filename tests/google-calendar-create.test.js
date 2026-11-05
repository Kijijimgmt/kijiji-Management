const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  normalizeNewEvent,
  createClientEvent,
  WRITE_SCOPE,
} = require("../api/lib/_google-calendar-create");
const link = {
  id: "11111111-1111-4111-8111-111111111111",
  client_id: "medusa",
  calendar_id: "medusa@group.calendar.google.com",
  allow_create: true,
};
const body = {
  linkId: link.id,
  requestId: "22222222-2222-4222-8222-222222222222",
  title: "Kijiji session",
  startLocal: "2026-11-10T10:00",
  endLocal: "2026-11-10T11:00",
  timeZone: "America/Los_Angeles",
  notes: "Rehearsal",
  attendees: [{ email: "not-permitted@example.com" }],
};
const ctx = {
  body,
  identity: {
    authMode: "supabase",
    email: "joe@kijijimgmt.com",
    fullName: "Joe",
  },
  dashboard: { clients: [{ id: "medusa" }] },
};
function deps(overrides = {}) {
  let saved,
    posts = 0;
  const d = {
    store: async (path) => (path.startsWith("rpc/") ? true : [link]),
    connection: async () => ({ status: "connected", scopes: [WRITE_SCOPE] }),
    accessToken: async () => "secret",
    withLease: async (fn) => fn("lease"),
    calendars: async () => [{ id: link.calendar_id, accessRole: "writer" }],
    normalizeEvent: (e) => ({ id: e.id, name: e.summary }),
    google: async (path, token, options) => {
      assert.equal(token, "secret");
      if (options) {
        posts++;
        if (saved) throw { googleStatus: 409 };
        saved = JSON.parse(options.body);
        return saved;
      }
      return saved;
    },
    ...overrides,
  };
  d.postCount = () => posts;
  return d;
}
test("timed event uses requested client zone, not the browser/server zone", () => {
  const e = normalizeNewEvent(body);
  assert.equal(e.start.dateTime, "2026-11-10T10:00:00-08:00");
  assert.equal(e.start.timeZone, "America/Los_Angeles");
  assert.equal(e.end.dateTime, "2026-11-10T11:00:00-08:00");
  assert(!e.attendees);
});
test("all-day last day is inclusive in form and exclusive in Google", () => {
  const e = normalizeNewEvent({
    ...body,
    allDay: true,
    startDate: "2026-11-10",
    endDate: "2026-11-12",
  });
  assert.deepEqual(e.start, { date: "2026-11-10" });
  assert.deepEqual(e.end, { date: "2026-11-13" });
});
test("invalid ranges, nonexistent dates, nonexistent and ambiguous DST times are rejected", () => {
  for (const patch of [
    { title: "" },
    { timeZone: "not-a-zone" },
    { endLocal: "2026-11-10T09:00" },
    { allDay: true, startDate: "2026-02-30", endDate: "2026-03-01" },
    { startLocal: "2027-03-14T02:30", endLocal: "2027-03-14T03:30" },
    { startLocal: "2026-11-01T01:30", endLocal: "2026-11-01T02:30" },
  ])
    assert.throws(() => normalizeNewEvent({ ...body, ...patch }));
});
test("only an authorized, opted-in mapping with granted scope and live edit access can be written", async () => {
  for (const [context, override] of [
    [{ ...ctx, identity: { authMode: "passcode" } }, {}],
    [{ ...ctx, dashboard: { clients: [] } }, {}],
    [ctx, { store: async () => [{ ...link, allow_create: false }] }],
    [ctx, { connection: async () => ({ status: "connected", scopes: [] }) }],
    [
      ctx,
      {
        calendars: async () => [{ id: link.calendar_id, accessRole: "reader" }],
      },
    ],
  ]) {
    const d = deps(override);
    await assert.rejects(() => createClientEvent(context, d));
    assert.equal(d.postCount(), 0);
  }
});
test("retry uses the same Google ID and recovers the existing event; no guest invitations are accepted", async () => {
  const d = deps();
  let first = await createClientEvent(ctx, d),
    second = await createClientEvent(ctx, d);
  assert.equal(first.id, second.id);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert(first.cached);
});
test("same request cannot silently replace a previously created event with changed content", async () => {
  const d = deps();
  await createClientEvent(ctx, d);
  await assert.rejects(
    () =>
      createClientEvent(
        { ...ctx, body: { ...body, title: "Changed title" } },
        d,
      ),
    (e) => e.statusCode === 409,
  );
});
test("cache failure after Google success is reported as created, not as a failed creation", async () => {
  const d = deps({
    store: async (path) => {
      if (path.startsWith("rpc/")) throw new Error("database unavailable");
      return [link];
    },
  });
  const result = await createClientEvent(ctx, d);
  assert(result.id);
  assert.equal(result.cached, false);
});
test("mapping changes between validation and the write lease cannot write to another client", async () => {
  let reads = 0;
  const d = deps({
    store: async (path) => {
      if (path.startsWith("rpc/")) return true;
      return [
        ++reads === 1 ? link : { ...link, client_id: "different-client" },
      ];
    },
  });
  await assert.rejects(
    () => createClientEvent(ctx, d),
    (e) => e.statusCode === 409,
  );
  assert.equal(d.postCount(), 0);
});
