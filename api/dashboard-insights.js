const { verifyTeamAccess } = require("./lib/kijiji-auth");

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const INDUSTRY_BRIEFS_DATA_SOURCE_ID = String(
  process.env.NOTION_INDUSTRY_BRIEFS_DATA_SOURCE_ID || "17891f32-2874-492d-a6f6-67bdcefd4333",
).replace(/^collection:\/\//, "");
const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY;
const JOTFORM_FORM_IDS = String(process.env.JOTFORM_FORM_IDS || "262913925847065")
  .split(",")
  .map((id) => id.trim())
  .filter((id) => /^\d+$/.test(id))
  .slice(0, 5);

const json = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "private, no-store");
  response.end(JSON.stringify(body));
};

const textValue = (property) => (property?.title || property?.rich_text || [])
  .map((item) => item.plain_text || "")
  .join("");

const answerText = (value) => {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return Object.values(value).filter(Boolean).join(" ");
  return String(value ?? "").trim();
};

const mapSubmission = (submission, formId) => {
  const answers = Object.values(submission.answers || {})
    .map((item) => ({ question: String(item?.text || item?.name || "").trim(), answer: answerText(item?.answer) }))
    .filter((item) => item.question && item.answer && item.answer !== "No Answer")
    .slice(0, 80);
  const find = (pattern) => answers.find((item) => pattern.test(item.question))?.answer || "";

  return {
    id: String(submission.id || ""),
    formId,
    submittedAt: submission.created_at || submission.updated_at || "",
    status: submission.status || "ACTIVE",
    artistName: find(/artist\/?stage name/i) || find(/artist name/i) || "New assessment",
    contactName: find(/primary client contact/i),
    email: find(/^email$/i),
    priority: find(/top priority.*90 days/i),
    obstacle: find(/biggest obstacle/i),
    helpAreas: find(/three areas.*need help/i),
    answers,
  };
};

const fetchJotformSubmissions = async () => {
  if (!JOTFORM_API_KEY || !JOTFORM_FORM_IDS.length) return { submissions: [], configured: false };
  const groups = await Promise.all(JOTFORM_FORM_IDS.map(async (formId) => {
    const url = new URL(`https://api.jotform.com/form/${formId}/submissions`);
    url.searchParams.set("limit", "25");
    url.searchParams.set("orderby", "created_at");
    url.searchParams.set("direction", "DESC");
    const response = await fetch(url, { headers: { APIKEY: JOTFORM_API_KEY, Accept: "application/json" } });
    if (!response.ok) throw new Error(`Jotform request failed (${response.status}).`);
    const data = await response.json();
    return (Array.isArray(data.content) ? data.content : []).map((item) => mapSubmission(item, formId));
  }));
  return {
    configured: true,
    submissions: groups.flat().sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))).slice(0, 50),
  };
};

const fetchIndustryBriefs = async () => {
  if (!NOTION_TOKEN) return { briefs: [], configured: false };
  const response = await fetch(`https://api.notion.com/v1/data_sources/${INDUSTRY_BRIEFS_DATA_SOURCE_ID}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      page_size: 25,
      sorts: [{ property: "Issue Date", direction: "descending" }],
    }),
  });
  if (!response.ok) throw new Error(`Industry brief request failed (${response.status}).`);
  const data = await response.json();
  return {
    configured: true,
    briefs: data.results.filter((item) => item.object === "page").map((page) => {
      const properties = page.properties || {};
      return {
        id: page.id,
        title: textValue(properties.Brief) || "Kijiji Music Industry Brief",
        issueDate: properties["Issue Date"]?.date?.start || page.created_time,
        status: properties.Status?.select?.name || "Published",
        summary: textValue(properties["Executive Summary"]),
        keyMoves: textValue(properties["Key Moves"]),
        watchlist: textValue(properties.Watchlist),
        reportUrl: properties["Report URL"]?.url || page.url,
        notionUrl: page.url,
      };
    }),
  };
};

module.exports = async (request, response) => {
  try {
    await verifyTeamAccess(request);
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      json(response, 405, { error: "method_not_allowed", message: "Use GET." });
      return;
    }

    const [jotformResult, briefsResult] = await Promise.allSettled([
      fetchJotformSubmissions(),
      fetchIndustryBriefs(),
    ]);
    const jotform = jotformResult.status === "fulfilled" ? jotformResult.value : { submissions: [], configured: Boolean(JOTFORM_API_KEY), error: jotformResult.reason?.message };
    const industry = briefsResult.status === "fulfilled" ? briefsResult.value : { briefs: [], configured: Boolean(NOTION_TOKEN), error: briefsResult.reason?.message };
    json(response, 200, {
      submissions: jotform.submissions,
      briefs: industry.briefs,
      integrations: {
        jotform: { configured: jotform.configured, error: jotform.error || "" },
        industryBriefs: { configured: industry.configured, error: industry.error || "" },
      },
    });
  } catch (error) {
    json(response, error.statusCode || 500, { error: "dashboard_insights_error", message: error.message || "Unable to load dashboard reports." });
  }
};
