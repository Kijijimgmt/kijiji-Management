const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";

const DEFAULT_DATA_SOURCES = {
  clients: "03c5f70c-fb49-4d09-9de8-7fb8a45a04c7",
  actions: "662c1c0d-d255-4fe9-8260-5dc4f293b051",
  opportunities: "8548a9d4-1ffe-4787-90fc-3eb0a0085531",
  events: "4bf7373c-c744-4fe3-854e-ff0470954497",
};

const normalizeId = (value) =>
  String(value || "")
    .replace(/^collection:\/\//, "")
    .trim();

const dataSources = {
  clients: normalizeId(process.env.NOTION_CLIENT_ROSTER_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.clients),
  actions: normalizeId(process.env.NOTION_ACTIONS_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.actions),
  opportunities: normalizeId(process.env.NOTION_OPPORTUNITIES_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.opportunities),
  events: normalizeId(process.env.NOTION_EVENTS_DATA_SOURCE_ID || DEFAULT_DATA_SOURCES.events),
  activity: normalizeId(process.env.NOTION_ACTIVITY_LOG_DATA_SOURCE_ID),
};

const optionalBooleans = {
  notionTokenConfigured: Boolean(NOTION_TOKEN),
  portalAccessConfigured: Boolean(process.env.PORTAL_ACCESS_CODE),
  slackWebhookConfigured: Boolean(process.env.SLACK_WEBHOOK_URL),
  slackSigningSecretConfigured: Boolean(process.env.SLACK_SIGNING_SECRET),
  activityLogConfigured: Boolean(dataSources.activity),
  healthTokenConfigured: Boolean(process.env.HEALTH_CHECK_TOKEN || process.env.CRON_SECRET),
};

const notionRequest = async (path, options = {}, timeoutMs = 4000) => {
  if (!NOTION_TOKEN) {
    const error = new Error("Notion integration token is not configured.");
    error.statusCode = 503;
    error.code = "notion_not_configured";
    throw error;
  }

  let timeout;
  const controller = typeof AbortController === "function" ? new AbortController() : null;

  try {
    timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const details = await response.text();
      const error = new Error(`Notion request failed (${response.status}). ${String(details || "").slice(0, 300)}`);
      error.statusCode = response.status === 401 || response.status === 403 || response.status === 404 ? 502 : response.status;
      error.code = response.status === 403 || response.status === 404 ? "notion_access_missing" : "notion_request_failed";
      throw error;
    }

    return response.status === 204 ? null : response.json();
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const textProperty = (value) => ({
  rich_text: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [],
});

const titleProperty = (value) => ({
  title: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [],
});

const selectProperty = (value) => (value ? { select: { name: String(value).slice(0, 100) } } : { select: null });
const statusProperty = (value) => (value ? { status: { name: String(value).slice(0, 100) } } : { status: null });
const dateProperty = (value) => (value ? { date: { start: String(value) } } : { date: null });
const urlProperty = (value) => ({ url: value ? String(value).slice(0, 2000) : null });

const chooseSchemaKey = (schema, aliases, expectedType) => {
  const exact = aliases.find((alias) => Object.prototype.hasOwnProperty.call(schema || {}, alias));
  if (exact) return exact;
  return Object.entries(schema || {}).find(([, property]) => property?.type === expectedType)?.[0] || "";
};

const propertyForType = (schemaType, fallbackFactory, value) => {
  if (schemaType === "title") return titleProperty(value);
  if (schemaType === "rich_text") return textProperty(value);
  if (schemaType === "select") return selectProperty(value);
  if (schemaType === "status") return statusProperty(value);
  if (schemaType === "date") return dateProperty(value);
  if (schemaType === "url") return urlProperty(value);
  return fallbackFactory(value);
};

const assignProperty = (properties, schema, aliases, expectedType, valueFactory, value) => {
  const key = chooseSchemaKey(schema, aliases, expectedType);
  if (!key || Object.prototype.hasOwnProperty.call(properties, key)) return;
  properties[key] = propertyForType(schema?.[key]?.type || expectedType, valueFactory, value);
};

const getSourceSchema = async (sourceId) => {
  const data = await notionRequest(`/data_sources/${sourceId}`);
  return data.properties || {};
};

const writeGuardError = (message) => {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = "notion_writes_disabled";
  return error;
};

const assertWritesAllowed = () => {
  if (process.env.DISABLE_NOTION_WRITES === "true") {
    throw writeGuardError("Notion writes are disabled for this deployment.");
  }

  if (process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_NOTION_WRITES !== "true") {
    throw writeGuardError(
      "Preview deployment writes are disabled. Point Preview environment variables at staging Notion data sources before enabling ALLOW_PREVIEW_NOTION_WRITES."
    );
  }
};

const buildActivityProperties = (schema, activity) => {
  const now = activity.time || new Date().toISOString();
  const resource = String(activity.resource || "record").slice(0, 80);
  const action = String(activity.action || "changed").slice(0, 80);
  const properties = {};

  assignProperty(properties, schema, ["Activity", "Name", "Title"], "title", titleProperty, `${action} ${resource}`);
  assignProperty(properties, schema, ["Time", "Timestamp", "Created Time", "Created At", "Date"], "date", dateProperty, now);
  assignProperty(properties, schema, ["Actor", "User", "Performed By"], "rich_text", textProperty, activity.actor || "System");
  assignProperty(properties, schema, ["Source", "Channel"], "select", selectProperty, activity.source || "system");
  assignProperty(properties, schema, ["Action", "Operation"], "select", selectProperty, action);
  assignProperty(properties, schema, ["Resource", "Record Type", "Object"], "select", selectProperty, resource);
  assignProperty(properties, schema, ["Resource ID", "Record ID", "Notion Page ID"], "rich_text", textProperty, activity.resourceId || "");
  assignProperty(properties, schema, ["Resource URL", "Notion URL", "URL"], "url", urlProperty, activity.resourceUrl || "");
  assignProperty(properties, schema, ["Summary", "Notes", "Details"], "rich_text", textProperty, activity.summary || "");
  assignProperty(properties, schema, ["Status", "Result"], "select", selectProperty, activity.status || "Success");

  return properties;
};

const logActivity = async (activity) => {
  if (!dataSources.activity) {
    return { ok: false, skipped: true, reason: "activity_log_not_configured" };
  }

  try {
    const schema = await getSourceSchema(dataSources.activity);
    const properties = buildActivityProperties(schema, activity);

    if (!Object.keys(properties).length) {
      return { ok: false, skipped: true, reason: "activity_log_schema_missing" };
    }

    await notionRequest(
      "/pages",
      {
        method: "POST",
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: dataSources.activity },
          properties,
        }),
      },
      2500
    );

    return { ok: true, skipped: false };
  } catch (error) {
    console.warn(`Activity log skipped: ${error.message}`);
    return { ok: false, skipped: true, reason: error.code || "activity_log_failed" };
  }
};

