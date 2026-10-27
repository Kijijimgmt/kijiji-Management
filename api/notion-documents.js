const { verifyTeamAccess } = require("./lib/kijiji-auth");

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const DOCUMENTS_DATA_SOURCE_ID = String(
  process.env.NOTION_DOCUMENTS_DATA_SOURCE_ID || "8ba38a00-a408-44c9-befe-293359292f75",
).replace(/^collection:\/\//, "");
const INDUSTRY_BRIEFS_DATA_SOURCE_ID = String(
  process.env.NOTION_INDUSTRY_BRIEFS_DATA_SOURCE_ID || "17891f32-2874-492d-a6f6-67bdcefd4333",
).replace(/^collection:\/\//, "");
const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY;
const JOTFORM_FORM_IDS = String(process.env.JOTFORM_FORM_IDS || "262913925847065")
  .split(",")
  .map((id) => id.trim())
  .filter((id) => /^\d+$/.test(id))
  .slice(0, 5);
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "image/jpeg",
  "image/png",
]);

const json = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
};

const notionRequest = async (path, options = {}) => {
  if (!NOTION_TOKEN) {
    const error = new Error("Document storage is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const details = await response.text();
    const error = new Error(response.status === 403 || response.status === 404
      ? "Share the Kijiji Document Library with the portal's Notion integration."
      : `Document storage request failed (${response.status}).`);
    error.statusCode = response.status === 403 || response.status === 404 ? 503 : response.status;
    error.details = details;
    throw error;
  }

  return response.status === 204 ? null : response.json();
};

const textValue = (property) => {
  const values = property?.title || property?.rich_text || [];
  return values.map((item) => item.plain_text || "").join("");
};

const selectValue = (property) => property?.select?.name || "";
const relationIds = (property) => property?.relation?.map((item) => item.id) || [];

const mapDocument = (page) => {
  const properties = page.properties || {};
  const file = properties.File?.files?.[0];
  const source = file?.type === "file" ? file.file : file?.type === "external" ? file.external : null;

  return {
    id: page.id,
    notionUrl: page.url,
    name: textValue(properties.Document) || file?.name || "Untitled document",
    category: selectValue(properties.Category) || "Other",
    description: textValue(properties.Description),
    owner: textValue(properties.Owner) || "Kijiji team",
    status: selectValue(properties.Status) || "Active",
    clientIds: relationIds(properties.Client),
    uploadedAt: properties.Uploaded?.created_time || page.created_time,
    updatedAt: properties["Last Updated"]?.last_edited_time || page.last_edited_time,
    fileName: file?.name || "",
    fileUrl: source?.url || "",
    fileExpiry: source?.expiry_time || "",
  };
};

const listDocuments = async () => {
  const result = await notionRequest(`/data_sources/${DOCUMENTS_DATA_SOURCE_ID}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 100,
      filter: { property: "Status", select: { does_not_equal: "Archived" } },
      sorts: [{ property: "Last Updated", direction: "descending" }],
    }),
  });
  return result.results.filter((item) => item.object === "page").map(mapDocument);
};

const answerText = (value) => {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return Object.values(value).filter(Boolean).join(" ");
  return String(value ?? "").trim();
};

const mapSubmission = (submission, formId) => {
  const answers = Object.values(submission.answers || {})
    .filter((item) => item.type !== "control_fileupload")
    .map((item) => ({ question: String(item?.text || item?.name || "").trim(), answer: answerText(item?.answer) }))
    .filter((item) => item.question && item.answer && item.answer !== "No Answer")
    .slice(0, 150);
  const find = (pattern) => answers.find((item) => pattern.test(item.question))?.answer || "";
  return {
    id: String(submission.id || ""), formId,
    attachments: Object.values(submission.answers || {}).filter((item) => item.type === "control_fileupload").flatMap((item) => (Array.isArray(item.answer) ? item.answer : [item.answer]).filter(Boolean)).filter((url) => typeof url === "string" && /^https:\/\//.test(url)).map((url) => ({ url, filename: (() => { const name = url.split('/').pop().split('?')[0]; try { return decodeURIComponent(name); } catch { return name; } })() })),
    submittedAt: submission.created_at || submission.updated_at || "",
    status: submission.status || "ACTIVE",
    artistName: find(/artist\/?stage name/i) || find(/artist name/i) || "New assessment",
    contactName: find(/primary client contact/i), email: find(/^email$/i),
    priority: find(/top priority.*90 days/i), obstacle: find(/biggest obstacle/i),
    helpAreas: find(/three areas.*need help/i), answers,
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
  return { configured: true, submissions: groups.flat().sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))).slice(0, 50) };
};

const getStrategySubmission = async (id) => {
  if (!/^\d{1,30}$/.test(String(id))) throw Object.assign(new Error("Choose a valid assessment."), { statusCode: 400 });
  if (!JOTFORM_API_KEY) throw Object.assign(new Error("Jotform is not connected."), { statusCode: 503 });
  const response = await fetch(`https://api.jotform.com/submission/${id}`, { headers: { APIKEY: JOTFORM_API_KEY }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Object.assign(new Error("The assessment could not be loaded from Jotform."), { statusCode: 502 });
  const data = await response.json();
  if (!data.content || !JOTFORM_FORM_IDS.includes(String(data.content.form_id)) || data.content.status === "DELETED") throw Object.assign(new Error("This assessment is not in a connected Kijiji form."), { statusCode: 403 });
  return mapSubmission(data.content, String(data.content.form_id));
};

const fetchIndustryBriefs = async () => {
  const data = await notionRequest(`/data_sources/${INDUSTRY_BRIEFS_DATA_SOURCE_ID}/query`, {
    method: "POST",
    body: JSON.stringify({ page_size: 25, sorts: [{ property: "Issue Date", direction: "descending" }] }),
  });
  return {
    configured: true,
    briefs: data.results.filter((item) => item.object === "page").map((page) => {
      const properties = page.properties || {};
      return {
        id: page.id, title: textValue(properties.Brief) || "Kijiji Music Industry Brief",
        issueDate: properties["Issue Date"]?.date?.start || page.created_time,
        status: selectValue(properties.Status) || "Published",
        summary: textValue(properties["Executive Summary"]), keyMoves: textValue(properties["Key Moves"]),
        watchlist: textValue(properties.Watchlist), reportUrl: properties["Report URL"]?.url || page.url, notionUrl: page.url,
      };
    }),
  };
};

const listInsights = async () => {
  const [jotformResult, briefsResult] = await Promise.allSettled([fetchJotformSubmissions(), fetchIndustryBriefs()]);
  const jotform = jotformResult.status === "fulfilled" ? jotformResult.value : { submissions: [], configured: Boolean(JOTFORM_API_KEY), error: jotformResult.reason?.message };
  const industry = briefsResult.status === "fulfilled" ? briefsResult.value : { briefs: [], configured: Boolean(NOTION_TOKEN), error: briefsResult.reason?.message };
  return {
    submissions: jotform.submissions, briefs: industry.briefs,
    integrations: {
      jotform: { configured: jotform.configured, error: jotform.error || "" },
      industryBriefs: { configured: industry.configured, error: industry.error || "" },
    },
  };
};

const cleanFilename = (value) => String(value || "document")
  .replace(/[\\/\0\r\n]/g, "-")
  .replace(/[^a-zA-Z0-9._() -]/g, "")
  .slice(0, 180) || "document";

const inferredType = (filename) => {
  const extension = filename.split(".").pop().toLowerCase();
  return {
    pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain", md: "text/markdown", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  }[extension] || "";
};

const uploadDocument = async (input, identity) => {
  const filename = cleanFilename(input.filename);
  const contentType = String(input.contentType || inferredType(filename)).toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    const error = new Error("Upload a PDF, Office document, text file, JPG, or PNG.");
    error.statusCode = 400;
    throw error;
  }

  const bytes = Buffer.from(String(input.base64 || ""), "base64");
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) {
    const error = new Error("Files must be smaller than 3 MB.");
    error.statusCode = 413;
    throw error;
  }

  const upload = await notionRequest("/file_uploads", {
    method: "POST",
    body: JSON.stringify({ mode: "single_part", filename, content_type: contentType }),
  });
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), filename);
  await notionRequest(`/file_uploads/${upload.id}/send`, { method: "POST", body: form });

  const page = await notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: DOCUMENTS_DATA_SOURCE_ID },
      properties: {
        Document: { title: [{ text: { content: String(input.name || filename).slice(0, 200) } }] },
        Category: { select: { name: String(input.category || "Other").slice(0, 100) } },
        File: { files: [{ name: filename, type: "file_upload", file_upload: { id: upload.id } }] },
        Description: { rich_text: input.description ? [{ text: { content: String(input.description).slice(0, 1000) } }] : [] },
        Owner: { rich_text: [{ text: { content: String(identity.fullName || identity.email || "Kijiji team").slice(0, 200) } }] },
        Status: { select: { name: "Active" } },
        Client: { relation: input.clientId ? [{ id: String(input.clientId) }] : [] },
      },
    }),
  });
  return mapDocument(page);
};

module.exports = async (request, response) => {
  try {
    const identity = await verifyTeamAccess(request);
    if (request.method === "GET") {
      if (request.query?.view === "insights") {
        json(response, 200, await listInsights());
        return;
      }
      json(response, 200, { documents: await listDocuments() });
      return;
    }
    if (request.method === "POST") {
      const input = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
      json(response, 201, { document: await uploadDocument(input, identity) });
      return;
    }
    response.setHeader("Allow", "GET, POST");
    json(response, 405, { error: "method_not_allowed", message: "Use GET or POST." });
  } catch (error) {
    console.error("Document library request failed", error.details || error);
    json(response, error.statusCode || 500, { error: "document_library_error", message: error.message || "Unable to use the document library." });
  }
};
module.exports.getStrategySubmission = getStrategySubmission;
