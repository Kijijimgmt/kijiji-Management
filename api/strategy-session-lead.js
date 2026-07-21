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
