const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeEntry, handleArtistWorkspace, readEntries } = require("../api/lib/_artist-workspace");
const client = { id: "artist-1", name: "Test Artist" };
const dashboard = { events: [{ id: "event-1", name: "Show", clientIds: [client.id] }] };
test("ticket entries validate event scope, counts, currency and links", () => {
  const valid = { kind: "tickets", eventId: "event-1", sold: "0", capacity: "100", revenue: "", currency: "USD", date: "2026-10-24" };
  assert.equal(normalizeEntry(valid, dashboard, client).revenue, null);
  assert.equal(normalizeEntry(valid, dashboard, client).sold, 0);
  for (const patch of [{ sold: 101 }, { sold: -1 }, { sold: 1.5 }, { eventId: "other" }, { currency: "BAD" }, { ticketUrl: "javascript:alert(1)" }, { date: "2026-02-30" }]) {
    assert.throws(() => normalizeEntry({ ...valid, ...patch }, dashboard, client));
  }
});
test("social snapshots distinguish zero from absent values", () => {
  const valid = { kind: "social", platform: "Instagram", date: "2026-10-24", followers: "0", views: "", engagement: "" };
  assert.deepEqual([normalizeEntry(valid).followers, normalizeEntry(valid).views], [0, null]);
  assert.throws(() => normalizeEntry({ ...valid, engagement: 101 }));
  assert.throws(() => normalizeEntry({ ...valid, followers: "" }));
});
test("saved entries round trip through paginated Notion blocks without touching existing content", async () => {
  let blocks;
  const notionRequest = async (path, options) => {
    assert.equal(options.method, "PATCH");
    assert.equal(path, "/blocks/artist-1/children");
    blocks = JSON.parse(options.body).children;
    return { results: [{ id: "entry-1" }] };
  };
  const content = "Long draft & quotes \"\n".repeat(300);
  const result = await handleArtistWorkspace({ request: { method: "POST", body: { kind: "draft", format: "Email", title: "Launch", content } }, identity: { fullName: "Joe" }, client, dashboard, notionRequest, assertWritesAllowed() {} });
  assert.equal(result.entry.author, "Joe");
  assert(blocks[0].code.rich_text.every((part) => part.text.content.length <= 1800));
  let calls = 0;
  const entries = await readEntries(async () => ++calls === 1 ? { results: [{ type: "paragraph" }], has_more: true, next_cursor: "next" } : { results: [{ ...blocks[0], id: "entry-1" }], has_more: false }, client.id);
  assert.equal(entries[0].content, content.trim());
  assert.equal(calls, 2);
});
test("write guard blocks writes and unsupported methods fail", async () => {
  const args = { request: { method: "POST", body: {} }, client, dashboard, identity: {}, assertWritesAllowed() { throw new Error("Writes disabled"); } };
  await assert.rejects(handleArtistWorkspace(args), /Writes disabled/);
  await assert.rejects(handleArtistWorkspace({ ...args, request: { method: "DELETE" } }), /Method not allowed/);
});

test("meeting entries validate Zoom destinations, timezone and paired date/time", () => {
  const valid = { kind: "meeting", mode: "draft", zoomUrl: "https://us02web.zoom.us/j/123", meetingDate: "2026-11-20", meetingTime: "14:30", timeZone: "America/New_York", agenda: "Review goals" };
  assert.equal(normalizeEntry(valid).meetingTime, "14:30");
  assert.equal(normalizeEntry({ kind: "meeting", mode: "draft" }).meetingDate, "");
  for (const patch of [{ zoomUrl: "https://zoom.us.evil.test/j/123" }, { zoomUrl: "javascript:alert(1)" }, { timeZone: "Not/AZone" }, { meetingDate: "2026-02-30" }, { meetingTime: "25:00" }, { meetingTime: "" }, { mode: "recap" }]) assert.throws(() => normalizeEntry({ ...valid, ...patch }));
  assert.equal(normalizeEntry({ ...valid, mode: "recap", decisions: "Confirm direction" }).decisions, "Confirm direction");
});
test("meeting recap is saved with server author and read back through existing storage", async () => {
  let block;
  const saved = await handleArtistWorkspace({ request: { method: "POST", body: { kind: "meeting", mode: "recap", notes: "Agreed priorities", author: "Forged" } }, client, dashboard, identity: { fullName: "Erik" }, assertWritesAllowed() {}, notionRequest: async (path, options) => { block = JSON.parse(options.body).children[0]; return { results: [{ id: "meeting-1" }] }; } });
  assert.equal(saved.entry.author, "Erik");
  const entries = await readEntries(async () => ({ results: [{ ...block, id: "meeting-1" }] }), client.id);
  assert.equal(entries[0].notes, "Agreed priorities");
  assert.equal(entries[0].mode, "recap");
});
