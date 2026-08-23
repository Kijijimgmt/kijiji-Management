const SUPABASE_URL = process.env.SUPABASE_URL || "https://vaqgriohhcccvvxgkhgh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_DPHPYm5DJGMqw13aiZP76w_q7pNidrn";
const LEADS_TABLE = process.env.SUPABASE_LEADS_TABLE || "strategy_session_leads";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const NOTION_OPPORTUNITIES_DATA_SOURCE_ID =
  process.env.NOTION_OPPORTUNITIES_DATA_SOURCE_ID || "8548a9d4-1ffe-4787-90fc-3eb0a0085531";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const MIN_FORM_SECONDS = Number(process.env.LEAD_MIN_FORM_SECONDS || 3);
const RATE_LIMIT_WINDOW_MS = Number(process.env.LEAD_RATE_LIMIT_WINDOW_MS || 60_000);
const allowedOrigins = (process.env.LEAD_ALLOWED_ORIGINS || "https://www.kijijimgmt.com,https://kijijimgmt.com")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const NOTIFICATION_RECIPIENTS = (
  process.env.LEAD_NOTIFICATION_RECIPIENTS || "joe@kijijimgmt.com,erik@kijijimgmt.com,max@kijijimgmt.com"
)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);
const FROM_EMAIL = process.env.LEAD_NOTIFICATION_FROM || "Kijiji Management <leads@notify.kijijimgmt.com>";
const recentSubmissions = new Map();

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

const opportunitiesDataSourceId = normalizeId(NOTION_OPPORTUNITIES_DATA_SOURCE_ID);

const toText = (value, maxLength = 1000) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const normalizeServices = (value) => {
  const values = Array.isArray(value) ? value : [];
  return values.map((item) => toText(item, 80)).filter(Boolean).slice(0, 12);
};

const normalizeLead = (body) => ({
  full_name: toText(body.full_name, 160),
  email: toText(body.email, 220).toLowerCase(),
  phone: toText(body.phone, 80),
  social_handle: toText(body.social_handle, 120),
  client_type: toText(body.client_type, 120),
  current_stage: toText(body.current_stage, 160),
  services_needed: normalizeServices(body.services_needed),
  biggest_bottleneck: toText(body.biggest_bottleneck, 1500),
  preferred_contact: toText(body.preferred_contact, 80),
  budget_readiness: toText(body.budget_readiness, 140),
  company_website: toText(body.company_website, 240),
  form_started_at: toText(body.form_started_at, 80),
  utm_source: toText(body.utm_source, 160),
  utm_medium: toText(body.utm_medium, 160),
  utm_campaign: toText(body.utm_campaign, 160),
  utm_content: toText(body.utm_content, 160),
  utm_term: toText(body.utm_term, 160),
  page_url: toText(body.page_url, 600),
  submitted_at: toText(body.submitted_at, 80) || new Date().toISOString(),
  user_agent: toText(body.user_agent, 400),
  referrer: toText(body.referrer, 600),
});

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatValue = (value) => {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "Not provided";
  }

  return value || "Not provided";
};

const formatSubmittedAt = (value) => {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(date);
};

