const { TEAM_MEMBERS } = require("./lib/kijiji-auth");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vaqgriohhcccvvxgkhgh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_DPHPYm5DJGMqw13aiZP76w_q7pNidrn";
const allowedOrigins = new Set(["https://www.kijijimgmt.com", "https://kijijimgmt.com"]);
const recentRequests = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;

const json = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
};

const parseBody = (body) => {
  if (!body) {
    return {};
  }

  return typeof body === "string" ? JSON.parse(body) : body;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const cleanRedirectTo = (value) => {
  const fallback = "https://www.kijijimgmt.com/client-portal";

  try {
    const url = new URL(String(value || fallback));
    if (!allowedOrigins.has(url.origin) || url.pathname !== "/client-portal") {
      return fallback;
    }

    return `${url.origin}${url.pathname}`;
  } catch {
    return fallback;
  }
};

const checkRateLimit = (email, request) => {
  const key = `${email}:${request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown"}`;
  const now = Date.now();
  const lastRequestAt = recentRequests.get(key) || 0;

  if (now - lastRequestAt < RATE_LIMIT_WINDOW_MS) {
    return false;
  }

  recentRequests.set(key, now);
  return true;
};

module.exports = async (request, response) => {
  try {
    if (request.method !== "POST") {
      json(response, 405, { ok: false, error: "method_not_allowed", message: "Use POST to request a sign-in link." });
      return;
    }

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      json(response, 503, {
        ok: false,
        error: "supabase_auth_not_configured",
        message: "Supabase Auth is not configured for the team portal.",
      });
      return;
    }

    const body = parseBody(request.body);
    const email = normalizeEmail(body.email);
    const redirectTo = cleanRedirectTo(body.redirectTo);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      json(response, 400, { ok: false, error: "invalid_email", message: "Enter a valid Kijiji team email." });
      return;
    }

    if (!TEAM_MEMBERS[email]) {
      json(response, 403, {
        ok: false,
        error: "team_member_not_allowed",
        message: "This email is not approved for the Kijiji team portal.",
      });
      return;
    }

    if (!checkRateLimit(email, request)) {
      json(response, 429, {
        ok: false,
        error: "too_many_requests",
        message: "A sign-in link was just requested. Wait a minute, then try again.",
      });
      return;
    }

    const authResponse = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
          "X-Client-Info": "kijiji-team-portal",
        },
        body: JSON.stringify({
          email,
          create_user: true,
          data: {
            portal: "kijiji-team",
          },
          gotrue_meta_security: {},
        }),
      }
    );

    if (!authResponse.ok) {
      const details = await authResponse.text();
      json(response, authResponse.status >= 500 ? 502 : authResponse.status, {
        ok: false,
        error: "supabase_auth_request_failed",
        message: "Supabase could not send the sign-in link. Check Auth email and redirect URL settings.",
        details: details.slice(0, 500),
      });
      return;
    }

    json(response, 200, { ok: true, message: "Check your inbox for the secure Kijiji sign-in link." });
  } catch (error) {
    json(response, 500, {
      ok: false,
      error: "auth_link_failed",
      message: error.message || "Unable to request a sign-in link.",
    });
  }
};
