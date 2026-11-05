const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), { statusCode });
};
async function store(path, body, method = body ? "POST" : "GET", extra = {}) {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    fail("Calendar storage is not configured. Ask Max to finish setup.", 503);
  const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    if (["42P01", "PGRST202", "PGRST205"].includes(d.code))
      fail("Calendar storage needs its setup migration.", 503);
    fail("Calendar storage is unavailable. Try again shortly.", 503);
  }
  const raw = await r.text();
  return raw ? JSON.parse(raw) : null;
}
module.exports = { store, fail };