const buildEmail = (lead) => {
  const submittedAt = formatSubmittedAt(lead.submitted_at);
  const replyHref = `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(
    "Re: Your Kijiji strategy session request"
  )}`;
  const rows = [
    ["Name", lead.full_name],
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Social", lead.social_handle],
    ["Client type", lead.client_type],
    ["Current stage", lead.current_stage],
    ["Services needed", lead.services_needed],
    ["Preferred contact", lead.preferred_contact],
    ["Budget readiness", lead.budget_readiness],
    ["Biggest bottleneck", lead.biggest_bottleneck],
    ["Page URL", lead.page_url],
    ["Submitted at", submittedAt],
    ["UTM source", lead.utm_source],
    ["UTM medium", lead.utm_medium],
    ["UTM campaign", lead.utm_campaign],
  ];
  const contactRows = [
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Social", lead.social_handle],
    ["Preferred contact", lead.preferred_contact],
  ];
  const opportunityRows = [
    ["Client type", lead.client_type],
    ["Current stage", lead.current_stage],
    ["Services needed", lead.services_needed],
    ["Budget readiness", lead.budget_readiness],
    ["Biggest bottleneck", lead.biggest_bottleneck],
  ];
  const attributionRows = [
    ["Page URL", lead.page_url],
    ["Submitted at", submittedAt],
    ["UTM source", lead.utm_source],
    ["UTM medium", lead.utm_medium],
    ["UTM campaign", lead.utm_campaign],
  ];

  const text = rows.map(([label, value]) => `${label}: ${formatValue(value)}`).join("\n");
  const renderRows = (sectionRows) =>
    sectionRows
      .map(
        ([label, value]) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #28211c;color:#a89f96;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;vertical-align:top;width:34%;">${escapeHtml(
            label
          )}</td>
          <td style="padding:14px 0;border-bottom:1px solid #28211c;color:#f8f3ec;font-size:15px;font-weight:600;line-height:1.45;vertical-align:top;">${escapeHtml(
            formatValue(value)
          )}</td>
        </tr>
      `
      )
      .join("");
  const renderStat = (label, value) => `
    <td style="padding:0 8px 12px 0;vertical-align:top;width:33.333%;">
      <div style="background:#17130f;border:1px solid #31261f;border-radius:14px;padding:16px;min-height:86px;">
        <div style="color:#a89f96;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">${escapeHtml(
          label
        )}</div>
        <div style="color:#fff9ef;font-size:16px;font-weight:800;line-height:1.35;margin-top:8px;">${escapeHtml(
          formatValue(value)
        )}</div>
      </div>
    </td>
  `;
  const services = Array.isArray(lead.services_needed)
    ? lead.services_needed
        .map(
          (service) =>
            `<span style="display:inline-block;background:#2a211a;border:1px solid #5b3820;border-radius:999px;color:#f6d1ad;font-size:13px;font-weight:700;margin:0 6px 8px 0;padding:8px 12px;">${escapeHtml(
              service
            )}</span>`
        )
        .join("")
    : "";
  const servicesMarkup =
    services ||
    '<span style="display:inline-block;color:#a89f96;font-size:14px;font-weight:600;">Not provided</span>';
  const section = (title, sectionRows) => `
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;margin-top:18px;">
      <tr>
        <td style="padding:0 0 4px;">
          <h2 style="color:#fff9ef;font-size:18px;line-height:1.2;margin:0;">${escapeHtml(title)}</h2>
        </td>
      </tr>
      <tr>
        <td>
          <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
            ${renderRows(sectionRows)}
          </table>
        </td>
      </tr>
    </table>
  `;
  const preview = `New strategy session request from ${lead.full_name}.`;

  return {
    subject: `New Kijiji strategy request: ${lead.full_name}`,
    text: `A new strategy session request was submitted.\n\n${text}`,
    html: `
      <!doctype html>
      <html>
        <body style="margin:0;padding:0;background:#0d0c0b;">
          <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">${escapeHtml(preview)}</div>
          <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#0d0c0b;border-collapse:collapse;">
            <tr>
              <td style="padding:28px 14px;">
                <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:720px;margin:0 auto;border-collapse:collapse;">
                  <tr>
                    <td style="background:#130f0c;border:1px solid #332820;border-radius:22px;overflow:hidden;">
                      <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
                        <tr>
                          <td style="background:#0b0a09;padding:22px 28px;border-bottom:1px solid #2a211b;">
                            <div style="color:#fff9ef;font-size:19px;font-weight:900;letter-spacing:.02em;">KIJIJI MANAGEMENT</div>
                            <div style="color:#c65f23;font-size:11px;font-weight:900;letter-spacing:.16em;margin-top:8px;text-transform:uppercase;">New strategy session request</div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:30px 28px 12px;">
                            <h1 style="color:#fff9ef;font-family:Inter,Arial,sans-serif;font-size:34px;line-height:1.05;margin:0 0 14px;">${escapeHtml(
                              lead.full_name
                            )} is ready to talk.</h1>
                            <p style="color:#d8cec4;font-family:Inter,Arial,sans-serif;font-size:16px;line-height:1.6;margin:0 0 22px;">A new lead came in through kijijimgmt.com. Reply directly from this email to continue the conversation.</p>
                            <a href="${escapeHtml(
                              replyHref
                            )}" style="background:#c65f23;border-radius:999px;color:#fff9ef;display:inline-block;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:900;padding:14px 22px;text-decoration:none;">Reply to ${escapeHtml(
                              lead.full_name
                            )}</a>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:10px 20px 8px 28px;">
                            <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">
                              <tr>
                                ${renderStat("Client", lead.client_type)}
                                ${renderStat("Stage", lead.current_stage)}
                                ${renderStat("Budget", lead.budget_readiness)}
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 28px 24px;">
                            <div style="background:#17130f;border:1px solid #31261f;border-radius:16px;padding:18px;">
                              <div style="color:#a89f96;font-family:Inter,Arial,sans-serif;font-size:11px;font-weight:900;letter-spacing:.12em;margin-bottom:10px;text-transform:uppercase;">Services requested</div>
                              <div>${servicesMarkup}</div>
                            </div>
                            ${section("Contact", contactRows)}
                            ${section("Opportunity", opportunityRows)}
                            ${section("Attribution", attributionRows)}
                          </td>
                        </tr>
                        <tr>
                          <td style="background:#0b0a09;border-top:1px solid #2a211b;padding:18px 28px;">
                            <p style="color:#81776f;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.5;margin:0;">Sent automatically from the Kijiji Management website lead form.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };
};

