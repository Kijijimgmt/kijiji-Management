const { verifyTeamAccess } = require("./lib/kijiji-auth");

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const NOTION_VERSION = process.env.NOTION_VERSION || "2026-03-11";
const DOCUMENTS_DATA_SOURCE_ID = String(
  process.env.NOTION_DOCUMENTS_DATA_SOURCE_ID || "8ba38a00-a408-44c9-befe-293359292f75",
).replace(/^collection:\/\//, "");
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
