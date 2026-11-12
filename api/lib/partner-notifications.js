const { TEAM_MEMBERS } = require("./kijiji-auth");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const compact = (value, fallback = "Not set") => String(value || fallback).trim().slice(0, 500);
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
    // Operational updates stay in the dashboard; website leads handle email separately.
    await insertNotifications(recipients.map((member) => ({ ...notification, recipient_email: member.email })));
  } catch (error) {
    console.warn(`Partner notification skipped: ${error.message}`);
  }
};

module.exports = { notifyEventReminder, notifyPartners };