const setCorsHeaders = (request, response) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const isAllowedOrigin = (request) => {
  const origin = request.headers.origin;
  return !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin);
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validateLead = (lead) => {
  const missing = [];

  if (!lead.full_name) missing.push("full name");
  if (!isValidEmail(lead.email)) missing.push("valid email");
  if (!lead.client_type) missing.push("client type");
  if (!lead.current_stage) missing.push("current stage");
  if (!lead.biggest_bottleneck) missing.push("biggest bottleneck");
  if (!lead.preferred_contact) missing.push("preferred contact");
  if (!lead.budget_readiness) missing.push("budget readiness");

  if (missing.length) {
    const error = new Error(`Please provide ${missing.join(", ")}.`);
    error.statusCode = 400;
    error.code = "validation_error";
    throw error;
  }

  if (lead.form_started_at && lead.submitted_at) {
    const started = new Date(lead.form_started_at).getTime();
    const submitted = new Date(lead.submitted_at).getTime();

    if (Number.isFinite(started) && Number.isFinite(submitted) && submitted - started < MIN_FORM_SECONDS * 1000) {
      const error = new Error("Please take a moment to complete the form before submitting.");
      error.statusCode = 429;
      error.code = "submission_too_fast";
      throw error;
    }
  }
};

const getClientIp = (request) =>
  String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();

const enforceRateLimit = (request, lead) => {
  const now = Date.now();

  for (const [key, timestamp] of recentSubmissions.entries()) {
    if (now - timestamp > RATE_LIMIT_WINDOW_MS) {
      recentSubmissions.delete(key);
    }
  }

  const key = `${getClientIp(request)}:${lead.email}`;
  const lastSubmission = recentSubmissions.get(key);

  if (lastSubmission && now - lastSubmission < RATE_LIMIT_WINDOW_MS) {
    const error = new Error("Please wait a moment before submitting again.");
    error.statusCode = 429;
    error.code = "rate_limited";
    throw error;
  }

  recentSubmissions.set(key, now);
};

const getNotionFailureMessage = (status, details) => {
  if (status === 401) {
    return "Notion rejected the integration token. Update NOTION_TOKEN in Vercel.";
  }

  if (status === 403 || status === 404) {
    return "Notion could not access Opportunities & Deals. Share that Notion data source with the Kijiji integration.";
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

  const notionResponse = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      ...(options.headers || {}),
    },
  });

  if (!notionResponse.ok) {
    const details = await notionResponse.text();
    const error = new Error(getNotionFailureMessage(notionResponse.status, details));
    error.statusCode = notionResponse.status === 401 || notionResponse.status === 403 || notionResponse.status === 404 ? 502 : notionResponse.status;
    error.code = notionResponse.status === 403 || notionResponse.status === 404 ? "notion_access_missing" : "notion_request_failed";
    throw error;
  }

  if (notionResponse.status === 204) {
    return null;
  }

  return notionResponse.json();
};

