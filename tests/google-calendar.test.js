const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  snapshot,
  normalizeEvent,
  encrypt,
  decrypt,
  SCOPES,
  cronAllowed,
  readCalendar,
  handleCalendar,
} = require("../api/lib/_google-calendar");
process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY = "a".repeat(64);
const event = (
  id,
  start = "2026-11-06T10:00:00-05:00",
  end = "2026-11-06T11:00:00-05:00",
) => ({
  id,
  summary: "Client session",
  start: { dateTime: start, timeZone: "America/New_York" },
  end: { dateTime: end },
  status: "confirmed",
});
test("credentials are encrypted with random IVs and authenticated against tampering", () => {
  const a = encrypt("secret-refresh-token"),
    b = encrypt("secret-refresh-token");
  assert.notEqual(a, b);
  assert(!a.includes("secret-refresh-token"));
  assert.equal(decrypt(a), "secret-refresh-token");
  const raw = Buffer.from(a, "base64");
  raw[15] ^= 1;
  assert.throws(() => decrypt(raw.toString("base64")));
});
test("Google scopes are read-only calendar access with account verification, never write scopes", () => {
  assert(
    SCOPES.includes("https://www.googleapis.com/auth/calendar.events.readonly"),
  );
  assert(
    SCOPES.includes(
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    ),
  );
  assert(
    SCOPES.every(
      (s) => ["openid", "email"].includes(s) || s.endsWith(".readonly"),
    ),
  );
});
test("snapshot creation, rescheduling and deletion replace by Google ID without duplicates", async () => {
  let remote = [event("one"), event("one")];
  const mock = async (path) => {
    const q = new URLSearchParams(path.split("?")[1]);
    assert.equal(q.get("singleEvents"), "true");
    assert.equal(q.get("showDeleted"), "false");
    assert(!q.has("syncToken"));
    assert(q.has("timeMin") && q.has("timeMax"));
    return {
      accessRole: "reader",
      timeZone: "America/New_York",
      items: remote,
    };
  };
  let s = await snapshot(
    "client@group.calendar.google.com",
    "token",
    new Date("2026-11-05"),
    mock,
  );
  assert.equal(s.events.length, 1);
  remote = [
    event("one", "2026-11-08T14:00:00-05:00", "2026-11-08T15:00:00-05:00"),
  ];
  s = await snapshot("client", "token", new Date(), mock);
  assert.equal(s.events[0].id, "one");
  assert(s.events[0].start.startsWith("2026-11-08"));
  remote = [];
  s = await snapshot("client", "token", new Date(), mock);
  assert.deepEqual(s.events, []);
});
test("recurring exceptions preserve instance ID and original start; canceled instances omitted", async () => {
  const moved = {
    ...event("series_20261106"),
    recurringEventId: "series",
    originalStartTime: { dateTime: "2026-11-06T09:00:00-05:00" },
  };
  const s = await snapshot("client", "token", new Date(), async () => ({
    accessRole: "reader",
    items: [moved, { id: "canceled-instance", status: "cancelled" }],
  }));
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].recurringEventId, "series");
  assert.equal(s.events[0].originalStart.dateTime, "2026-11-06T09:00:00-05:00");
});
test("pagination is complete before publication; failed pages cannot become a partial snapshot", async () => {
  let calls = 0;
  const s = await snapshot("client", "token", new Date(), async (path) => {
    calls++;
    return path.includes("pageToken=next")
      ? { accessRole: "reader", items: [event("b")] }
      : { accessRole: "reader", items: [event("a")], nextPageToken: "next" };
  });
  assert.equal(calls, 2);
  assert.equal(s.events.length, 2);
  await assert.rejects(
    () =>
      snapshot("client", "token", new Date(), async (path) => {
        if (path.includes("pageToken=")) throw new Error("network failure");
        return {
          accessRole: "reader",
          items: [event("a")],
          nextPageToken: "next",
        };
      }),
    /network failure/,
  );
});
test("expired paging tokens force full retry; busy-only permission is not accepted", async () => {
  await assert.rejects(
    () =>
      snapshot("client", "token", new Date(), async (path) => {
        if (path.includes("pageToken=")) throw { googleStatus: 410 };
        return { accessRole: "reader", items: [], nextPageToken: "gone" };
      }),
    (e) => e.retrySnapshot,
  );
  await assert.rejects(
    () =>
      snapshot("client", "token", new Date(), async () => ({
        accessRole: "freeBusyReader",
        items: [],
      })),
    (e) => e.googleStatus === 403,
  );
});
test("all-day events keep exclusive dates; timed events preserve offsets through DST", () => {
  const all = normalizeEvent({
    id: "day",
    start: { date: "2026-11-01" },
    end: { date: "2026-11-03" },
  });
  assert.equal(all.allDay, true);
  assert.equal(all.start, "2026-11-01");
  assert.equal(all.end, "2026-11-03");
  const timed = normalizeEvent(
    event("dst", "2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"),
  );
  assert.equal(new Date(timed.end) - new Date(timed.start), 3600000);
});
test("private event content is not mirrored", () => {
  const n = normalizeEvent({
    ...event("private"),
    visibility: "private",
    description: "Private notes",
    location: "Private address",
  });
  assert.equal(n.name, "Private event");
  assert.equal(n.description, "");
  assert.equal(n.location, "");
});
test("scheduler rejects missing and incorrect credentials", () => {
  process.env.CRON_SECRET = "test-secret";
  assert(!cronAllowed({ headers: {} }));
  assert(!cronAllowed({ headers: { authorization: "Bearer wrong" } }));
  assert(cronAllowed({ headers: { authorization: "Bearer test-secret" } }));
});
test("member cannot manage OAuth, mapping, or imported event edits", async () => {
  for (const action of ["connect", "discover", "map", "unmap", "edit-event"])
    await assert.rejects(
      () =>
        handleCalendar({
          request: { method: "POST", query: { action } },
          identity: { isAdmin: false },
          dashboard: { clients: [] },
        }),
      (e) => e.statusCode === 403,
    );
});
test("API read scopes events to authorized clients and hides credentials", async () => {
  const original = global.fetch;
  Object.assign(process.env, {
    GOOGLE_CALENDAR_CLIENT_ID: "id",
    GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
    GOOGLE_CALENDAR_REDIRECT_URI:
      "https://www.kijijimgmt.com/api/notion-clients?view=google-calendar&action=callback",
    GOOGLE_CALENDAR_ACCOUNT_EMAIL: "kijijimgmt@gmail.com",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server",
  });
  global.fetch = async (url) =>
    new Response(
      JSON.stringify(
        String(url).includes("google_calendar_connection")
          ? [{ status: "connected", refresh_cipher: "must-not-escape" }]
          : [
              {
                id: "allowed",
                client_id: "client1",
                events: [{ id: "event1" }],
              },
              {
                id: "forbidden",
                client_id: "client2",
                events: [{ id: "event2" }],
              },
            ],
      ),
      { status: 200 },
    );
  try {
    const result = await readCalendar(
      { clients: [{ id: "client1" }] },
      { isAdmin: false },
    );
    assert.equal(result.links.length, 1);
    assert(!JSON.stringify(result).includes("must-not-escape"));
    assert(!JSON.stringify(result).includes("event2"));
  } finally {
    global.fetch = original;
  }
});
test("OAuth start uses offline read-only consent, PKCE, browser cookie and expiring hashed state", async () => {
  const { startOAuth } = require("../api/lib/_google-calendar");
  const original = global.fetch;
  let saved,
    headers = {};
  global.fetch = async (url, opts) => {
    if (opts.method === "POST") saved = JSON.parse(opts.body);
    return new Response("[]", { status: 200 });
  };
  try {
    const result = await startOAuth(
      {},
      { setHeader: (k, v) => (headers[k] = v) },
      { email: "max@kijijimgmt.com" },
    );
    const u = new URL(result.url);
    assert.equal(u.hostname, "accounts.google.com");
    assert.equal(u.searchParams.get("access_type"), "offline");
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("login_hint"), "kijijimgmt@gmail.com");
    assert(headers["Set-Cookie"].includes("HttpOnly; Secure; SameSite=Lax"));
    assert.equal(saved.state_hash.length, 64);
    assert.notEqual(saved.state_hash, u.searchParams.get("state"));
    assert(saved.expires_at);
    assert(!JSON.stringify(saved).includes(decrypt(saved.verifier_cipher)));
  } finally {
    global.fetch = original;
  }
});
test("OAuth callback validates browser binding, consumes state and refuses the wrong Google account", async () => {
  const { callback } = require("../api/lib/_google-calendar");
  const { OAuth2Client } = require("google-auth-library");
  const oldFetch = global.fetch,
    oldGet = OAuth2Client.prototype.getToken,
    oldVerify = OAuth2Client.prototype.verifyIdToken;
  let consumed = false;
  global.fetch = async (url, opts) => {
    assert(url.includes("browser_hash=eq."));
    assert.equal(opts.method, "DELETE");
    if (consumed) return new Response("[]");
    consumed = true;
    return new Response(
      JSON.stringify([
        {
          verifier_cipher: encrypt("proof-verifier"),
          actor_email: "max@kijijimgmt.com",
        },
      ]),
    );
  };
  OAuth2Client.prototype.getToken = async (options) => {
    assert.equal(options.codeVerifier, "proof-verifier");
    return {
      tokens: {
        id_token: "verified-by-stub",
        refresh_token: "server-only",
        scope: SCOPES.join(" "),
      },
    };
  };
  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({ email_verified: true, email: "wrong@gmail.com" }),
  });
  try {
    const res = { setHeader: () => {}, end: () => {} };
    await assert.rejects(
      () => callback({ headers: {}, query: { state: "test" } }, res),
      (e) => e.statusCode === 400,
    );
    const req = {
      headers: { cookie: "kijiji_google_oauth=browser-binding" },
      query: { state: "test", code: "oauth-code" },
    };
    await assert.rejects(
      () => callback(req, res),
      (e) => e.statusCode === 403,
    );
    await assert.rejects(
      () => callback(req, res),
      (e) => e.statusCode === 400,
    );
  } finally {
    global.fetch = oldFetch;
    OAuth2Client.prototype.getToken = oldGet;
    OAuth2Client.prototype.verifyIdToken = oldVerify;
  }
});
