const { TEAM_MEMBERS } = require("./kijiji-auth");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const FROM_EMAIL = process.env.PORTAL_NOTIFICATION_FROM || "Kijiji Team Portal <notifications@notify.kijijimgmt.com>";

const compact = (value, fallback = "Not set") => String(value || fallback).trim().slice(0, 500);
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character]);
const portalSection = { client: "clients", action: "work", opportunity: "work", event: "calendar" };
const resourceLabel = { client: "Client", action: "Task", opportunity: "Opportunity", event: "Event" };

const notificationSummary = (resource, input) => {
  if (resource === "client") return `Status: ${compact(input.status)} · Owner: ${compact(input.owner)}`;
  if (resource === "action") return `Status: ${compact(input.status)} · Owner: ${compact(input.owner)}${input.blocker ? " · Blocked" : ""}`;
  if (resource === "opportunity") return `Stage: ${compact(input.stage)} · Owner: ${compact(input.owner)}${input.blocker ? " · Blocked" : ""}`;
  return `Status: ${compact(input.status)} · Owner: ${compact(input.owner)} · Date: ${compact(input.date)}`;
};

const resourceTitle = (resource, saved, input) =>
  compact(resource === "action" ? saved.title || input.title : saved.name || input.name, resourceLabel[resource] || "Record");

const insertNotifications = async (rows) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !rows.length) return false;
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/portal_notifications`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`Notification archive failed (${response.status}).`);
  return true;
};

const sendEmails = async (recipients, notification) => {
  if (!RESEND_API_KEY || !recipients.length) return false;
  const subject = `${notification.actor_name} ${notification.operation} ${notification.resource_type.toLowerCase()}: ${notification.resource_title}`;
  await Promise.all(recipients.map(async (recipient) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipient],
        subject,
        text: `${subject}\n\n${notification.summary}\n\nOpen the dashboard: ${notification.portal_url}`,
        html: `<div style="font-family:Arial,sans-serif;background:#11100e;color:#f5efe8;padding:28px"><p style="color:#e29a58;font-size:12px;font-weight:700;text-transform:uppercase">Kijiji Team Update</p><h2 style="margin:8px 0 12px">${escapeHtml(subject)}</h2><p style="color:#c5bbb1">${escapeHtml(notification.summary)}</p><p><a style="color:#e29a58" href="${escapeHtml(notification.portal_url)}">Open in the team dashboard</a></p></div>`,
      }),
    });
    if (!response.ok) throw new Error(`Partner email failed (${response.status}).`);
  }));
  return true;
};

const reminderWasSent = async (eventId, reminderKey) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  const query = new URLSearchParams({
    select: "id",
    resource_type: "eq.Event",
    resource_id: `eq.${eventId}`,
    operation: `eq.${reminderKey}`,
    limit: "1",
  });
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/portal_notifications?${query}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Reminder lookup failed (${response.status}).`);
  const rows = await response.json();
  return rows.length > 0;
};

const sendReminderEmails = async (recipients, event) => {
  if (!RESEND_API_KEY || !recipients.length) return false;
  const subject = `Tomorrow: ${event.name}`;
  const summary = [event.type || "Event", event.clientName, event.owner ? `Owner: ${event.owner}` : ""]
    .filter(Boolean)
    .join(" · ");
  const portalUrl = "https://www.kijijimgmt.com/client-portal#calendar";
  await Promise.all(recipients.map(async (recipient) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipient],
        subject,
        text: `${subject}\n\n${summary}\nDate: ${event.date}\n${event.notes || ""}\n\nOpen the calendar: ${portalUrl}`,
        html: `<div style="font-family:Arial,sans-serif;background:#11100e;color:#f5efe8;padding:28px"><p style="color:#e29a58;font-size:12px;font-weight:700;text-transform:uppercase">Kijiji Event Reminder</p><h2 style="margin:8px 0 12px">${escapeHtml(event.name)}</h2><p style="color:#c5bbb1">${escapeHtml(summary)}</p><p style="color:#c5bbb1"><strong>Tomorrow:</strong> ${escapeHtml(event.date)}</p>${event.notes ? `<p style="color:#c5bbb1">${escapeHtml(event.notes)}</p>` : ""}<p><a style="color:#e29a58" href="${portalUrl}">Open the team calendar</a></p></div>`,
      }),
    });
    if (!response.ok) throw new Error(`Event reminder email failed (${response.status}).`);
  }));
  return true;
};

const sendReminderSlack = async (event) => {
  if (!SLACK_WEBHOOK_URL) return false;
  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: [
        `:calendar: *Tomorrow: ${compact(event.name)}*`,
        [compact(event.type, "Event"), event.clientName, event.owner ? `Owner: ${event.owner}` : ""].filter(Boolean).join(" · "),
        event.notes ? compact(event.notes) : "",
        "<https://www.kijijimgmt.com/client-portal#calendar|Open the team calendar>",
      ].filter(Boolean).join("\n"),
    }),
  });
  if (!response.ok) throw new Error(`Event reminder Slack alert failed (${response.status}).`);
  return true;
};

const notifyEventReminder = async (event, reminderKey = "reminder-24h") => {
  if (await reminderWasSent(event.id, reminderKey)) return { sent: false, duplicate: true };
  const recipients = Object.values(TEAM_MEMBERS);
  const notification = {
    actor_email: "calendar@kijijimgmt.com",
    actor_name: "Kijiji Calendar",
    resource_type: "Event",
    resource_id: compact(event.id, ""),
    resource_title: compact(event.name, "Event"),
    operation: reminderKey,
    summary: `Tomorrow · ${compact(event.date)} · ${compact(event.type, "Event")} · Owner: ${compact(event.owner)}`,
    portal_url: "https://www.kijijimgmt.com/client-portal#calendar",
  };
  await insertNotifications(recipients.map((member) => ({ ...notification, recipient_email: member.email })));
  const deliveries = await Promise.allSettled([
    sendReminderEmails(recipients.map((member) => member.email), event),
    sendReminderSlack(event),
  ]);
  deliveries.forEach((result) => {
    if (result.status === "rejected") console.warn(`Event reminder delivery skipped: ${result.reason?.message || result.reason}`);
  });
  return { sent: true, duplicate: false };
};

const notifyPartners = async ({ resource, operation, input, saved, identity }) => {
  try {
    const recipients = Object.values(TEAM_MEMBERS).filter((member) => member.email !== identity?.email);
    const notification = {
      actor_email: compact(identity?.email, ""),
      actor_name: compact(identity?.fullName, "Team member"),
      resource_type: resourceLabel[resource] || "Record",
      resource_id: compact(saved.id, ""),
      resource_title: resourceTitle(resource, saved, input),
      operation: operation === "created" ? "created" : "updated",
      summary: notificationSummary(resource, input),
      portal_url: `https://www.kijijimgmt.com/client-portal#${portalSection[resource] || "my-work"}`,
    };
    await Promise.all([
      insertNotifications(recipients.map((member) => ({ ...notification, recipient_email: member.email }))),
      sendEmails(recipients.map((member) => member.email), notification),
    ]);
  } catch (error) {
    console.warn(`Partner notification skipped: ${error.message}`);
  }
};

module.exports = { notifyEventReminder, notifyPartners };
