const { assertWritesAllowed, logActivity } = require("./lib/kijiji-ops");
const {
  assertCanManageClient,
  assertCanManageOwnedRecord,
  assignMemberOwner,
  filterDashboardForIdentity,
  verifyTeamAccess,
} = require("./lib/kijiji-auth");

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const DEFAULT_DATA_SOURCES = {
  clients: "03c5f70c-fb49-4d09-9de8-7fb8a45a04c7",
  actions: "662c1c0d-d255-4fe9-8260-5dc4f293b051",
  opportunities: "8548a9d4-1ffe-4787-90fc-3eb0a0085531",
  events: "4bf7373c-c744-4fe3-854e-ff0470954497",
};

const dataSources = {
  clients: process.env.NOTION_CLIENT_ROSTER_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.clients,
  actions: process.env.NOTION_ACTIONS_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.actions,
  opportunities: process.env.NOTION_OPPORTUNITIES_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.opportunities,
  events: process.env.NOTION_EVENTS_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.events,
};

const json = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
};

const parseBody = (body) => {
  if (!body) {
    return {};
  }

  return typeof body === "string" ? JSON.parse(body) : body;
};

const normalizeId = (value) =>
  String(value || "")
    .replace(/^collection:\/\//, "")
    .trim();

Object.keys(dataSources).forEach((key) => {
  dataSources[key] = normalizeId(dataSources[key]);
});

const getNotionFailureMessage = (status, details) => {
  if (status === 401) {
    return "Notion rejected the integration token. Update NOTION_TOKEN in Vercel.";
  }

  if (status === 403 || status === 404) {
    return "Notion could not access one of the shared Kijiji operating databases. Share the Client Roster, Actions, Opportunities & Deals, and Events & Releases data sources with the Notion integration.";
  }

  return `Notion request failed (${status}). ${String(details || "").slice(0, 500)}`;
};

const notionRequest = async (path, options = {}) => {
  if (!NOTION_TOKEN) {
    const error = new Error("Notion integration token is not configured in Vercel.");
    error.statusCode = 503;
    error.code = "notion_not_configured";
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
    const error = new Error(getNotionFailureMessage(response.status, details));
    error.statusCode = response.status === 401 || response.status === 403 || response.status === 404 ? 502 : response.status;
    error.code = response.status === 403 || response.status === 404 ? "notion_access_missing" : "notion_request_failed";
    error.details = details;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

const propertyByAliases = (properties, aliases) => {
  const key = aliases.find((alias) => Object.prototype.hasOwnProperty.call(properties, alias));
  return key ? properties[key] : undefined;
};

const plainText = (property) => {
  if (!property) {
    return "";
  }

  if (property.type === "title") {
    return property.title.map((item) => item.plain_text).join("");
  }

  if (property.type === "rich_text") {
    return property.rich_text.map((item) => item.plain_text).join("");
  }

  if (property.type === "formula") {
    return property.formula?.string || "";
  }

  return "";
};

const titleText = (properties, aliases) => plainText(propertyByAliases(properties, aliases));
const selectName = (property) => property?.select?.name || property?.status?.name || "";
const multiSelectNames = (property) => property?.multi_select?.map((item) => item.name) || [];
const dateStart = (property) => property?.date?.start || "";
const numberValue = (property) => (typeof property?.number === "number" ? property.number : 0);
const checkboxValue = (property) => Boolean(property?.checkbox);
const blockerValue = (property) => checkboxValue(property) || Boolean(plainText(property).trim());
const emailValue = (property) => property?.email || "";
const phoneValue = (property) => property?.phone_number || "";
const relationIds = (property) => property?.relation?.map((item) => item.id) || [];

const richText = (value) => ({
  rich_text: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [],
});

const title = (value) => ({
  title: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [],
});

const select = (value) => (value ? { select: { name: String(value).slice(0, 100) } } : { select: null });
const status = (value) => (value ? { status: { name: String(value).slice(0, 100) } } : { status: null });

const multiSelect = (values) => ({
  multi_select: (Array.isArray(values) ? values : String(values || "").split(","))
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((name) => ({ name: name.slice(0, 100) })),
});

const date = (value) => (value ? { date: { start: String(value) } } : { date: null });
const email = (value) => ({ email: value ? String(value).slice(0, 200) : null });
const phoneNumber = (value) => ({ phone_number: value ? String(value).slice(0, 200) : null });
const number = (value) => ({ number: Number.isFinite(Number(value)) ? Number(value) : null });
const checkbox = (value) => ({ checkbox: Boolean(value) });
const relation = (ids) => ({ relation: (Array.isArray(ids) ? ids : []).filter(Boolean).map((id) => ({ id })) });

const chooseSchemaKey = (schema, aliases, expectedType) => {
  const entries = Object.entries(schema || {});
  const match = aliases.find((alias) => Object.prototype.hasOwnProperty.call(schema || {}, alias));

  if (match) {
    return match;
  }

  const typeMatch = expectedType ? entries.find(([, value]) => value?.type === expectedType)?.[0] : "";
  return typeMatch || match || "";
};

const propertyForType = (schemaType, fallbackFactory, value) => {
  if (schemaType === "title") return title(value);
  if (schemaType === "rich_text") return richText(value);
  if (schemaType === "select") return select(value);
  if (schemaType === "status") return status(value);
  if (schemaType === "multi_select") return multiSelect(value);
  if (schemaType === "date") return date(value);
  if (schemaType === "email") return email(value);
  if (schemaType === "phone_number") return phoneNumber(value);
  if (schemaType === "number") return number(value);
  if (schemaType === "checkbox") return checkbox(value);
  return fallbackFactory(value);
};

const assignProperty = (properties, schema, aliases, expectedType, valueFactory, value) => {
  const key = chooseSchemaKey(schema, aliases, expectedType);

  if (!key) {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(properties, key)) {
    return;
  }

  const schemaType = schema?.[key]?.type || expectedType;
  properties[key] = propertyForType(schemaType, valueFactory, value);
};

const clientRelationAliases = [
  "Client / Initiative",
  "Client",
  "Related Client",
  "Client Relation",
  "Client Roster",
  "Related Client Roster",
];

const assignClientRelation = (properties, schema, clientId) => {
  const relationKey = chooseSchemaKey(schema, clientRelationAliases, "relation");

  if (relationKey) {
    properties[relationKey] = relation(clientId ? [clientId] : []);
  }
};

const getSourceSchema = async (sourceId) => {
  const data = await notionRequest(`/data_sources/${sourceId}`);
  return data.properties || {};
};

const queryDataSource = async (sourceId, body = {}) => {
  const records = [];
  let cursor;

  do {
    const data = await notionRequest(`/data_sources/${sourceId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        ...body,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });

    records.push(...data.results.filter((item) => item.object === "page"));
    cursor = data.has_more ? data.next_cursor : "";
  } while (cursor);

  return records;
};

const mapPageToClient = (page) => {
  const properties = page.properties || {};
  const type = multiSelectNames(propertyByAliases(properties, ["Type", "Client Type", "Category"]));

  return {
    id: page.id,
    url: page.url,
    name: titleText(properties, ["Client", "Name", "Client Name"]),
    category: type.join(", "),
    type,
    status: selectName(propertyByAliases(properties, ["Status", "Stage"])) || "Prospect",
    owner: plainText(propertyByAliases(properties, ["Primary Owner", "Owner", "Assigned Owner"])),
    stage: plainText(propertyByAliases(properties, ["Current Offer", "Offer", "Scope", "Stage"])),
    progress: numberValue(propertyByAliases(properties, ["Progress", "Project Progress"])),
    nextAction: plainText(propertyByAliases(properties, ["Next Move", "Next Action", "Next Step"])),
    focusLevel: selectName(propertyByAliases(properties, ["Focus Level", "Focus", "Priority"])) || "Normal",
    dueDate: dateStart(propertyByAliases(properties, ["Next Action Date", "Next Date", "Due Date", "Last Touch"])),
    lastTouch: dateStart(propertyByAliases(properties, ["Last Touch", "Last Contact", "Updated"])),
    email: emailValue(propertyByAliases(properties, ["Contact Email", "Email"])),
    phone: phoneValue(propertyByAliases(properties, ["Contact Phone", "Phone"])),
    leadSource: selectName(propertyByAliases(properties, ["Lead Source", "Source"])),
    notes: plainText(propertyByAliases(properties, ["Notes", "Internal Notes"])),
  };
};

const mapPageToAction = (page) => {
  const properties = page.properties || {};
  const clientRelation = relationIds(propertyByAliases(properties, clientRelationAliases));

  return {
    id: page.id,
    url: page.url,
    title: titleText(properties, ["Action", "Task", "Next Step", "Name", "Next Move"]) || "Untitled action",
    status: selectName(propertyByAliases(properties, ["Status", "Action Status"])) || "Open",
    owner: selectName(propertyByAliases(properties, ["Owner", "Assigned Owner"])) || plainText(propertyByAliases(properties, ["Owner", "Assigned Owner"])),
    priority: selectName(propertyByAliases(properties, ["Priority", "Urgency"])) || "Normal",
    dueDate: dateStart(propertyByAliases(properties, ["Due Date", "Date", "Next Date"])),
    clientIds: clientRelation,
    clientName: plainText(propertyByAliases(properties, ["Client Name", "Client Text", "Client"])),
    blocker: blockerValue(propertyByAliases(properties, ["Blocker", "Blocked", "Is Blocker"])),
    notes: plainText(propertyByAliases(properties, ["Notes", "Details"])),
  };
};

const mapPageToOpportunity = (page) => {
  const properties = page.properties || {};

  return {
    id: page.id,
    url: page.url,
    name: titleText(properties, ["Opportunity", "Deal", "Name", "Title"]) || "Untitled opportunity",
    stage: selectName(propertyByAliases(properties, ["Stage", "Status", "Pipeline Stage"])) || "New",
    owner: selectName(propertyByAliases(properties, ["Owner", "Assigned Owner"])) || plainText(propertyByAliases(properties, ["Owner", "Assigned Owner"])),
    priority: selectName(propertyByAliases(properties, ["Priority", "Urgency"])) || "",
    clientIds: relationIds(propertyByAliases(properties, clientRelationAliases)),
    clientName: plainText(propertyByAliases(properties, ["Client Name", "Client Text", "Client"])),
    nextStep: plainText(propertyByAliases(properties, ["Next Step", "Next Move", "Next Action", "Notes"])),
    dueDate: dateStart(propertyByAliases(properties, ["Next Follow-up", "Next Action Date", "Next Date", "Close Date", "Due Date", "Target Date"])),
    blocker: blockerValue(propertyByAliases(properties, ["Blocker", "Blocked", "Is Blocker"])),
  };
};

const mapPageToEvent = (page) => {
  const properties = page.properties || {};

  return {
    id: page.id,
    url: page.url,
    name: titleText(properties, ["Event / Release", "Event", "Release", "Name", "Title"]) || "Untitled event",
    type: selectName(propertyByAliases(properties, ["Type", "Event Type", "Release Type"])) || "",
    status: selectName(propertyByAliases(properties, ["Status", "Event Status"])) || "",
    owner: selectName(propertyByAliases(properties, ["Owner", "Lead"])) || plainText(propertyByAliases(properties, ["Owner", "Lead"])),
    date: dateStart(propertyByAliases(properties, ["Date", "Release Date", "Event Date"])),
    clientIds: relationIds(propertyByAliases(properties, clientRelationAliases)),
    clientName: plainText(propertyByAliases(properties, ["Client Name", "Client Text", "Client"])),
    notes: plainText(propertyByAliases(properties, ["Next Step", "Notes", "Details"])),
  };
};

const normalizeClientInput = (body) => ({
  id: String(body.id || "").trim(),
  name: String(body.name || "").trim(),
  type: Array.isArray(body.type) ? body.type : String(body.category || body.type || "").split(","),
  status: String(body.status || "Prospect").trim(),
  owner: String(body.owner || "").trim(),
  stage: String(body.stage || "").trim(),
  nextAction: String(body.nextAction || "").trim(),
  focusLevel: String(body.focusLevel || "Normal").trim(),
  progress: Number(body.progress || 0),
  lastTouch: String(body.lastTouch || body.dueDate || "").trim(),
  dueDate: String(body.dueDate || body.lastTouch || "").trim(),
  email: String(body.email || "").trim(),
  phone: String(body.phone || "").trim(),
  leadSource: String(body.leadSource || body.channel || "").trim(),
  notes: String(body.notes || "").trim(),
});

const normalizeActionInput = (body) => ({
  id: String(body.id || "").trim(),
  title: String(body.title || body.nextStep || body.action || "").trim(),
  status: String(body.status || "Open").trim(),
  owner: String(body.owner || "").trim(),
  priority: String(body.priority || "Normal").trim(),
  dueDate: String(body.dueDate || "").trim(),
  clientId: String(body.clientId || "").trim(),
  clientName: String(body.clientName || "").trim(),
  blocker: Boolean(body.blocker),
  notes: String(body.notes || "").trim(),
});

const normalizeOpportunityInput = (body) => ({
  id: String(body.id || "").trim(),
  name: String(body.name || body.opportunity || body.deal || "").trim(),
  stage: String(body.stage || "New").trim(),
  owner: String(body.owner || "Unassigned").trim(),
  priority: String(body.priority || "Normal").trim(),
  dueDate: String(body.dueDate || body.nextActionDate || "").trim(),
  clientId: String(body.clientId || "").trim(),
  clientName: String(body.clientName || "").trim(),
  blocker: Boolean(body.blocker),
  nextStep: String(body.nextStep || body.notes || "").trim(),
});

const normalizeEventInput = (body) => ({
  id: String(body.id || "").trim(),
  name: String(body.name || body.event || body.release || "").trim(),
  type: String(body.type || "Event").trim(),
  status: String(body.status || "Planned").trim(),
  owner: String(body.owner || "Unassigned").trim(),
  date: String(body.date || body.dueDate || "").trim(),
  clientId: String(body.clientId || "").trim(),
  clientName: String(body.clientName || "").trim(),
  notes: String(body.notes || "").trim(),
});

const validateDate = (value, fieldName) => {
  if (!value) {
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const error = new Error(`${fieldName} must use YYYY-MM-DD format.`);
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }
};

const validateClient = (client) => {
  if (!client.name) {
    const error = new Error("Client name is required.");
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }

  validateDate(client.lastTouch, "Last touch");
  validateDate(client.dueDate, "Due date");
};

const validateAction = (action) => {
  if (!action.title) {
    const error = new Error("Action title is required.");
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }

  if (!["Maxwell", "Max", "Joe", "Erik", "Unassigned", ""].includes(action.owner)) {
    const error = new Error("Owner must be Maxwell, Joe, Erik, or Unassigned.");
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }

  validateDate(action.dueDate, "Due date");
};

const validateOwner = (owner) => {
  if (!["Maxwell", "Max", "Joe", "Erik", "Unassigned", ""].includes(owner)) {
    const error = new Error("Owner must be Maxwell, Joe, Erik, or Unassigned.");
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }
};

const validateOpportunity = (opportunity) => {
  if (!opportunity.name) {
    const error = new Error("Opportunity name is required.");
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }

  validateOwner(opportunity.owner);
  validateDate(opportunity.dueDate, "Next action date");
};

const validateEvent = (event) => {
  if (!event.name) {
    const error = new Error("Event name is required.");
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }

  validateOwner(event.owner);
  validateDate(event.date, "Event date");
};

const isSlackConfigured = () => Boolean(String(SLACK_WEBHOOK_URL || "").trim());

const compact = (value, fallback = "Not set") => {
  const text = String(value || "").trim();
  return text ? text.slice(0, 180) : fallback;
};

const getResourceTitle = (resource, item) => {
  if (resource === "action") return item.title;
  return item.name;
};

const getSlackResourceLabel = (resource) => {
  if (resource === "action") return "Task";
  if (resource === "opportunity") return "Deal";
  if (resource === "event") return "Event";
  return "Record";
};

const getSlackFields = (resource, input) => {
  if (resource === "action") {
    return [
      `Status: ${compact(input.status)}`,
      `Owner: ${compact(input.owner || "Unassigned")}`,
      `Priority: ${compact(input.priority || "Normal")}`,
      `Due: ${compact(input.dueDate)}`,
      `Client: ${compact(input.clientName)}`,
      `Next: ${compact(input.notes)}`,
    ];
  }

  if (resource === "opportunity") {
    return [
      `Stage: ${compact(input.stage)}`,
      `Owner: ${compact(input.owner || "Unassigned")}`,
      `Priority: ${compact(input.priority || "Normal")}`,
      `Next action: ${compact(input.dueDate)}`,
      `Client: ${compact(input.clientName)}`,
      `Next: ${compact(input.nextStep)}`,
    ];
  }

  return [
    `Type: ${compact(input.type)}`,
    `Status: ${compact(input.status)}`,
    `Owner: ${compact(input.owner || "Unassigned")}`,
    `Date: ${compact(input.date)}`,
    `Client: ${compact(input.clientName)}`,
    `Notes: ${compact(input.notes)}`,
  ];
};

const notifySlack = async ({ resource, operation, input, saved }) => {
  if (!isSlackConfigured()) {
    return;
  }

  const label = getSlackResourceLabel(resource);
  const isBlocker = Boolean(input.blocker);
  const headline = `${isBlocker ? ":rotating_light: BLOCKER " : ""}${label} ${operation === "created" ? "created" : "updated"}: ${compact(getResourceTitle(resource, saved))}`;
  const fields = getSlackFields(resource, input)
    .filter((line) => !line.endsWith(": Not set"))
    .slice(0, 6);
  const notionLine = saved.url ? `\nNotion: ${saved.url}` : "";
  const text = [`${headline}`, ...fields.map((line) => `- ${line}`)].join("\n") + notionLine;

  let timeout;
  try {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    timeout = controller ? setTimeout(() => controller.abort(), 1500) : null;
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(controller ? { signal: controller.signal } : {}),
      body: JSON.stringify({
        text,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    if (!response.ok) {
      console.warn(`Slack notification failed with status ${response.status}.`);
    }
  } catch (error) {
    console.warn(`Slack notification failed: ${error.message}`);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const auditSummary = (resource, input, saved) => {
  if (resource === "action") {
    return `Task ${saved.title || input.title}; owner ${input.owner || "Unassigned"}; status ${input.status || "Open"}; client ${
      input.clientName || "No client"
    }.`;
  }

  if (resource === "client") {
    return `Client ${saved.name || input.name}; owner ${input.owner || "Unassigned"}; status ${input.status || "Prospect"}.`;
  }

  if (resource === "opportunity") {
    return `Opportunity ${saved.name || input.name}; owner ${input.owner || "Unassigned"}; stage ${input.stage || "New"}; client ${
      input.clientName || "No client"
    }.`;
  }

  return `Event ${saved.name || input.name}; owner ${input.owner || "Unassigned"}; status ${input.status || "Planned"}; client ${
    input.clientName || "No client"
  }.`;
};

const getExistingRecord = async (resource, id) => {
  const data = await notionRequest(`/pages/${id}`);
  if (resource === "action") return mapPageToAction(data);
  if (resource === "opportunity") return mapPageToOpportunity(data);
  if (resource === "event") return mapPageToEvent(data);
  if (resource === "client") return mapPageToClient(data);
  return null;
};

const enforceTeamWriteScope = async (resource, record, identity, method) => {
  if (resource === "client") {
    assertCanManageClient(identity);
    return;
  }

  if (identity.isAdmin) {
    return;
  }

  if (method === "PATCH") {
    if (!record.id) {
      const error = new Error("Record id is required.");
      error.statusCode = 400;
      error.code = "validation_error";
      throw error;
    }

    const existing = await getExistingRecord(resource, record.id);
    const labels = {
      action: "Task",
      opportunity: "Opportunity",
      event: "Event",
    };
    assertCanManageOwnedRecord(existing, identity, labels[resource] || "Record");
  }

  assignMemberOwner(record, identity);
};

const auditWrite = async ({ resource, operation, input, saved, identity }) =>
  logActivity({
    actor: identity?.email || identity?.fullName || "Portal session",
    source: "portal",
    action: operation,
    resource,
    resourceId: saved.id,
    resourceUrl: saved.url,
    summary: auditSummary(resource, input, saved),
  });

const clientProperties = (client, schema) => {
  const properties = {};

  assignProperty(properties, schema, ["Client", "Name", "Client Name"], "title", title, client.name);
  assignProperty(properties, schema, ["Type", "Client Type", "Category"], "multi_select", multiSelect, client.type);
  assignProperty(properties, schema, ["Status", "Stage"], "select", select, client.status);
  assignProperty(properties, schema, ["Primary Owner", "Owner", "Assigned Owner"], "rich_text", richText, client.owner);
  assignProperty(properties, schema, ["Current Offer", "Offer", "Scope"], "rich_text", richText, client.stage);
  assignProperty(properties, schema, ["Next Move", "Next Action", "Next Step"], "rich_text", richText, client.nextAction);
  assignProperty(properties, schema, ["Focus Level", "Focus", "Priority"], "select", select, client.focusLevel);
  assignProperty(properties, schema, ["Progress", "Project Progress"], "number", number, Math.max(0, Math.min(100, client.progress)));
  assignProperty(properties, schema, ["Last Touch", "Last Contact", "Updated"], "date", date, client.lastTouch);
  assignProperty(properties, schema, ["Next Date", "Due Date"], "date", date, client.dueDate);
  assignProperty(properties, schema, ["Contact Email", "Email"], "email", email, client.email);
  assignProperty(properties, schema, ["Contact Phone", "Phone"], "phone_number", phoneNumber, client.phone);
  assignProperty(properties, schema, ["Lead Source", "Source"], "select", select, client.leadSource);
  assignProperty(properties, schema, ["Notes", "Internal Notes"], "rich_text", richText, client.notes);

  return properties;
};

const actionProperties = (action, schema) => {
  const properties = {};

  assignProperty(properties, schema, ["Action", "Task", "Next Step", "Name", "Next Move"], "title", title, action.title);
  assignProperty(properties, schema, ["Status", "Action Status"], "select", select, action.status);
  assignProperty(properties, schema, ["Owner", "Assigned Owner"], "select", select, action.owner || "Unassigned");
  assignProperty(properties, schema, ["Priority", "Urgency"], "select", select, action.priority);
  assignProperty(properties, schema, ["Due Date", "Date", "Next Date"], "date", date, action.dueDate);
  assignProperty(properties, schema, ["Blocker", "Blocked", "Is Blocker"], "checkbox", checkbox, action.blocker);
  assignProperty(properties, schema, ["Notes", "Details"], "rich_text", richText, action.notes);

  assignClientRelation(properties, schema, action.clientId);

  assignProperty(properties, schema, ["Client Name", "Client Text"], "rich_text", richText, action.clientName);

  return properties;
};

const opportunityProperties = (opportunity, schema) => {
  const properties = {};

  assignProperty(properties, schema, ["Opportunity", "Deal", "Name", "Title"], "title", title, opportunity.name);
  assignProperty(properties, schema, ["Stage", "Status", "Pipeline Stage"], "select", select, opportunity.stage);
  assignProperty(properties, schema, ["Owner", "Assigned Owner"], "select", select, opportunity.owner || "Unassigned");
  assignProperty(properties, schema, ["Priority", "Urgency"], "select", select, opportunity.priority);
  assignProperty(properties, schema, ["Next Action Date", "Next Date", "Close Date", "Due Date", "Target Date"], "date", date, opportunity.dueDate);
  assignProperty(properties, schema, ["Blocker", "Blocked", "Is Blocker"], "checkbox", checkbox, opportunity.blocker);
  assignProperty(properties, schema, ["Next Step", "Next Move", "Next Action", "Notes"], "rich_text", richText, opportunity.nextStep);

  assignClientRelation(properties, schema, opportunity.clientId);

  assignProperty(properties, schema, ["Client Name", "Client Text"], "rich_text", richText, opportunity.clientName);

  return properties;
};

const eventProperties = (event, schema) => {
  const properties = {};

  assignProperty(properties, schema, ["Event", "Release", "Name", "Title"], "title", title, event.name);
  assignProperty(properties, schema, ["Type", "Event Type", "Release Type"], "select", select, event.type);
  assignProperty(properties, schema, ["Status", "Event Status"], "select", select, event.status);
  assignProperty(properties, schema, ["Owner", "Lead"], "select", select, event.owner || "Unassigned");
  assignProperty(properties, schema, ["Date", "Release Date", "Event Date"], "date", date, event.date);
  assignProperty(properties, schema, ["Notes", "Details"], "rich_text", richText, event.notes);

  assignClientRelation(properties, schema, event.clientId);

  assignProperty(properties, schema, ["Client Name", "Client Text"], "rich_text", richText, event.clientName);

  return properties;
};

const listDashboard = async () => {
  const [clientPages, actionPages, opportunityPages, eventPages] = await Promise.all([
    queryDataSource(dataSources.clients),
    queryDataSource(dataSources.actions),
    queryDataSource(dataSources.opportunities),
    queryDataSource(dataSources.events),
  ]);

  return {
    clients: clientPages.map(mapPageToClient),
    actions: actionPages.map(mapPageToAction),
    opportunities: opportunityPages.map(mapPageToOpportunity),
    events: eventPages.map(mapPageToEvent),
    source: {
      type: "notion",
      notionVersion: NOTION_VERSION,
      dataSources,
    },
  };
};

const createClient = async (client) => {
  validateClient(client);
  const schema = await getSourceSchema(dataSources.clients);
  const data = await notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSources.clients },
      properties: clientProperties(client, schema),
    }),
  });

  return mapPageToClient(data);
};

const updateClient = async (client) => {
  if (!client.id) {
    const error = new Error("Client id is required.");
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }

  validateClient(client);
  const schema = await getSourceSchema(dataSources.clients);
  const data = await notionRequest(`/pages/${client.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: clientProperties(client, schema),
    }),
  });

  return mapPageToClient(data);
};

const createAction = async (action) => {
  validateAction(action);
  const schema = await getSourceSchema(dataSources.actions);
  const data = await notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSources.actions },
      properties: actionProperties(action, schema),
    }),
  });

  return mapPageToAction(data);
};

