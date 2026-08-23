const crypto = require("crypto");

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_ALLOWED_TEAM_IDS = splitEnv(process.env.SLACK_ALLOWED_TEAM_IDS || process.env.SLACK_ALLOWED_TEAM_ID);
const SLACK_ALLOWED_CHANNEL_IDS = splitEnv(process.env.SLACK_ALLOWED_CHANNEL_IDS || process.env.SLACK_ALLOWED_CHANNEL_ID);
const SLACK_ALLOWED_USER_IDS = splitEnv(process.env.SLACK_ALLOWED_USER_IDS || process.env.SLACK_ALLOWED_USER_ID);

const DEFAULT_DATA_SOURCES = {
  clients: "03c5f70c-fb49-4d09-9de8-7fb8a45a04c7",
  actions: "662c1c0d-d255-4fe9-8260-5dc4f293b051",
  opportunities: "8548a9d4-1ffe-4787-90fc-3eb0a0085531",
  events: "4bf7373c-c744-4fe3-854e-ff0470954497",
};

const dataSources = {
  clients: normalizeId(process.env.NOTION_CLIENT_ROSTER_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.clients),
  actions: normalizeId(process.env.NOTION_ACTIONS_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.actions),
  opportunities: normalizeId(process.env.NOTION_OPPORTUNITIES_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.opportunities),
  events: normalizeId(process.env.NOTION_EVENTS_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.events),
};

function splitEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeId(value) {
  return String(value || "")
    .replace(/^collection:\/\//, "")
    .trim();
}

const json = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
};

const slackText = (response, statusCode, text) => {
  json(response, statusCode, {
    response_type: "ephemeral",
    text,
  });
};

const getHeader = (request, name) => {
  const headers = request.headers || {};
  const lower = name.toLowerCase();
  return headers[name] || headers[lower] || "";
};

const getRawBody = async (request) => {
  if (typeof request.body === "string") {
    return request.body;
  }

  if (Buffer.isBuffer(request.body)) {
    return request.body.toString("utf8");
  }

  if (request.rawBody) {
    return Buffer.isBuffer(request.rawBody) ? request.rawBody.toString("utf8") : String(request.rawBody);
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifySlackSignature = (request, rawBody) => {
  if (!SLACK_SIGNING_SECRET) {
    const error = new Error("SLACK_SIGNING_SECRET is not configured in Vercel.");
    error.statusCode = 503;
    throw error;
  }

  const timestamp = getHeader(request, "x-slack-request-timestamp");
  const signature = getHeader(request, "x-slack-signature");
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));

  if (!timestamp || !signature || !Number.isFinite(age) || age > 60 * 5) {
    const error = new Error("Slack request signature is missing or expired.");
    error.statusCode = 401;
    throw error;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = `v0=${crypto.createHmac("sha256", SLACK_SIGNING_SECRET).update(base).digest("hex")}`;

  if (!safeEqual(digest, signature)) {
    const error = new Error("Slack request signature is invalid.");
    error.statusCode = 401;
    throw error;
  }
};

const parseSlashBody = (rawBody) => {
  const params = new URLSearchParams(rawBody);
  return Object.fromEntries(params.entries());
};

const assertAllowedSlackContext = (payload) => {
  if (SLACK_ALLOWED_TEAM_IDS.length && !SLACK_ALLOWED_TEAM_IDS.includes(payload.team_id)) {
    const error = new Error("This Slack workspace is not allowed to use the Kijiji command.");
    error.statusCode = 403;
    throw error;
  }

  if (SLACK_ALLOWED_CHANNEL_IDS.length && !SLACK_ALLOWED_CHANNEL_IDS.includes(payload.channel_id)) {
    const error = new Error("Use this command from the approved #kijiji-ops channel.");
    error.statusCode = 403;
    throw error;
  }

  if (SLACK_ALLOWED_USER_IDS.length && !SLACK_ALLOWED_USER_IDS.includes(payload.user_id)) {
    const error = new Error("This Slack user is not allowed to update the Kijiji dashboard.");
    error.statusCode = 403;
    throw error;
  }
};

const parseCommandText = (text) => {
  const tokens = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const char of String(text || "")) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = "";
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  const action = String(tokens.shift() || "help").toLowerCase();
  const values = {};
  const extras = [];

  tokens.forEach((token) => {
    const separator = token.indexOf("=");
    if (separator > 0) {
      const key = token.slice(0, separator).trim().toLowerCase();
      values[key] = token.slice(separator + 1).trim();
    } else {
      extras.push(token);
    }
  });

  return { action, values, extras };
};

