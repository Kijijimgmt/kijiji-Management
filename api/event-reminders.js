const { notifyEventReminder } = require("./lib/partner-notifications");

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const EVENTS_DATA_SOURCE_ID = String(
  process.env.NOTION_EVENTS_DATA_SOURCE_ID || "4bf7373c-c744-4fe3-854e-ff0470954497"
).replace(/^collection:\/\//, "").trim();
const TIME_ZONE = "America/Los_Angeles";

const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "private, no-store");
  response.end(JSON.stringify(body));
};

const assertCronAccess = (request) => {
  const secret = process.env.CRON_SECRET;
  const authorization = String(request.headers.authorization || request.headers.Authorization || "");
  if (!secret || authorization !== `Bearer ${secret}`) {
    const error = new Error("Event reminder access denied.");
    error.statusCode = 401;
    throw error;
  }
};

const notionRequest = async (path, options = {}) => {
  if (!NOTION_TOKEN) throw Object.assign(new Error("Notion is not configured."), { statusCode: 503 });
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw Object.assign(new Error(`Notion reminder query failed (${response.status}).`), { statusCode: 502 });
  return response.json();
};

const propertyByAliases = (properties, aliases) => {
  const key = aliases.find((alias) => Object.prototype.hasOwnProperty.call(properties || {}, alias));
  return key ? properties[key] : undefined;
};
const plainText = (property) => {
  const values = property?.title || property?.rich_text || [];
  return values.map((item) => item.plain_text || item.text?.content || "").join("");
};
const selectName = (property) => property?.select?.name || property?.status?.name || plainText(property);
const dateStart = (property) => property?.date?.start || "";

const mapEvent = (page) => {
  const properties = page.properties || {};
  return {
    id: page.id,
    name: plainText(propertyByAliases(properties, ["Event", "Release", "Name", "Title"])) || "Event",
    type: selectName(propertyByAliases(properties, ["Type", "Event Type", "Release Type"])) || "Event",
    status: selectName(propertyByAliases(properties, ["Status", "Event Status"])),
    owner: selectName(propertyByAliases(properties, ["Owner", "Lead"])) || "Unassigned",
    date: dateStart(propertyByAliases(properties, ["Date", "Release Date", "Event Date"])),
    notes: plainText(propertyByAliases(properties, ["Notes", "Details"])),
    clientName: plainText(propertyByAliases(properties, ["Client Name", "Client Text"])),
  };
};

const queryEvents = async () => {
  const results = [];
  let cursor;
  do {
    const data = await notionRequest(`/data_sources/${EVENTS_DATA_SOURCE_ID}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results.map(mapEvent);
};

const zonedDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce((values, part) => ({ ...values, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const eventCalendarDate = (value) => {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : zonedDate(date);
};

const tomorrowInLosAngeles = (now = new Date()) => {
  const parts = zonedDate(now).split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1)).toISOString().slice(0, 10);
};

module.exports = async (request, response) => {
  try {
    if (request.method !== "GET") return json(response, 405, { error: "method_not_allowed" });
    assertCronAccess(request);
    const reminderDate = tomorrowInLosAngeles();
    const inactive = new Set(["cancelled", "canceled", "complete", "completed", "done"]);
    const events = (await queryEvents()).filter((event) =>
      eventCalendarDate(event.date) === reminderDate && !inactive.has(String(event.status || "").trim().toLowerCase())
    );
    const results = [];
    for (const event of events) {
      results.push({ id: event.id, ...(await notifyEventReminder(event, `reminder-${reminderDate}`)) });
    }
    return json(response, 200, {
      ok: true,
      reminderDate,
      eventsFound: events.length,
      remindersSent: results.filter((result) => result.sent).length,
      duplicatesSkipped: results.filter((result) => result.duplicate).length,
    });
  } catch (error) {
    console.error(`Event reminder job failed: ${error.message}`);
    return json(response, error.statusCode || 500, { error: "event_reminder_failed", message: error.message });
  }
};
