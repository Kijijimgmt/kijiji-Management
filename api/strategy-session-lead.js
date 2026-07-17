const SUPABASE_URL = process.env.SUPABASE_URL || "https://vaqgriohhcccvvxgkhgh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_DPHPYm5DJGMqw13aiZP76w_q7pNidrn";
const LEADS_TABLE = process.env.SUPABASE_LEADS_TABLE || "strategy_session_leads";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFICATION_RECIPIENTS = (
  process.env.LEAD_NOTIFICATION_RECIPIENTS || "joe@kijijimgmt.com,erik@kijijimgmt.com,max@kijijimgmt.com"
)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);
const FROM_EMAIL = process.env.LEAD_NOTIFICATION_FROM || "Kijiji Management <leads@notify.kijijimgmt.com>";

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

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeLead = (body) => ({
  full_name: toText(body.full_name),
  email: toText(body.email).toLowerCase(),
  phone: toText(body.phone),
  social_handle: toText(body.social_handle),
  client_type: toText(body.client_type),
  current_stage: toText(body.current_stage),
  services_needed: Array.isArray(body.services_needed) ? body.services_needed.map(toText).filter(Boolean) : [],
  biggest_bottleneck: toText(body.biggest_bottleneck),
  preferred_contact: toText(body.preferred_contact),
  budget_readiness: toText(body.budget_readiness),
  utm_source: toText(body.utm_source),
  utm_medium: toText(body.utm_medium),
  utm_campaign: toText(body.utm_campaign),
  utm_content: toText(body.utm_content),
  utm_term: toText(body.utm_term),
  page_url: toText(body.page_url),
  submitted_at: toText(body.submitted_at) || new Date().toISOString(),
  user_agent: toText(body.user_agent),
  referrer: toText(body.referrer),
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

const buildEmail = (lead) => {
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
    ["Submitted at", lead.submitted_at],
    ["UTM source", lead.utm_source],
    ["UTM medium", lead.utm_medium],
    ["UTM campaign", lead.utm_campaign],
  ];

  const text = rows.map(([label, value]) => `${label}: ${formatValue(value)}`).join("\n");
  const htmlRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e0d8;font-weight:700;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e0d8;vertical-align:top;">${escapeHtml(formatValue(value))}</td>
        </tr>
      `
    )
    .join("");

  return {
    subject: `New Kijiji strategy request: ${lead.full_name}`,
    text: `A new strategy session request was submitted.\n\n${text}`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;color:#171613;line-height:1.5;">
        <h1 style="margin:0 0 12px;font-size:24px;">New strategy session request</h1>
        <p style="margin:0 0 18px;color:#5b554d;">A new lead was submitted through kijijimgmt.com.</p>
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px;border:1px solid #e5e0d8;">
          <tbody>${htmlRows}</tbody>
        </table>
      </div>
    `,
  };
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
    const body = parseBody(request.body);

    if (body.company_website) {
      json(response, 200, { ok: true });
      return;
    }

    const lead = normalizeLead(body);

    if (!lead.full_name || !lead.email || !lead.email.includes("@")) {
      json(response, 400, { error: "Name and a valid email are required." });
      return;
    }

    await insertLead(lead);
    const emailSent = await sendNotification(lead);

    json(response, 201, { ok: true, email_sent: emailSent });
  } catch (error) {
    console.error(error);
    json(response, 500, { error: "Lead submission failed." });
  }
};