const booleanValue = (value) => ["1", "true", "yes", "y", "blocker", "blocked"].includes(String(value || "").toLowerCase());

const validateDate = (value, label) => {
  if (!value) return;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const error = new Error(`${label} must use YYYY-MM-DD format.`);
    error.statusCode = 400;
    throw error;
  }
};

const validateOwner = (owner) => {
  if (!["Maxwell", "Max", "Joe", "Erik", "Unassigned", ""].includes(owner)) {
    const error = new Error("owner must be Maxwell, Joe, Erik, or Unassigned.");
    error.statusCode = 400;
    throw error;
  }
};

const plainText = (property) => {
  if (!property) return "";
  if (property.type === "title") return property.title.map((item) => item.plain_text).join("");
  if (property.type === "rich_text") return property.rich_text.map((item) => item.plain_text).join("");
  return "";
};

const propertyByAliases = (properties, aliases) => {
  const key = aliases.find((alias) => Object.prototype.hasOwnProperty.call(properties || {}, alias));
  return key ? properties[key] : undefined;
};

const titleText = (properties, aliases) => plainText(propertyByAliases(properties, aliases));

const title = (value) => ({
  title: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [],
});

const richText = (value) => ({
  rich_text: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [],
});

const select = (value) => (value ? { select: { name: String(value).slice(0, 100) } } : { select: null });
const date = (value) => (value ? { date: { start: String(value) } } : { date: null });
const checkbox = (value) => ({ checkbox: Boolean(value) });
const relation = (ids) => ({ relation: ids.filter(Boolean).map((id) => ({ id })) });

const propertyForType = (schemaType, fallbackFactory, value) => {
  if (schemaType === "title") return title(value);
  if (schemaType === "rich_text") return richText(value);
  if (schemaType === "select") return select(value);
  if (schemaType === "status") return { status: value ? { name: String(value).slice(0, 100) } : null };
  if (schemaType === "date") return date(value);
  if (schemaType === "checkbox") return checkbox(value);
  return fallbackFactory(value);
};

const chooseSchemaKey = (schema, aliases, expectedType) => {
  const exact = aliases.find((alias) => Object.prototype.hasOwnProperty.call(schema || {}, alias));
  if (exact) return exact;
  return Object.entries(schema || {}).find(([, value]) => value?.type === expectedType)?.[0] || "";
};

const assignProperty = (properties, schema, aliases, expectedType, valueFactory, value) => {
  const key = chooseSchemaKey(schema, aliases, expectedType);
  if (!key) return;
  if (Object.prototype.hasOwnProperty.call(properties, key)) return;
  properties[key] = propertyForType(schema?.[key]?.type || expectedType, valueFactory, value);
};

const clientRelationAliases = ["Client", "Related Client", "Client Relation", "Client Roster", "Related Client Roster"];

const assignClientRelation = (properties, schema, client) => {
  const relationKey = chooseSchemaKey(schema, clientRelationAliases, "relation");
  if (relationKey && client) properties[relationKey] = relation([client.id]);
};