const updateAction = async (action) => {
  if (!action.id) {
    const error = new Error("Action id is required.");
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }

  validateAction(action);
  const schema = await getSourceSchema(dataSources.actions);
  const data = await notionRequest(`/pages/${action.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: actionProperties(action, schema),
    }),
  });

  return mapPageToAction(data);
};

const createOpportunity = async (opportunity) => {
  validateOpportunity(opportunity);
  const schema = await getSourceSchema(dataSources.opportunities);
  const data = await notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSources.opportunities },
      properties: opportunityProperties(opportunity, schema),
    }),
  });

  return mapPageToOpportunity(data);
};

const updateOpportunity = async (opportunity) => {
  if (!opportunity.id) {
    const error = new Error("Opportunity id is required.");
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }

  validateOpportunity(opportunity);
  const schema = await getSourceSchema(dataSources.opportunities);
  const data = await notionRequest(`/pages/${opportunity.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: opportunityProperties(opportunity, schema),
    }),
  });

  return mapPageToOpportunity(data);
};

const createEvent = async (event) => {
  validateEvent(event);
  const schema = await getSourceSchema(dataSources.events);
  const data = await notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSources.events },
      properties: eventProperties(event, schema),
    }),
  });

  return mapPageToEvent(data);
};

const updateEvent = async (event) => {
  if (!event.id) {
    const error = new Error("Event id is required.");
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }

  validateEvent(event);
  const schema = await getSourceSchema(dataSources.events);
  const data = await notionRequest(`/pages/${event.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: eventProperties(event, schema),
    }),
  });

  return mapPageToEvent(data);
};

module.exports = async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    const identity = await verifyTeamAccess(request);

    if (request.method === "GET") {
      const dashboard = await listDashboard();
      json(response, 200, filterDashboardForIdentity(dashboard, identity));
      return;
    }

    if (request.method === "POST" || request.method === "PATCH") {
      assertWritesAllowed();
      const body = parseBody(request.body);
      const resource = String(body.resource || "client");
      const operation = request.method === "POST" ? "created" : "updated";

      if (resource === "action") {
        const action = normalizeActionInput(body);
        await enforceTeamWriteScope(resource, action, identity, request.method);
        const savedAction = request.method === "POST" ? await createAction(action) : await updateAction(action);
        await auditWrite({ resource, operation, input: action, saved: savedAction, identity });
        await notifySlack({
          resource,
          operation,
          input: action,
          saved: savedAction,
        });
        json(response, 200, { action: savedAction });
        return;
      }

      if (resource === "client") {
        const client = normalizeClientInput(body);
        await enforceTeamWriteScope(resource, client, identity, request.method);
        const savedClient = request.method === "POST" ? await createClient(client) : await updateClient(client);
        await auditWrite({ resource, operation, input: client, saved: savedClient, identity });
        json(response, 200, { client: savedClient });
        return;
      }

      if (resource === "opportunity") {
        const opportunity = normalizeOpportunityInput(body);
        await enforceTeamWriteScope(resource, opportunity, identity, request.method);
        const savedOpportunity = request.method === "POST" ? await createOpportunity(opportunity) : await updateOpportunity(opportunity);
        await auditWrite({ resource, operation, input: opportunity, saved: savedOpportunity, identity });
        await notifySlack({
          resource,
          operation,
          input: opportunity,
          saved: savedOpportunity,
        });
        json(response, 200, { opportunity: savedOpportunity });
        return;
      }

      if (resource === "event") {
        const event = normalizeEventInput(body);
        await enforceTeamWriteScope(resource, event, identity, request.method);
        const savedEvent = request.method === "POST" ? await createEvent(event) : await updateEvent(event);
        await auditWrite({ resource, operation, input: event, saved: savedEvent, identity });
        await notifySlack({
          resource,
          operation,
          input: event,
          saved: savedEvent,
        });
        json(response, 200, { event: savedEvent });
        return;
      }

      json(response, 400, {
        error: "validation_error",
        message: "Resource must be client, action, opportunity, or event.",
      });
      return;
    }

    json(response, 405, { error: "method_not_allowed", message: "Method not allowed." });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error(error);
    json(response, statusCode, {
      error: error.code || "notion_clients_error",
      message: error.message,
      ...(statusCode === 401 || statusCode === 403 ? { user: null } : {}),
    });
  }
};