const propertyByAliases = (schema, aliases) => aliases.find((alias) => Object.prototype.hasOwnProperty.call(schema || {}, alias));

const firstSchemaType = (schema, type) => Object.entries(schema || {}).find(([, property]) => property?.type === type)?.[0] || "";

const chooseSchemaKey = (schema, aliases, expectedType) => propertyByAliases(schema, aliases) || firstSchemaType(schema, expectedType);

const title = (value) => ({
  title: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [],
});

const richText = (value) => ({
  rich_text: value ? [{ text: { content: String(value).slice(0, 2000) } }] : [],
});

const select = (value) => (value ? { select: { name: String(value).slice(0, 100) } } : { select: null });
const status = (value) => (value ? { status: { name: String(value).slice(0, 100) } } : { status: null });
const multiSelect = (values) => ({
  multi_select: (Array.isArray(values) ? values : String(values || "").split(","))
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((name) => ({ name: name.slice(0, 100) })),
});
const date = (value) => (value ? { date: { start: String(value) } } : { date: null });
const email = (value) => ({ email: value ? String(value).slice(0, 200) : null });
const phoneNumber = (value) => ({ phone_number: value ? String(value).slice(0, 200) : null });
const checkbox = (value) => ({ checkbox: Boolean(value) });

const propertyForType = (schemaType, fallbackFactory, value) => {
  if (schemaType === "title") return title(value);
  if (schemaType === "rich_text") return richText(value);
  if (schemaType === "select") return select(value);
  if (schemaType === "status") return status(value);
  if (schemaType === "multi_select") return multiSelect(value);
  if (schemaType === "date") return date(value);
  if (schemaType === "email") return email(value);
  if (schemaType === "phone_number") return phoneNumber(value);
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

const getSourceSchema = async () => {
  const data = await notionRequest(`/data_sources/${opportunitiesDataSourceId}`);
  return data.properties || {};
};

const buildLeadNotes = (lead) => {
  const lines = [
    "Website lead from kijijimgmt.com",
    "",
    `Name: ${lead.full_name}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone || "Not provided"}`,
    `Social: ${lead.social_handle || "Not provided"}`,
    `Client type: ${lead.client_type}`,
    `Current stage: ${lead.current_stage}`,
    `Services needed: ${formatValue(lead.services_needed)}`,
    `Preferred contact: ${lead.preferred_contact}`,
    `Budget readiness: ${lead.budget_readiness}`,
    "",
    "Biggest bottleneck:",
    lead.biggest_bottleneck,
    "",
    `Source: ${lead.page_url || "kijijimgmt.com"}`,
    `Submitted: ${lead.submitted_at}`,
    `UTM source: ${lead.utm_source || "Not provided"}`,
    `UTM campaign: ${lead.utm_campaign || "Not provided"}`,
  ];

  return lines.join("\n").slice(0, 2000);
};

const leadOpportunityProperties = (lead, schema) => {
  const properties = {};
  const opportunityTitle = `Strategy Session - ${lead.full_name}`;
  const priority = lead.budget_readiness.toLowerCase().includes("ready") ? "High" : "Normal";
  const notes = buildLeadNotes(lead);

  assignProperty(properties, schema, ["Opportunity", "Deal", "Name", "Title"], "title", title, opportunityTitle);
  assignProperty(properties, schema, ["Stage", "Status", "Pipeline Stage"], "select", select, "New Lead");
  assignProperty(properties, schema, ["Owner", "Assigned Owner"], "select", select, "Unassigned");
  assignProperty(properties, schema, ["Priority", "Urgency", "Focus Level"], "select", select, priority);
  assignProperty(properties, schema, ["Client Name", "Client Text", "Client"], "rich_text", richText, lead.full_name);
  assignProperty(properties, schema, ["Next Step", "Next Move", "Next Action", "Notes", "Details"], "rich_text", richText, notes);
  assignProperty(properties, schema, ["Lead Source", "Source", "Channel"], "select", select, "Website");
  assignProperty(properties, schema, ["Contact Email", "Lead Email", "Email"], "email", email, lead.email);
  assignProperty(properties, schema, ["Contact Phone", "Lead Phone", "Phone"], "phone_number", phoneNumber, lead.phone);
  assignProperty(properties, schema, ["Client Type", "Type", "Category"], "multi_select", multiSelect, [lead.client_type]);
  assignProperty(properties, schema, ["Services Needed", "Services", "Scope"], "multi_select", multiSelect, lead.services_needed);
  assignProperty(properties, schema, ["Submitted At", "Submitted", "Created Date"], "date", date, lead.submitted_at);

  return properties;
};

const createNotionOpportunity = async (lead) => {
  const schema = await getSourceSchema();
  const properties = leadOpportunityProperties(lead, schema);

  if (!Object.keys(properties).length) {
    const error = new Error("Notion Opportunities & Deals does not expose writable fields for the intake.");
    error.statusCode = 502;
    error.code = "notion_schema_missing";
    throw error;
  }

  const page = await notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: opportunitiesDataSourceId },
      properties,
    }),
  });

  return {
    id: page.id,
    url: page.url,
    title: `Strategy Session - ${lead.full_name}`,
  };
};