const notionRequest = async (path, options = {}) => {
  if (!NOTION_TOKEN) {
    const error = new Error("NOTION_TOKEN is not configured in Vercel.");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Notion request failed (${response.status}). ${details.slice(0, 250)}`);
    error.statusCode = response.status === 401 || response.status === 403 || response.status === 404 ? 502 : response.status;
    throw error;
  }

  return response.status === 204 ? null : response.json();
};

const getSourceSchema = async (sourceId) => {
  const data = await notionRequest(`/data_sources/${sourceId}`);
  return data.properties || {};
};

const queryDataSource = async (sourceId) => {
  const records = [];
  let cursor;

  do {
    const data = await notionRequest(`/data_sources/${sourceId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });

    records.push(...data.results.filter((item) => item.object === "page"));
    cursor = data.has_more ? data.next_cursor : "";
  } while (cursor);

  return records;
};

const getClients = async () => {
  const pages = await queryDataSource(dataSources.clients);
  return pages.map((page) => ({
    id: page.id,
    name: titleText(page.properties || {}, ["Client", "Name", "Client Name"]),
  }));
};

const findClient = async (clientName) => {
  if (!clientName) return null;
  const normalized = clientName.toLowerCase();
  const clients = await getClients();
  return clients.find((client) => client.name.toLowerCase() === normalized) || clients.find((client) => client.name.toLowerCase().includes(normalized)) || null;
};

const createPage = async (sourceId, properties) =>
  notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: sourceId },
      properties,
    }),
  });

const createTask = async (values) => {
  const titleValue = values.title || values.task || values.name;
  const owner = values.owner || "Unassigned";
  const dueDate = values.due || values.date || values.duedate || "";
  const clientName = values.client || "";

  if (!titleValue) throw Object.assign(new Error('task requires title="..."'), { statusCode: 400 });
  validateOwner(owner);
  validateDate(dueDate, "due");

  const [schema, client] = await Promise.all([getSourceSchema(dataSources.actions), findClient(clientName)]);
  const properties = {};
  assignProperty(properties, schema, ["Action", "Task", "Next Step", "Name", "Next Move"], "title", title, titleValue);
  assignProperty(properties, schema, ["Status", "Action Status"], "select", select, values.status || "Open");
  assignProperty(properties, schema, ["Owner", "Assigned Owner"], "select", select, owner);
  assignProperty(properties, schema, ["Priority", "Urgency"], "select", select, values.priority || "Normal");
  assignProperty(properties, schema, ["Due Date", "Date", "Next Date"], "date", date, dueDate);
  assignProperty(properties, schema, ["Blocker", "Blocked", "Is Blocker"], "checkbox", checkbox, booleanValue(values.blocker));
  assignProperty(properties, schema, ["Notes", "Details"], "rich_text", richText, values.notes || values.next || "");
  assignProperty(properties, schema, ["Client Name", "Client Text"], "rich_text", richText, client?.name || clientName);

  assignClientRelation(properties, schema, client);

  return createPage(dataSources.actions, properties);
};

const createOpportunity = async (values) => {
  const name = values.name || values.title || values.deal || values.opportunity;
  const owner = values.owner || "Unassigned";
  const dueDate = values.date || values.due || values.nextdate || "";
  const clientName = values.client || "";

  if (!name) throw Object.assign(new Error('deal requires name="..."'), { statusCode: 400 });
  validateOwner(owner);
  validateDate(dueDate, "date");

  const [schema, client] = await Promise.all([getSourceSchema(dataSources.opportunities), findClient(clientName)]);
  const properties = {};
  assignProperty(properties, schema, ["Opportunity", "Deal", "Name", "Title"], "title", title, name);
  assignProperty(properties, schema, ["Stage", "Status", "Pipeline Stage"], "select", select, values.stage || "New");
  assignProperty(properties, schema, ["Owner", "Assigned Owner"], "select", select, owner);
  assignProperty(properties, schema, ["Priority", "Urgency"], "select", select, values.priority || "Normal");
  assignProperty(properties, schema, ["Next Action Date", "Next Date", "Close Date", "Due Date", "Target Date"], "date", date, dueDate);
  assignProperty(properties, schema, ["Blocker", "Blocked", "Is Blocker"], "checkbox", checkbox, booleanValue(values.blocker));
  assignProperty(properties, schema, ["Next Step", "Next Move", "Next Action", "Notes"], "rich_text", richText, values.next || values.notes || "");
  assignProperty(properties, schema, ["Client Name", "Client Text"], "rich_text", richText, client?.name || clientName);

  assignClientRelation(properties, schema, client);

  return createPage(dataSources.opportunities, properties);
};

