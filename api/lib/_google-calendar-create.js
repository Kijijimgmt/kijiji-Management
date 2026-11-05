const { Temporal } = require("@js-temporal/polyfill");
const { createHash } = require("node:crypto");
const { fail } = require("./_google-calendar-store");
const WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const uuid = (value) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    String(value || ""),
  );
function normalizeNewEvent(body) {
  const field = (key, max) => {
    const s = String(body[key] || "").trim();
    if (s.length > max) fail(`The ${key} is too long.`);
    return s;
  };
  const summary = field("title", 200);
  if (!summary) fail("Add an event title.");
  const timeZone = field("timeZone", 100);
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    fail("Choose a valid time zone.");
  }
  if (!timeZone) fail("Choose the event time zone.");
  let start, end;
  if (body.allDay === true) {
    try {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate)
      )
        throw Error();
      const first = Temporal.PlainDate.from(body.startDate),
        last = Temporal.PlainDate.from(body.endDate);
      if (Temporal.PlainDate.compare(first, last) > 0)
        fail("The last day must be on or after the first day.");
      start = { date: first.toString() };
      end = { date: last.add({ days: 1 }).toString() };
    } catch (error) {
      if (error.statusCode) throw error;
      fail("Choose valid first and last dates.");
    }
  } else {
    const zoned = (key) => {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body[key] || ""))
        fail("Choose valid start and end times.");
      try {
        return Temporal.ZonedDateTime.from(`${body[key]}[${timeZone}]`, {
          disambiguation: "reject",
        });
      } catch {
        fail(
          "This local time is missing or occurs twice because of a daylight-saving change. Choose another time, or enter the event in UTC.",
        );
      }
    };
    const from = zoned("startLocal"),
      to = zoned("endLocal");
    if (Temporal.ZonedDateTime.compare(from, to) >= 0)
      fail("End time must be after start time.");
    start = { dateTime: from.toString({ timeZoneName: "never" }), timeZone };
    end = { dateTime: to.toString({ timeZoneName: "never" }), timeZone };
  }
  return {
    summary,
    start,
    end,
    location: field("location", 1000),
    description: field("notes", 3000),
  };
}
async function createClientEvent({ body, identity, dashboard }, deps) {
  if (identity.authMode !== "supabase")
    fail("Sign in securely to add a client event.", 403);
  if (!uuid(body.linkId) || !uuid(body.requestId))
    fail("Choose a connected calendar and start a new event form.");
  const link = (
    await deps.store(
      `google_calendar_links?id=eq.${encodeURIComponent(body.linkId)}&enabled=eq.true&select=*`,
    )
  )[0];
  if (!link || !dashboard.clients.some((c) => c.id === link.client_id))
    fail("This client calendar is not in your authorized workspace.", 403);
  if (!link.allow_create)
    fail("Max must enable event creation for this calendar first.", 403);
  const c = await deps.connection();
  if (c.status !== "connected" || !c.scopes?.includes(WRITE_SCOPE))
    fail(
      "Max must enable Google event creation and approve the new Google permission first.",
      409,
    );
  const event = normalizeNewEvent(body),
    fingerprint = createHash("sha256")
      .update(JSON.stringify(event))
      .digest("hex");
  const id = createHash("sha256")
    .update(
      `${link.calendar_id}:${identity.email}:${String(body.requestId).toLowerCase()}`,
    )
    .digest("hex");
  event.id = id;
  event.extendedProperties = {
    private: {
      kijiji_request: String(body.requestId).toLowerCase(),
      kijiji_client: link.client_id,
      kijiji_hash: fingerprint,
      kijiji_actor: identity.fullName || "Kijiji team",
    },
  };
  return deps.withLease(async (lease) => {
    const current = (
      await deps.store(
        `google_calendar_links?id=eq.${encodeURIComponent(body.linkId)}&enabled=eq.true&select=*`,
      )
    )[0];
    const liveConnection = await deps.connection();
    if (
      !current ||
      !current.allow_create ||
      current.client_id !== link.client_id ||
      current.calendar_id !== link.calendar_id
    )
      fail(
        "The calendar mapping changed. Refresh before adding this event.",
        409,
      );
    if (
      liveConnection.status !== "connected" ||
      !liveConnection.scopes?.includes(WRITE_SCOPE)
    )
      fail(
        "Google event access changed. Reconnect before adding this event.",
        409,
      );
    const token = await deps.accessToken();
    const shared = (await deps.calendars(token)).find(
      (cal) => cal.id === link.calendar_id,
    );
    if (!shared || !["writer", "owner"].includes(shared.accessRole))
      fail(
        "This calendar is view-only. Ask the client to share it with kijijimgmt@gmail.com using Make changes to events.",
        403,
      );
    const path = `calendars/${encodeURIComponent(link.calendar_id)}/events`;
    let saved,
      reused = false;
    try {
      saved = await deps.google(`${path}?sendUpdates=none`, token, {
        method: "POST",
        body: JSON.stringify(event),
      });
    } catch (error) {
      if (error.googleStatus === 409) {
        saved = await deps.google(`${path}/${id}`, token);
        if (
          saved.status === "cancelled" ||
          saved.extendedProperties?.private?.kijiji_hash !== fingerprint
        )
          fail(
            "This submission already created a different event. Refresh the calendar, then start a new event form.",
            409,
          );
        reused = true;
      } else if ([401, 403].includes(error.googleStatus))
        fail(
          "Google did not allow event creation. Confirm the client’s editing permission and reconnect Google with event access.",
          403,
        );
      else
        fail(
          "Google did not confirm the save. Keep this form open and retry; the same request will not add a duplicate.",
          502,
        );
    }
    let cached = false;
    try {
      cached = await deps.store("rpc/cache_created_google_event", {
        p_token: lease,
        p_link: link.id,
        p_event: deps.normalizeEvent(saved),
      });
    } catch {
      /* Google committed; do not report creation as failed if the local cache is delayed. */
    }
    return {
      id: saved.id,
      name: saved.summary || event.summary,
      cached: Boolean(cached),
      reused,
    };
  });
}
module.exports = { normalizeNewEvent, createClientEvent, WRITE_SCOPE };
