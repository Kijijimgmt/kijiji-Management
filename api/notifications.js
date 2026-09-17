const { verifyTeamAccess } = require("./lib/kijiji-auth");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "private, no-store");
  response.end(JSON.stringify(body));
};

const dbRequest = async (path, options = {}) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error("Dashboard notifications are not configured yet.");
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Notification request failed (${response.status}).`);
  return response.status === 204 ? null : response.json();
};

module.exports = async (request, response) => {
  try {
    if (request.method === "OPTIONS") return json(response, 204, {});
    const identity = await verifyTeamAccess(request);
    const recipient = encodeURIComponent(identity.email);

    if (request.method === "GET") {
      const notifications = await dbRequest(`portal_notifications?recipient_email=eq.${recipient}&order=created_at.desc&limit=40`, {
        headers: { Accept: "application/json" },
      });
      return json(response, 200, { notifications });
    }

    if (request.method === "PATCH") {
      const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
      const idFilter = body.id ? `&id=eq.${encodeURIComponent(String(body.id))}` : "&read_at=is.null";
      await dbRequest(`portal_notifications?recipient_email=eq.${recipient}${idFilter}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ read_at: new Date().toISOString() }),
      });
      return json(response, 200, { ok: true });
    }

    return json(response, 405, { error: "method_not_allowed" });
  } catch (error) {
    return json(response, error.statusCode || 500, { error: "notifications_error", message: error.message });
  }
};