const createEvent = async (values) => {
  const name = values.name || values.title || values.event;
  const owner = values.owner || "Unassigned";
  const eventDate = values.date || values.due || "";
  const clientName = values.client || "";

  if (!name) throw Object.assign(new Error('event requires name="..."'), { statusCode: 400 });
  validateOwner(owner);
  validateDate(eventDate, "date");

  const [schema, client] = await Promise.all([getSourceSchema(dataSources.events), findClient(clientName)]);
  const properties = {};
  assignProperty(properties, schema, ["Event", "Release", "Name", "Title"], "title", title, name);
  assignProperty(properties, schema, ["Type", "Event Type", "Release Type"], "select", select, values.type || "Event");
  assignProperty(properties, schema, ["Status", "Event Status"], "select", select, values.status || "Planned");
  assignProperty(properties, schema, ["Owner", "Lead"], "select", select, owner);
  assignProperty(properties, schema, ["Date", "Release Date", "Event Date"], "date", date, eventDate);
  assignProperty(properties, schema, ["Notes", "Details"], "rich_text", richText, values.notes || values.next || "");
  assignProperty(properties, schema, ["Client Name", "Client Text"], "rich_text", richText, client?.name || clientName);

  assignClientRelation(properties, schema, client);

  return createPage(dataSources.events, properties);
};

const getStatus = async () => {
  const [clients, actions, opportunities, events] = await Promise.all([
    queryDataSource(dataSources.clients),
    queryDataSource(dataSources.actions),
    queryDataSource(dataSources.opportunities),
    queryDataSource(dataSources.events),
  ]);

  return `Kijiji dashboard: ${clients.length} clients, ${actions.length} tasks, ${opportunities.length} deals, ${events.length} events/releases.`;
};

const helpText = () =>
  [
    "Use `/kijiji` with one of these commands:",
    '• `help`',
    "• `status`",
    '• `task title="Send launch plan" owner=Maxwell due=2026-08-30 client="Broshigeez" priority=High blocker=yes notes="Waiting on assets"`',
    '• `deal name="Brand partnership" stage=Pitching owner=Joe date=2026-09-04 client="Andra Pastry Chef" next="Send scope"`',
    '• `event name="Single release" type=Release date=2026-09-12 owner=Erik client="Bobby Outside" notes="Assets due Friday"`',
    "Commands only create new records. Edit existing records in the dashboard.",
  ].join("\n");

const executeCommand = async ({ action, values }) => {
  if (action === "help" || action === "") return helpText();
  if (action === "status") return getStatus();

  if (action === "task") {
    const page = await createTask(values);
    return `Task created: ${page.url}`;
  }

  if (action === "deal" || action === "opportunity") {
    const page = await createOpportunity(values);
    return `Deal created: ${page.url}`;
  }

  if (action === "event" || action === "release") {
    const page = await createEvent(values);
    return `Event created: ${page.url}`;
  }

  throw Object.assign(new Error(`Unknown command "${action}". Try /kijiji help.`), { statusCode: 400 });
};

module.exports = async (request, response) => {
  try {
    if (request.method !== "POST") {
      slackText(response, 405, "Use the /kijiji Slack slash command.");
      return;
    }

    const rawBody = await getRawBody(request);
    verifySlackSignature(request, rawBody);

    const payload = parseSlashBody(rawBody);
    assertAllowedSlackContext(payload);

    const parsed = parseCommandText(payload.text || "");
    const text = await executeCommand(parsed);
    slackText(response, 200, text);
  } catch (error) {
    console.error(error);
    slackText(response, error.statusCode || 500, error.message || "Unable to process the Kijiji command.");
  }
};
