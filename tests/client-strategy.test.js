const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handleStrategy, extractResponse, PROMPT } = require("../api/lib/_client-strategy");
test("incomplete responses and absent content cannot be saved", () => {
  assert.throws(() => extractResponse({ status: "incomplete", output: [] }), /incomplete/);
  assert.throws(() => extractResponse({ status: "completed", output: [] }), /no strategy/);
  const result = extractResponse({ status: "completed", output: [{ content: [{ type: "output_text", text: "Plan", annotations: [{ type: "url_citation", title: "Evidence", url: "https://example.com" }, { type: "url_citation", url: "javascript:bad" }] }] }] });
  assert.equal(result.citations.length, 1);
});
test("partner cannot approve even with a forged approval request", async () => {
  await assert.rejects(handleStrategy({ request: { method: "POST", body: { action: "approve" } }, identity: { isAdmin: false }, client: { id: "a" }, assertWritesAllowed() {}, storage() { throw new Error("Should not access storage"); } }), /Max approves/);
});
test("shared initial plan is returned without AI or another generation", async () => {
  const plan = { id: "existing", kind: "initial" };
  const result = await handleStrategy({ request: { method: "POST", body: { action: "initial" } }, identity: {}, client: { id: "a" }, assertWritesAllowed() {}, storage: async (path) => path.startsWith("client_strategy_state?") ? [] : [plan], generator() { throw new Error("Should not generate"); } });
  assert.equal(result.versions[0].id, "existing");
});
test("generation failure releases only its own lock", async () => {
  process.env.OPENAI_API_KEY = "test-only";
  const writes = [];
  const storage = async (path, body) => {
    if (path.startsWith("client_strategy_")) return [];
    writes.push([path, body]);
    if (path.includes("claim")) return { status: "claimed", token: "owned-token" };
  };
  await assert.rejects(handleStrategy({ request: { method: "POST", body: { action: "initial", submissionId: "123" } }, identity: {}, client: { id: "a" }, assertWritesAllowed() {}, storage, getStrategySubmission: async () => ({ id: "123", answers: [{ question: "Goal", answer: "Tour" }] }), generator: async () => { throw new Error("AI unavailable"); } }), /AI unavailable/);
  assert.equal(writes.at(-1)[0], "rpc/release_client_strategy");
  assert.equal(writes.at(-1)[1].p_token, "owned-token");
  delete process.env.OPENAI_API_KEY;
});
test("strategy instructions preserve the agreed management approach", () => {
  for (const phrase of ["unanswered question", "existing assets", "responsible role", "weekly review", "continue/change/stop", "private intake", "entertainment business", "scriptwriters", "social personalities", "rather than assume everyone is a musician"]) assert(PROMPT.includes(phrase));
});
