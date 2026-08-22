const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const PORTAL_ACCESS_CODE = process.env.PORTAL_ACCESS_CODE;

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

const verifyPortalAccess = (request) => {
  if (!PORTAL_ACCESS_CODE) {
    const error = new Error("Portal access code is not configured in Vercel.");
    error.statusCode = 503;
    error.code = "portal_access_not_configured";
    throw error;
  }

  const accessCode = request.headers["x-portal-access-code"];

  if (accessCode !== PORTAL_ACCESS_CODE) {
    const error = new Error("Enter the Kijiji portal access code.");
    error.statusCode = 401;
    error.code = "portal_access_required";
    throw error;
  }
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

  const schemaType = schema?.[key]?.type || expectedType;
  properties[key] = propertyForType(schemaType, valueFactory, value);
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
    dueDate: dateStart(propertyByAliases(properties, ["Next Date", "Due Date", "Last Touch"])),
    lastTouch: dateStart(propertyByAliases(properties, ["Last Touch", "Last Contact", "Updated"])),
    email: emailValue(propertyByAliases(properties, ["Contact Email", "Email"])),
    phone: phoneValue(propertyByAliases(properties, ["Contact Phone", "Phone"])),
    leadSource: selectName(propertyByAliases(properties, ["Lead Source", "Source"])),
    notes: plainText(propertyByAliases(properties, ["Notes", "Internal Notes"])),
  };
};

const mapPageToAction = (page) => {
  const properties = page.properties || {};
  const clientRelation = relationIds(propertyByAliases(properties, ["Client", "Related Client", "Client Relation"]));

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
    blocker: checkboxValue(propertyByAliases(properties, ["Blocker", "Blocked", "Is Blocker"])),
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
    clientIds: relationIds(propertyByAliases(properties, ["Client", "Related Client"])),
    clientName: plainText(propertyByAliases(properties, ["Client Name", "Client Text", "Client"])),
    nextStep: plainText(propertyByAliases(properties, ["Next Step", "Next Move", "Notes"])),
    dueDate: dateStart(propertyByAliases(properties, ["Close Date", "Due Date", "Target Date"])),
  };
};

const mapPageToEvent = (page) => {
  const properties = page.properties || {};

  return {
    id: page.id,
    url: page.url,
    name: titleText(properties, ["Event", "Release", "Name", "Title"]) || "Untitled event",
    type: selectName(propertyByAliases(properties, ["Type", "Event Type", "Release Type"])) || "",
    status: selectName(propertyByAliases(properties, ["Status", "Event Status"])) || "",
    owner: selectName(propertyByAliases(properties, ["Owner", "Lead"])) || plainText(propertyByAliases(properties, ["Owner", "Lead"])),
    date: dateStart(propertyByAliases(properties, ["Date", "Release Date", "Event Date"])),
    clientIds: relationIds(propertyByAliases(properties, ["Client", "Related Client"])),
    clientName: plainText(propertyByAliases(properties, ["Client Name", "Client Text", "Client"])),
    notes: plainText(propertyByAliases(properties, ["Notes", "Details"])),
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

  const relationKey = chooseSchemaKey(schema, ["Client", "Related Client", "Client Relation"], "relation");
  if (relationKey && action.clientId) {
    properties[relationKey] = relation([action.clientId]);
  }

  assignProperty(properties, schema, ["Client Name", "Client Text"], "rich_text", richText, action.clientName);

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

module.exports = async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    verifyPortalAccess(request);

    if (request.method === "GET") {
      json(response, 200, await listDashboard());
      return;
    }

    if (request.method === "POST" || request.method === "PATCH") {
      const body = parseBody(request.body);
      const resource = String(body.resource || "client");

      if (resource === "action") {
        const action = normalizeActionInput(body);
        const savedAction = request.method === "POST" ? await createAction(action) : await updateAction(action);
        json(response, 200, { action: savedAction });
        return;
      }

      if (resource === "client") {
        const client = normalizeClientInput(body);
        const savedClient = request.method === "POST" ? await createClient(client) : await updateClient(client);
        json(response, 200, { client: savedClient });
        return;
      }

      json(response, 400, {
        error: "validation_error",
        message: "Resource must be client or action.",
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
    });
  }
};
