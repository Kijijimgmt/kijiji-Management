const crypto = require("node:crypto");
const { WRITE_SCOPE, createClientEvent } = require("./_google-calendar-create");
const { store, fail } = require("./_google-calendar-store");
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const PALETTE = [
  "#955020",
  "#246b8e",
  "#7254a0",
  "#29735c",
  "#a23d58",
  "#78651c",
  "#4563a5",
  "#9a4c85",
  "#437a27",
  "#b24b25",
  "#4f6570",
  "#6962b0",
];
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const cfg = () => ({
  id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
  secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  redirect: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
  email: process.env.GOOGLE_CALENDAR_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY,
});
function configured() {
  const c = cfg();
  return Boolean(
    c.id &&
      c.secret &&
      c.redirect &&
      c.email &&
      /^[a-f0-9]{64}$/i.test(c.key || ""),
  );
}
function encryptionKey() {
  const key = cfg().key;
  if (!/^[a-f0-9]{64}$/i.test(key || ""))
    fail("Calendar encryption key needs setup.", 503);
  return Buffer.from(key, "hex");
}
function encrypt(value) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  return Buffer.concat([
    iv,
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
function decrypt(value) {
  try {
    const b = Buffer.from(value, "base64"),
      dec = crypto.createDecipheriv(
        "aes-256-gcm",
        encryptionKey(),
        b.subarray(0, 12),
      );
    dec.setAuthTag(b.subarray(-16));
    return Buffer.concat([
      dec.update(b.subarray(12, -16)),
      dec.final(),
    ]).toString("utf8");
  } catch {
    throw Object.assign(
      new Error("Calendar credentials need reconnecting by Max."),
      { statusCode: 409, reconnect: true },
    );
  }
}
function oauthClient() {
  const { OAuth2Client } = require("google-auth-library");
  const c = cfg();
  return new OAuth2Client({
    clientId: c.id,
    clientSecret: c.secret,
    redirectUri: c.redirect,
  });
}
const connection = async () =>
  (await store("google_calendar_connection?id=eq.kijiji&select=*"))[0];
const saveConnection = (patch) =>
  store("google_calendar_connection?id=eq.kijiji", patch, "PATCH");
const tokenError = () =>
  Object.assign(
    new Error(
      "Google access expired or was revoked. Max must reconnect kijijimgmt@gmail.com in Calendar connections.",
    ),
    { statusCode: 409, reconnect: true },
  );
async function accessToken() {
  const c = await connection();
  if (!c?.refresh_cipher || c.status !== "connected") throw tokenError();
  try {
    const auth = oauthClient();
    auth.setCredentials({ refresh_token: decrypt(c.refresh_cipher) });
    const r = await auth.getAccessToken();
    if (!r.token) throw tokenError();
    return r.token;
  } catch (error) {
    if (
      error.reconnect ||
      error.response?.data?.error === "invalid_grant" ||
      error.response?.status === 401
    ) {
      await saveConnection({
        status: "reconnect",
        message:
          "Google access expired or was revoked. Ask Max to reconnect the integration account.",
      });
      throw tokenError();
    }
    fail(
      "Google authorization is temporarily unavailable. Retry shortly.",
      503,
    );
  }
}
async function google(path, token, options = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    const reason = d.error?.errors?.[0]?.reason;
    throw Object.assign(new Error("Google Calendar request failed."), {
      googleStatus: r.status,
      reason,
    });
  }
  return r.json();
}
async function calendars(token) {
  let page = "",
    items = [];
  do {
    const q = new URLSearchParams({
      maxResults: "250",
      showHidden: "true",
      minAccessRole: "reader",
      ...(page ? { pageToken: page } : {}),
    });
    const d = await google(`users/me/calendarList?${q}`, token);
    items.push(...(d.items || []));
    page = d.nextPageToken || "";
    if (items.length > 2000)
      fail("Too many shared calendars; contact the administrator.", 422);
  } while (page);
  return items.filter(
    (x) => !x.deleted && ["reader", "writer", "owner"].includes(x.accessRole),
  );
}
function normalizeEvent(event) {
  if (event.status === "cancelled") return null;
  const allDay = Boolean(event.start?.date);
  const start = allDay ? event.start.date : event.start?.dateTime,
    end = allDay ? event.end?.date : event.end?.dateTime;
  if (!event.id || !start || !end)
    fail(
      "Google returned an incomplete event; the previous snapshot was kept.",
      502,
    );
  const privateEvent = event.visibility === "private";
  return {
    id: String(event.id),
    name: privateEvent
      ? "Private event"
      : String(event.summary || "Untitled event").slice(0, 500),
    start,
    end,
    allDay,
    timeZone: event.start.timeZone || "",
    location: privateEvent ? "" : String(event.location || "").slice(0, 1000),
    description: privateEvent
      ? ""
      : String(event.description || "").slice(0, 3000),
    recurringEventId: event.recurringEventId || null,
    originalStart: event.originalStartTime || null,
    status: event.status || "confirmed",
  };
}
// Bounded, expanded full snapshots make deletions/series exceptions self-healing. No syncToken is stored.
async function snapshot(
  calendarId,
  token,
  now = new Date(),
  api = google,
  deadline = Date.now() + 35000,
) {
  const start = new Date(now.getTime() - 90 * 86400000).toISOString(),
    end = new Date(now.getTime() + 366 * 86400000).toISOString();
  const events = new Map();
  let page = "",
    pages = 0,
    zone = "UTC";
  do {
    const q = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "false",
      maxResults: "250",
      timeMin: start,
      timeMax: end,
      ...(page ? { pageToken: page } : {}),
    });
    let d;
    if (Date.now() > deadline)
      fail(
        "Calendar sync is taking longer than expected. Retry; the previous snapshot was kept.",
        503,
      );
    try {
      d = await api(
        `calendars/${encodeURIComponent(calendarId)}/events?${q}`,
        token,
      );
    } catch (e) {
      if (e.googleStatus === 410 && page) {
        const gone = Object.assign(
          new Error(
            "Google paging token expired; retry starts a complete reconciliation.",
          ),
          { retrySnapshot: true },
        );
        throw gone;
      }
      throw e;
    }
    if (!["reader", "writer", "owner"].includes(d.accessRole))
      throw Object.assign(
        new Error("Calendar event details are no longer shared."),
        { googleStatus: 403 },
      );
    zone = d.timeZone || zone;
    for (const raw of d.items || []) {
      const event = normalizeEvent(raw);
      if (event) events.set(event.id, event);
    }
    page = d.nextPageToken || "";
    if (++pages >= 12 && page)
      fail(
        "This calendar exceeds the 3,000-event sync limit. Split out a work calendar or contact Max; no partial update was published.",
        422,
      );
  } while (page);
  return { events: [...events.values()], start, end, zone };
}
async function withLease(work) {
  const token = await store("rpc/claim_google_calendar_job", {});
  if (!token) fail("Calendar sync is already running. Try again shortly.", 409);
  try {
    return await work(token);
  } finally {
    await store("rpc/release_google_calendar_job", { p_token: token }).catch(
      () => {},
    );
  }
}
async function runSync(clientIds = null) {
  if (!configured()) fail("Google Calendar setup is incomplete.", 503);
  return withLease(async (lease) => {
    const deadline = Date.now() + 40000;
    const token = await accessToken();
    let list;
    try {
      list = await calendars(token);
    } catch (e) {
      if (e.googleStatus === 401) {
        await saveConnection({
          status: "reconnect",
          message:
            "Google authorization was revoked. Reconnect the integration account.",
        });
        throw tokenError();
      }
      throw e;
    }
    const accessible = new Map(list.map((c) => [c.id, c]));
    let links = await store(
      "google_calendar_links?enabled=eq.true&select=*&order=last_attempt_at.asc.nullsfirst",
    );
    if (clientIds) links = links.filter((l) => clientIds.includes(l.client_id));
    const results = [];
    for (const link of links) {
      if (Date.now() > deadline) break;
      await store(
        `google_calendar_links?id=eq.${link.id}`,
        { last_attempt_at: new Date().toISOString() },
        "PATCH",
      );
      try {
        if (!accessible.has(link.calendar_id))
          throw Object.assign(new Error("Calendar is no longer shared."), {
            googleStatus: 404,
          });
        let data;
        try {
          data = await snapshot(
            link.calendar_id,
            token,
            new Date(),
            google,
            deadline,
          );
        } catch (e) {
          if (!e.retrySnapshot) throw e;
          data = await snapshot(
            link.calendar_id,
            token,
            new Date(),
            google,
            deadline,
          );
        }
        const ok = await store("rpc/finish_google_calendar_snapshot", {
          p_token: lease,
          p_link: link.id,
          p_events: data.events,
          p_start: data.start,
          p_end: data.end,
          p_zone: data.zone,
        });
        results.push({ id: link.id, status: ok ? "synced" : "retry" });
      } catch (e) {
        if (e.googleStatus === 401) {
          await saveConnection({
            status: "reconnect",
            message:
              "Google authorization was revoked. Reconnect the integration account.",
          });
          throw tokenError();
        }
        const denied =
          [403, 404].includes(e.googleStatus) &&
          ![
            "rateLimitExceeded",
            "userRateLimitExceeded",
            "quotaExceeded",
          ].includes(e.reason);
        await store("rpc/fail_google_calendar_snapshot", {
          p_token: lease,
          p_link: link.id,
          p_denied: denied,
          p_message: denied
            ? "Calendar access is missing. Confirm sharing with the integration Gmail and accept the invitation, then sync again."
            : e.statusCode === 422
              ? e.message
              : "Sync could not finish. Previous events are shown with their last successful sync time. Retry shortly.",
        });
        results.push({ id: link.id, status: denied ? "access_lost" : "error" });
      }
    }
    return { results, remaining: Math.max(0, links.length - results.length) };
  });
}
async function readCalendar(dashboard, identity) {
  if (!configured())
    return {
      configured: false,
      connection: {
        status: "setup_needed",
        message: "Max needs to finish Google Calendar setup.",
      },
      links: [],
      canManage: Boolean(identity.isAdmin && identity.authMode === "supabase"),
    };
  const c = await connection();
  const allowed = new Set(dashboard.clients.map((x) => x.id));
  const links = (
    await store(
      "google_calendar_links?enabled=eq.true&select=*&order=created_at.asc",
    )
  ).filter((l) => allowed.has(l.client_id));
  return {
    configured: true,
    scheduler: await store("rpc/kijiji_calendar_scheduler_status", {}).then(status => ({ enabled: status?.enabled === true, lastRun: typeof status?.lastRun === "string" ? status.lastRun : null, schedule: "Every 5 minutes" })).catch(() => ({ enabled: false, unavailable: true })),
    canManage: Boolean(identity.isAdmin && identity.authMode === "supabase"),
    connection: {
      status: c.status,
      message: c.message,
      accountEmail: identity.isAdmin ? c.account_email : undefined,
      lastJobAt: c.last_job_at,
      canCreate:
        c.status === "connected" && Boolean(c.scopes?.includes(WRITE_SCOPE)),
    },
    links: links.map((l) => ({
      id: l.id,
      clientId: l.client_id,
      calendarName: l.calendar_name,
      color: l.color,
      timeZone: l.time_zone,
      status: l.status,
      message: l.message,
      lastSuccessAt: l.last_success_at,
      windowStart: l.window_start,
      windowEnd: l.window_end,
      allowCreate: Boolean(l.allow_create),
      canCreate:
        identity.authMode === "supabase" &&
        Boolean(l.allow_create) &&
        c.status === "connected" &&
        Boolean(c.scopes?.includes(WRITE_SCOPE)),
      events:
        c.status === "connected" && !["access_lost"].includes(l.status)
          ? l.events
          : [],
    })),
  };
}
async function startOAuth(request, response, identity, wantWrite = false) {
  if (!configured())
    fail(
      "Google Calendar setup is incomplete. Follow GOOGLE_CALENDAR_SETUP.md.",
      503,
    );
  const c = cfg(),
    redirect = new URL(c.redirect);
  if (redirect.protocol !== "https:" && redirect.hostname !== "localhost")
    fail("OAuth redirect must use HTTPS.", 503);
  const state = crypto.randomBytes(32).toString("base64url"),
    browser = crypto.randomBytes(32).toString("base64url"),
    verifier = crypto.randomBytes(32).toString("base64url");
  await store(
    "google_calendar_oauth_states?expires_at=lt." +
      encodeURIComponent(new Date().toISOString()),
    null,
    "DELETE",
  );
  await store("google_calendar_oauth_states", {
    state_hash: hash(state),
    browser_hash: hash(browser),
    verifier_cipher: encrypt(JSON.stringify({ verifier, wantWrite })),
    actor_email: identity.email,
    expires_at: new Date(Date.now() + 600000).toISOString(),
  });
  response.setHeader(
    "Set-Cookie",
    `kijiji_google_oauth=${browser}; HttpOnly; Secure; SameSite=Lax; Path=/api/notion-clients; Max-Age=600`,
  );
  return {
    url: oauthClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: wantWrite
        ? SCOPES.filter(
            (s) =>
              s !== "https://www.googleapis.com/auth/calendar.events.readonly",
          ).concat(WRITE_SCOPE)
        : SCOPES,
      state,
      login_hint: c.email,
      code_challenge: crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url"),
      code_challenge_method: "S256",
      include_granted_scopes: false,
    }),
  };
}
async function callback(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  const cookie =
    String(request.headers.cookie || "").match(
      /(?:^|;\s*)kijiji_google_oauth=([^;]+)/,
    )?.[1] || "";
  const state = String(request.query.state || "");
  if (!cookie || !state || state.length > 200)
    fail(
      "Calendar authorization expired or could not be verified. Start again from the dashboard.",
      400,
    );
  const states = await store(
    `google_calendar_oauth_states?state_hash=eq.${hash(state)}&browser_hash=eq.${hash(cookie)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    null,
    "DELETE",
  );
  response.setHeader(
    "Set-Cookie",
    "kijiji_google_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/api/notion-clients; Max-Age=0",
  );
  if (!states?.[0])
    fail(
      "Calendar authorization expired or was already used. Start again.",
      400,
    );
  if (request.query.error)
    fail(
      "Google access was not granted. Return to the dashboard and connect again.",
      400,
    );
  const rawVerifier = decrypt(states[0].verifier_cipher);
  let proof;
  try {
    proof = JSON.parse(rawVerifier);
  } catch {
    proof = { verifier: rawVerifier, wantWrite: false };
  }
  const auth = oauthClient();
  let tokens;
  try {
    ({ tokens } = await auth.getToken({
      code: String(request.query.code || ""),
      codeVerifier: proof.verifier,
    }));
  } catch {
    fail(
      "Google could not complete authorization. Start again from the dashboard.",
      400,
    );
  }
  let ticket;
  try {
    ticket = await auth.verifyIdToken({
      idToken: tokens.id_token,
      audience: cfg().id,
    });
  } catch {
    fail("Google account identity could not be verified. Start again.", 400);
  }
  const account = ticket.getPayload();
  if (
    !account.email_verified ||
    account.email?.toLowerCase() !== cfg().email.toLowerCase()
  )
    fail(`Use the configured integration Gmail account (${cfg().email}).`, 403);
  const granted = new Set(String(tokens.scope || "").split(" "));
  if (
    !granted.has(
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    ) ||
    !(
      granted.has("https://www.googleapis.com/auth/calendar.events.readonly") ||
      granted.has(WRITE_SCOPE)
    ) ||
    (proof.wantWrite && !granted.has(WRITE_SCOPE))
  )
    fail(
      "The requested Calendar permissions were not granted. Reconnect and review the permissions.",
      403,
    );
  if (!tokens.refresh_token)
    fail(
      "Google did not return offline access. Reconnect and grant consent again.",
      400,
    );
  await withLease(() =>
    saveConnection({
      refresh_cipher: encrypt(tokens.refresh_token),
      account_email: account.email,
      status: "connected",
      message: "",
      connected_at: new Date().toISOString(),
      scopes: [...granted],
    }),
  );
  response.statusCode = 303;
  response.setHeader(
    "Location",
    new URL("/client-portal#calendar", cfg().redirect).href,
  );
  response.end();
}
async function handleCalendar({ request, response, identity, dashboard }) {
  const action = request.query.action || "read";
  if (request.method === "GET" && action === "read")
    return readCalendar(dashboard, identity);
  if (request.method !== "POST") fail("Use POST for calendar actions.", 405);
  const body =
    typeof request.body === "string"
      ? JSON.parse(request.body)
      : request.body || {};
  if (action === "create-event") {
    const created = await createClientEvent(
      { body, identity, dashboard },
      {
        store,
        connection,
        accessToken,
        withLease,
        google,
        calendars,
        normalizeEvent,
      },
    );
    return { ...(await readCalendar(dashboard, identity)), created };
  }
  if (action === "sync") {
    await runSync(dashboard.clients.map((c) => c.id));
    return readCalendar(dashboard, identity);
  }
  if (!identity.isAdmin || identity.authMode !== "supabase")
    fail(
      "Only Max can manage calendar connections after signing in securely.",
      403,
    );
  if (action === "enable-scheduler") {
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16)
      fail("Automatic sync needs CRON_SECRET configured on the server.", 503);
    await runSync(dashboard.clients.map(client => client.id));
    const links = await store("google_calendar_links?enabled=eq.true&select=last_success_at,status");
    if (!links.length || links.some(link => link.status !== "connected" || !link.last_success_at || Date.now()-new Date(link.last_success_at).getTime()>120000))
      fail("Sync the connected calendars successfully before enabling automatic updates. Reconnect Google if requested.", 409);
    await store("rpc/kijiji_enable_calendar_scheduler", { p_secret: process.env.CRON_SECRET });
    return readCalendar(dashboard, identity);
  }
  if (action === "connect" || action === "connect-write")
    return startOAuth(request, response, identity, action === "connect-write");
  if (action === "enable-create") {
    const link = (
      await store(
        `google_calendar_links?id=eq.${encodeURIComponent(String(body.linkId))}&enabled=eq.true&select=*`,
      )
    )[0];
    if (!link || !dashboard.clients.some((c) => c.id === link.client_id))
      fail("Choose a mapped client calendar.", 403);
    if (typeof body.enabled !== "boolean")
      fail("Choose whether event creation is enabled.");
    await withLease(async () => {
      const current = (await store(`google_calendar_links?id=eq.${link.id}&enabled=eq.true&select=*`))[0];
      if (!current || current.client_id !== link.client_id || current.calendar_id !== link.calendar_id)
        fail("The calendar mapping changed. Refresh before enabling event creation.", 409);
      if (body.enabled) {
        const c = await connection();
        if (!c.scopes?.includes(WRITE_SCOPE))
          fail("Enable Google event creation and reconnect first.", 409);
        const cal = (await calendars(await accessToken())).find(
          (c) => c.id === link.calendar_id,
        );
        if (!cal || !["writer", "owner"].includes(cal.accessRole))
          fail(
            "Ask the client to share this calendar with Make changes to events permission.",
            403,
          );
      }
      await store(
        `google_calendar_links?id=eq.${link.id}`,
        { allow_create: body.enabled },
        "PATCH",
      );
    });
    return readCalendar(dashboard, identity);
  }
  if (action === "discover") {
    const token = await accessToken();
    return {
      calendars: (await calendars(token)).map((c) => ({
        id: c.id,
        name: c.summary || "Calendar",
        timeZone: c.timeZone || "UTC",
        primary: Boolean(c.primary),
        accessRole: c.accessRole,
      })),
    };
  }
  if (action === "map") {
    body.color = String(body.color || "").toLowerCase();
    const client = dashboard.clients.find((c) => c.id === body.clientId);
    if (!client) fail("Choose a client in your workspace.", 403);
    if (!/^#[a-f0-9]{6}$/i.test(body.color || ""))
      fail("Choose a calendar color.");
    const token = await accessToken(),
      cal = (await calendars(token)).find((c) => c.id === body.calendarId);
    if (!cal)
      fail(
        "Calendar details are not accessible. Accept the sharing invite first.",
        403,
      );
    await withLease(async () => {
      const conflict = await store(
        `google_calendar_links?enabled=eq.true&color=eq.${encodeURIComponent(body.color)}&client_id=neq.${encodeURIComponent(client.id)}&select=id`,
      );
      if (conflict.length)
        fail(
          "That color is assigned to another client. Choose a different color.",
          409,
        );
      await store(
        `google_calendar_links?client_id=eq.${encodeURIComponent(client.id)}`,
        { color: body.color },
        "PATCH",
      );
      const old = await store(
        `google_calendar_links?calendar_id=eq.${encodeURIComponent(cal.id)}&select=id`,
      );
      const row = {
        calendar_id: cal.id,
        client_id: client.id,
        calendar_name: cal.summary || "Calendar",
        time_zone: cal.timeZone || "UTC",
        color: body.color,
        enabled: true,
        allow_create: false,
        status: "pending",
        message: "Mapping saved. Sync to import events.",
        events: [],
        last_success_at: null,
      };
      if (old[0])
        await store(`google_calendar_links?id=eq.${old[0].id}`, row, "PATCH");
      else
        await store("google_calendar_links", {
          ...row,
          created_by: identity.email,
        });
    });
    return readCalendar(dashboard, identity);
  }
  if (action === "unmap") {
    await withLease(() =>
      store(
        `google_calendar_links?id=eq.${encodeURIComponent(String(body.linkId))}`,
        {
          enabled: false,
          allow_create: false,
          events: [],
          status: "disconnected",
        },
        "PATCH",
      ),
    );
    return readCalendar(dashboard, identity);
  }
  fail("Choose a calendar action.");
}
function cronAllowed(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const given = Buffer.from(String(request.headers.authorization || ""));
  const wanted = Buffer.from(`Bearer ${expected}`);
  return (
    given.length === wanted.length && crypto.timingSafeEqual(given, wanted)
  );
}

module.exports = {
  handleCalendar,
  callback,
  runSync,
  cronAllowed,
  configured,
  SCOPES,
  PALETTE,
  normalizeEvent,
  snapshot,
  encrypt,
  decrypt,
  readCalendar,
  startOAuth,
};
