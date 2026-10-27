const { createHash } = require('node:crypto');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const MAX_BYTES = 3 * 1024 * 1024;
function validatePdf(input) {
  const filename = String(input.filename || '').replace(/[^\w. ()-]/g, '_').slice(0, 180);
  const encoded = String(input.base64 || '');
  if (!filename.toLowerCase().endsWith('.pdf') || encoded.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail('Choose a PDF up to 3 MB.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.subarray(0, 5).toString() !== '%PDF-') fail('Choose a valid PDF up to 3 MB.');
  return { filename, content_base64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'), byte_size: bytes.length, period: String(input.period || 'Not supplied').slice(0, 200) };
}
async function importPdf(submission, index, period) {
  const attachment = submission.attachments?.[Number(index)];
  if (!attachment) fail('Choose a file from this assessment.');
  const url = new URL(attachment.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/(^|\.)jotform(?:usercontent)?\.com$/.test(url.hostname)) fail('Download this file from Jotform and upload the PDF here instead.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) fail('Jotform could not provide this file. Download it and upload the PDF here instead.', 502);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) fail('This PDF exceeds 3 MB.');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) fail('This PDF exceeds 3 MB.'); chunks.push(Buffer.from(value)); } }
  finally { await reader.cancel().catch(() => {}); }
  return validatePdf({ filename: attachment.filename, period, base64: Buffer.concat(chunks).toString('base64') });
}
module.exports = { validatePdf, importPdf };