const archiveLead = async (lead) => {
  try {
    await insertLead(lead);
    return true;
  } catch (error) {
    console.warn(`Supabase lead archive skipped: ${error.message}`);
    return false;
  }
};

const compact = (value, fallback = "Not provided") => {
  const text = Array.isArray(value) ? value.join(", ") : String(value || "").trim();
  return text ? text.slice(0, 180) : fallback;
};

const notifySlack = async (lead, opportunity) => {
  if (!SLACK_WEBHOOK_URL) {
    return false;
  }

  const text = [
    `:inbox_tray: New website lead: ${compact(lead.full_name)}`,
    `- Email: ${compact(lead.email)}`,
    `- Phone: ${compact(lead.phone)}`,
    `- Type: ${compact(lead.client_type)}`,
    `- Stage: ${compact(lead.current_stage)}`,
    `- Services: ${compact(lead.services_needed)}`,
    `- Budget readiness: ${compact(lead.budget_readiness)}`,
    `- Bottleneck: ${compact(lead.biggest_bottleneck)}`,
    opportunity?.url ? `Notion: ${opportunity.url}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let timeout;
  try {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    timeout = controller ? setTimeout(() => controller.abort(), 1500) : null;
    const slackResponse = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(controller ? { signal: controller.signal } : {}),
      body: JSON.stringify({
        text,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    if (!slackResponse.ok) {
      console.warn(`Slack lead notification failed with status ${slackResponse.status}.`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`Slack lead notification failed: ${error.message}`);
    return false;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const insertLead = async (lead) => {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${LEADS_TABLE}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(lead),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase insert failed: ${response.status} ${details}`);
  }
};

const sendNotification = async (lead) => {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not configured; lead notification email skipped.");
    return false;
  }

  const email = buildEmail(lead);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFICATION_RECIPIENTS,
      reply_to: lead.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error(`Resend notification failed: ${response.status} ${details}`);
    return false;
  }

  return true;
};

module.exports = async (request, response) => {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    if (!isAllowedOrigin(request)) {
      json(response, 403, { error: "Lead submissions are only accepted from kijijimgmt.com." });
      return;
    }

    const body = parseBody(request.body);
    const lead = normalizeLead(body);

    if (lead.company_website) {
      json(response, 200, { ok: true, filtered: true });
      return;
    }

    validateLead(lead);
    enforceRateLimit(request, lead);

    const opportunity = await createNotionOpportunity(lead);
    const supabaseSaved = await archiveLead(lead);
    const slackSent = await notifySlack(lead, opportunity);
    const emailSent = await sendNotification(lead);

    json(response, 201, {
      ok: true,
      dashboard_synced: true,
      opportunity,
      supabase_saved: supabaseSaved,
      slack_sent: slackSent,
      email_sent: emailSent,
    });
  } catch (error) {
    console.error(error);
    const statusCode = error instanceof SyntaxError ? 400 : error.statusCode || 500;
    json(response, statusCode, {
      error:
        error.code === "notion_not_configured" || error.code === "notion_access_missing" || error.code === "notion_schema_missing"
          ? error.message
          : statusCode >= 500
          ? "Lead submission failed."
          : error.message,
      code: error.code || (error instanceof SyntaxError ? "invalid_json" : "lead_submission_failed"),
    });
  }
};