const redactSourceStatus = (value) => (value ? "configured" : "missing");

const getEnvironmentSummary = () => ({
  timestamp: new Date().toISOString(),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
  checks: {
    ...optionalBooleans,
    dataSources: {
      clients: redactSourceStatus(dataSources.clients),
      actions: redactSourceStatus(dataSources.actions),
      opportunities: redactSourceStatus(dataSources.opportunities),
      events: redactSourceStatus(dataSources.events),
      activity: redactSourceStatus(dataSources.activity),
    },
    previewWritesAllowed: process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_NOTION_WRITES === "true",
    writesDisabled: process.env.DISABLE_NOTION_WRITES === "true",
  },
});

const getBearerToken = (request) => {
  const auth = request.headers.authorization || request.headers.Authorization || "";
  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
};

const assertHealthToken = (request) => {
  const required = process.env.HEALTH_CHECK_TOKEN || process.env.CRON_SECRET;

  if (!required) {
    const error = new Error("Set HEALTH_CHECK_TOKEN or CRON_SECRET before enabling deep production health checks.");
    error.statusCode = 503;
    error.code = "health_token_not_configured";
    throw error;
  }

  const supplied = request.headers["x-health-check-token"] || getBearerToken(request);

  if (supplied !== required) {
    const error = new Error("Deep health check token is required.");
    error.statusCode = 401;
    error.code = "health_token_required";
    throw error;
  }
};

const checkNotionSource = async (label, sourceId) => {
  if (!sourceId) {
    return { label, ok: false, status: "missing_config" };
  }

  try {
    await notionRequest(`/data_sources/${sourceId}`, {}, 2500);
    return { label, ok: true, status: "ok" };
  } catch (error) {
    return { label, ok: false, status: error.code || "failed" };
  }
};

const getDeepHealth = async () => {
  const sources = await Promise.all([
    checkNotionSource("clients", dataSources.clients),
    checkNotionSource("actions", dataSources.actions),
    checkNotionSource("opportunities", dataSources.opportunities),
    checkNotionSource("events", dataSources.events),
    dataSources.activity
      ? checkNotionSource("activity", dataSources.activity)
      : Promise.resolve({ label: "activity", ok: false, status: "optional_missing_config" }),
  ]);
  const requiredSourcesOk = sources.filter((source) => source.label !== "activity").every((source) => source.ok);
  const requiredEnvOk = Boolean(NOTION_TOKEN && process.env.PORTAL_ACCESS_CODE);

  return {
    ...getEnvironmentSummary(),
    ok: requiredEnvOk && requiredSourcesOk,
    deep: true,
    notionSources: sources,
    required: {
      notionToken: Boolean(NOTION_TOKEN),
      portalAccessCode: Boolean(process.env.PORTAL_ACCESS_CODE),
      coreNotionSources: requiredSourcesOk,
    },
  };
};

module.exports = {
  assertHealthToken,
  assertWritesAllowed,
  dataSources,
  getDeepHealth,
  getEnvironmentSummary,
  logActivity,
  normalizeId,
};
