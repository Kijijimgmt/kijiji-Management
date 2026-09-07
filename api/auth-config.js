const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const json = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
};

module.exports = async (request, response) => {
  if (request.method !== "GET") {
    json(response, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    json(response, 503, {
      ok: false,
      error: "supabase_auth_not_configured",
      message: "Supabase Auth is not configured in Vercel yet.",
    });
    return;
  }

  json(response, 200, {
    ok: true,
    supabaseUrl: SUPABASE_URL,
    supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
  });
};
