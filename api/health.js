const { assertHealthToken, getDeepHealth, getEnvironmentSummary } = require("./lib/kijiji-ops");

const json = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
};

module.exports = async (request, response) => {
  try {
    if (request.method !== "GET") {
      json(response, 405, { ok: false, error: "method_not_allowed" });
      return;
    }

    const url = new URL(request.url || "/api/health", "https://www.kijijimgmt.com");
    const deep = url.searchParams.get("deep") === "1";

    if (!deep) {
      json(response, 200, {
        ok: true,
        ...getEnvironmentSummary(),
        deep: false,
      });
      return;
    }

    assertHealthToken(request);
    const health = await getDeepHealth();
    json(response, health.ok ? 200 : 503, health);
  } catch (error) {
    json(response, error.statusCode || 500, {
      ok: false,
      error: error.code || "health_check_failed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};
