const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_CLIENT_ROSTER_DATABASE_ID || "8579c368e9ae495e82af886ba21db26a";
const NOTION_VERSION = "2022-06-28";
const PORTAL_ACCESS_CODE = process.env.PORTAL_ACCESS_CODE;

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

const notionRequest = async (path, options = {}) => {
  if (!NOTION_TOKEN) {
    const error = new Error("Notion integration token is not configured.");
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
    const error = new Error(`Notion request failed: ${response.status} ${details}`);
    error.statusCode = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

const verifyPortalAccess = (request) => {
  if (!PORTAL_ACCESS_CODE) {
    const error = new Error("Portal access code is not configured.");
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

  return "";
};

const selectName = (property) => property?.select?.name || "";
const multiSelectNames = (property) => property?.multi_select?.map((item) => item.name) || [];
const dateStart = (property) => property?.date?.start || "";
const numberValue = (property) => (typeof property?.number === "number" ? property.number : 0);

const mapPageToClient = (page) => {
  const properties = page.properties || {};

  return {
    id: page.id,
    url: page.url,
    name: plainText(properties.Client),
    category: multiSelectNames(properties.Type).join(", "),
    type: multiSelectNames(properties.Type),
    status: selectName(properties.Status) || "Prospect",
    owner: plainText(properties["Primary Owner"]),
    stage: plainText(properties["Current Offer"]),
    progress: numberValue(properties.Progress),
    nextAction: plainText(properties["Next Move"]),
    dueDate: dateStart(properties["Last Touch"]),
    lastTouch: dateStart(properties["Last Touch"]),
    contactName: "",
    email: properties["Contact Email"]?.email || "",
    phone: properties["Contact Phone"]?.phone_number || "",
    leadSource: selectName(properties["Lead Source"]),
    channel: selectName(properties["Lead Source"]),
    notes: plainText(properties.Notes),
  };
};

const richText = (value) => ({
  rich_text: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [],
});

const title = (value) => ({
  title: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [],
});

const select = (value) => (value ? { select: { name: String(value) } } : { select: null });

const multiSelect = (values) => ({
  multi_select: (Array.isArray(values) ? values : String(values || "").split(","))
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((name) => ({ name })),
});

const date = (value) => (value ? { date: { start: String(value) } } : { date: null });
const email = (value) => ({ email: value ? String(value) : null });
const phoneNumber = (value) => ({ phone_number: value ? String(value) : null });
const number = (value) => ({ number: Number.isFinite(Number(value)) ? Number(value) : null });

const normalizeClientInput = (body) => ({
  id: String(body.id || "").trim(),
  name: String(body.name || "").trim(),
  type: Array.isArray(body.type) ? body.type : String(body.category || body.type || "").split(","),
  status: String(body.status || "Prospect").trim(),
  owner: String(body.owner || "").trim(),
  stage: String(body.stage || "").trim(),
  nextAction: String(body.nextAction || "").trim(),
  progress: Number(body.progress || 0),
  lastTouch: String(body.lastTouch || body.dueDate || "").trim(),
  email: String(body.email || "").trim(),
  phone: String(body.phone || "").trim(),
  leadSource: String(body.leadSource || body.channel || "").trim(),
  notes: String(body.notes || "").trim(),
});

const toNotionProperties = (client) => ({
  Client: title(client.name),
  Type: multiSelect(client.type),
  Status: select(client.status),
  "Primary Owner": richText(client.owner),
  "Current Offer": richText(client.stage),
  "Next Move": richText(client.nextAction),
  Progress: number(client.progress),
  "Last Touch": date(client.lastTouch),
  "Contact Email": email(client.email),
  "Contact Phone": phoneNumber(client.phone),
  "Lead Source": select(client.leadSource),
  Notes: richText(client.notes),
});

const listClients = async () => {
  const clients = [];
  let cursor;

  do {
    const body = cursor
      ? {
          page_size: 100,
          start_cursor: cursor,
        }
      : { page_size: 100 };
    const data = await notionRequest(`/databases/${NOTION_DATABASE_ID}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    clients.push(...data.results.map(mapPageToClient));
    cursor = data.has_more ? data.next_cursor : "";
  } while (cursor);

  return clients;
};

const createClient = async (client) => {
  if (!client.name) {
    const error = new Error("Client name is required.");
    error.statusCode = 400;
    throw error;
  }

  const data = await notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: toNotionProperties(client),
    }),
  });

  return mapPageToClient(data);
};

const updateClient = async (client) => {
  if (!client.id) {
    const error = new Error("Client id is required.");
    error.statusCode = 400;
    throw error;
  }

  const data = await notionRequest(`/pages/${client.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: toNotionProperties(client),
    }),
  });

  return mapPageToClient(data);
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
      const clients = await listClients();
      json(response, 200, {
        clients,
        source: {
          type: "notion",
          databaseId: NOTION_DATABASE_ID,
        },
      });
      return;
    }

    if (request.method === "POST" || request.method === "PATCH") {
      const client = normalizeClientInput(parseBody(request.body));
      const savedClient = request.method === "POST" ? await createClient(client) : await updateClient(client);
      json(response, 200, { client: savedClient });
      return;
    }

    json(response, 405, { error: "Method not allowed" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error(error);
    json(response, statusCode, {
      error: error.code || "notion_clients_error",
      message: error.message,
    });
  }
};
