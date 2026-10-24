const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { normalizeEntry } = require("../api/lib/_artist-workspace");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  let failSave = false;
  const entries = [];
  await page.route("https://workspace.test/**", async (route) => {
    if (!route.request().url().includes("/api/")) return route.fulfill({ contentType: "text/html", body: "<html><body></body></html>" });
    const body = route.request().postDataJSON();
    if (body && failSave) return route.fulfill({ status: 503, json: { message: "Test storage unavailable" } });
    const entry = body ? { ...normalizeEntry(body), author: "Joe", createdAt: new Date().toISOString(), id: `entry-${entries.length}` } : null;
    if (entry) entries.unshift(entry);
    await route.fulfill({ json: body ? { entry } : { entries, aiReady: false } });
  });
  await page.goto("https://workspace.test/");
  await page.setContent('<main style="max-width:1100px;margin:20px auto;padding:20px"><section id="profile"></section></main>');
  await page.addStyleTag({ content: fs.readFileSync(path.join(__dirname, "../portal.css"), "utf8") });
  await page.evaluate(() => {
    window.client = { id: "test", name: "Test Artist", owner: "Joe", status: "Active", nextAction: "Plan release" };
    window.state = { selectedClientId: "test", teamUser: { email: "joe@kijijimgmt.com" }, actions: [{ id: "task", title: "Review contract", status: "Open", clientIds: ["test"] }], events: [{ id: "show", name: "Launch show", clientIds: ["test"], date: "2026-11-20" }], documents: [] };
    window.escapeHtml = (value) => String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
    window.getRequestHeaders = () => ({ "Content-Type": "application/json" });
    window.parseJsonResponse = (r) => r.json();
    window.getRelated = (items, id) => items.filter((i) => i.clientIds.includes(id));
    window.isComplete = (i) => i.status === "Done";
    window.formatDate = (d) => d || "No date";
    window.openEventForm = () => {};
    window.renderDocuments = () => {};
  });
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "../artist-workspace.js"), "utf8") });
  await page.evaluate(() => renderArtistWorkspace(client, document.querySelector("#profile")));
  await page.waitForFunction(() => !document.body.textContent.includes("Loading shared artist"));
  for (const tab of ["Tasks", "Events & tickets", "Socials", "Marketing", "Files", "Overview"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
  }
  assert.equal(await page.locator("[data-artist-legacy] > summary").count(), 1);
  await page.getByRole("button", { name: "Socials", exact: true }).click();
  await page.getByText("Add social metrics", { exact: true }).click();
  await page.locator('[name="followers"]').fill("0");
  await page.getByRole("button", { name: "Save to artist profile", exact: true }).click();
  await page.getByText("Saved to the shared artist profile.", { exact: true }).waitFor();
  assert.equal(entries[0].followers, 0);
  assert(await page.getByText("Not entered", { exact: true }).count() >= 2);
  await page.getByRole("button", { name: "Marketing", exact: true }).click();
  await page.getByText("Create a marketing draft", { exact: true }).click();
  assert(await page.getByRole("button", { name: "Draft with AI" }).isDisabled());
  await page.locator('[name="title"]').fill("Launch email");
  await page.locator('[name="content"]').fill("Review this draft before sending.");
  failSave = true;
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("Test storage unavailable", { exact: true }).waitFor();
  assert.equal(await page.locator('[name="content"]').inputValue(), "Review this draft before sending.");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "Marketing", exact: true }).click();
  assert.equal(await page.locator('[name="title"]').inputValue(), "Launch email");
  failSave = false;
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("Saved to the shared artist profile.", { exact: true }).waitFor();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => document.documentElement.dataset.theme = theme, theme);
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${theme} mobile overflow`);
  }
  await page.screenshot({ path: "/tmp/kijiji-artist-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: "/tmp/kijiji-artist-desktop.png", fullPage: true });
  assert.deepEqual(errors, []);
  const integrated = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  integrated.on("pageerror", (error) => errors.push(error.message));
  await integrated.addInitScript(() => {
    localStorage.setItem("kijiji-dashboard-tour-v3:max@kijijimgmt.com", "complete");
    window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: { access_token: "test" } } }),
      onAuthStateChange: () => {},
    } }) };
  });
  await integrated.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "workspace.test") return route.fulfill({ body: "" });
    if (url.pathname.startsWith("/api/")) {
      let body = {};
      if (url.pathname.endsWith("auth-config")) body = { supabaseUrl: "https://auth.test", supabasePublishableKey: "test" };
      else if (url.searchParams.get("view") === "artist-workspace") body = { entries: [], aiReady: false };
      else if (url.pathname.endsWith("notion-clients")) body = { clients: [{ id: "artist-1", name: "Bobby Outside", status: "Active", owner: "Maxwell", category: "Artist / Personality", nextAction: "Plan the next release campaign" }], actions: [], events: [], opportunities: [], source: { user: { email: "max@kijijimgmt.com", fullName: "Maxwell", owner: "Maxwell", isAdmin: true } } };
      return route.fulfill({ json: body });
    }
    const filename = url.pathname === "/" ? "client-portal.html" : url.pathname.slice(1);
    const file = path.join(__dirname, "..", filename);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ path: file, contentType: filename.endsWith(".html") ? "text/html" : filename.endsWith(".css") ? "text/css" : filename.endsWith(".js") ? "application/javascript" : "image/jpeg" });
  });
  await integrated.goto("https://workspace.test/#clients");
  await integrated.getByRole("button", { name: "Marketing", exact: true }).waitFor();
  await integrated.getByRole("button", { name: "Marketing", exact: true }).click();
  await integrated.getByText("Create a marketing draft", { exact: true }).waitFor();
  await integrated.getByRole("button", { name: "Overview", exact: true }).click();
  await integrated.screenshot({ path: "/tmp/kijiji-artist-integrated.png", fullPage: true });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log("PASS: six tabs, profile loading, zero metrics, draft save/failure/retention, AI unavailable state, mobile layout, both themes.");
})().catch((error) => { console.error(error); process.exit(1); });
