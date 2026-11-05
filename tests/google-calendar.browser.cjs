const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE,
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1200, height: 900 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const day = "2026-11-06";
    let response = {
      configured: true,
      canManage: false,
      connection: { status: "connected" },
      links: [
        {
          id: "map1",
          clientId: "c1",
          calendarName: "Client One Work",
          timeZone: "America/New_York",
          color: "#246b8e",
          lastSuccessAt: new Date().toISOString(),
          status: "connected",
          events: [
            {
              id: "event1",
              name: "<script>bad()</script> Client session",
              start: day + "T10:00:00-05:00",
              end: day + "T11:00:00-05:00",
              description: "<img src=x onerror=bad()>",
              allDay: false,
            },
            {
              id: "day1",
              name: "Two-day event",
              start: day,
              end: "2026-11-08",
              allDay: true,
            },
          ],
        },
      ],
    };
    const createAttempts = [];
    await page.route("https://calendar.test/**", (route) => {
      if (route.request().url().includes("action=create-event")) {
        createAttempts.push(route.request().postDataJSON());
        if (createAttempts.length === 1)
          return route.fulfill({
            status: 502,
            json: {
              message: "Google did not confirm the save. Retry this form.",
            },
          });
        return route.fulfill({
          json: { ...response, created: { id: "new-event", cached: true } },
        });
      }
      return route.request().url().includes("/api/")
        ? route.fulfill({ json: response })
        : route.fulfill({
            contentType: "text/html",
            body: '<meta name="viewport" content="width=device-width,initial-scale=1"><div data-google-calendar-controls></div><main data-grid></main><div data-profile></div>',
          });
    });
    await page.goto("https://calendar.test");
    await page.evaluate(() => {
      window.state = {
        teamUser: { email: "joe@kijijimgmt.com" },
        clients: [
          { id: "c1", name: "Client One" },
          { id: "c2", name: "Client Two" },
        ],
      };
      window.escapeHtml = (s) =>
        String(s)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      window.getRequestHeaders = () => ({});
      window.parseJsonResponse = (r) => r.json();
      window.formatDate = (s) => s;
      window.getDaysUntil = () => 1;
      window.renderCalendar = window.renderPortal = () => {
        document.querySelector("[data-grid]").innerHTML = window.googleCalendar
          .events()
          .filter(window.googleCalendar.matches)
          .map(window.googleCalendar.card)
          .join("");
        document.querySelector("[data-profile]").innerHTML =
          window.googleCalendar.profile(state.clients[0]);
      };
    });
    await page.addStyleTag({ content: fs.readFileSync("portal.css", "utf8") });
    await page.addScriptTag({
      content: fs.readFileSync("google-calendar.js", "utf8"),
    });
    await page.evaluate(async () => {
      await window.loadGoogleCalendar();
      renderPortal();
    });
    assert.equal(
      await page.locator("[data-grid] [data-google-event-id]").count(),
      2,
    );
    assert.equal(
      await page.locator("[data-google-action=connect]").count(),
      0,
      "members have no OAuth control",
    );
    assert.equal(await page.locator("[data-grid] script").count(), 0);
    await page.locator("[data-grid] [data-google-event-id]").first().click();
    await page.locator("dialog[open]").waitFor();
    assert(
      (await page.locator("dialog[open]").innerText()).includes("Read only"),
    );
    assert.equal(
      await page
        .locator("dialog input,dialog textarea,dialog [data-event-id]")
        .count(),
      0,
    );
    assert.equal(await page.locator("dialog[open] img").count(), 0);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator("[data-google-client]").selectOption("c2");
    assert.equal(
      await page.locator("[data-grid] [data-google-event-id]").count(),
      0,
    );
    await page.locator("[data-google-client]").selectOption("");
    await page.locator("[data-google-source]").selectOption("internal");
    assert.equal(
      await page.locator("[data-grid] [data-google-event-id]").count(),
      0,
    );
    await page.locator("[data-google-source]").selectOption("all");
    const dates = await page.evaluate(() => {
      const day = googleCalendar.events().find((e) => e.allDay);
      return ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"].map((k) =>
        googleCalendar.occurs(day, k),
      );
    });
    assert.deepEqual(dates, [false, true, true, false]);
    await page
      .locator("[data-google-zone]")
      .selectOption("America/Los_Angeles");
    assert((await page.locator("[data-grid]").innerText()).includes("7:00"));
    for (const theme of ["light", "dark"])
      for (const width of [320, 390, 1200]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        await page.setViewportSize({ width, height: 900 });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${theme} ${width} overflow`,
        );
      }
    // Exercise the actual management calendar renderer, not just the imported-event helper.
    await page.evaluate(() => {
      document.querySelector("[data-grid]").innerHTML =
        '<div data-real-period></div><div class="calendar-grid-wrap"><div data-real-grid></div></div><span data-real-count></span><div data-real-agenda></div>';
      window.els = {
        calendarPeriod: document.querySelector("[data-real-period]"),
        calendarGrid: document.querySelector("[data-real-grid]"),
        calendarUpcomingCount: document.querySelector("[data-real-count]"),
        calendarList: document.querySelector("[data-real-agenda]"),
        calendarViewButtons: [],
      };
      window.state.events = [
        {
          id: "internal1",
          name: "Internal planning",
          date: "2026-11-06",
          clientIds: ["c1"],
        },
      ];
      window.calendarView = "month";
      window.calendarCursor = new Date(2026, 10, 6);
      window.todayISO = "2026-11-05";
      window.isCurrentRecord = () => true;
      window.isLiveEvent = () => true;
      window.startOfWeek = (d) => {
        const x = new Date(d);
        x.setDate(x.getDate() - x.getDay());
        return x;
      };
      window.addDays = (d, n) => {
        const x = new Date(d);
        x.setDate(x.getDate() + n);
        return x;
      };
      window.toLocalISODate = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      window.getClientName = (ev) =>
        state.clients.find((c) => ev.clientIds.includes(c.id))?.name || "";
      window.formatCountdown = () => "";
      window.eventCard = (ev) =>
        `<button data-event-id="${ev.id}">${ev.name}</button>`;
      window.renderEmptyList = () => {};
    });
    const portalSource = fs.readFileSync("portal.js", "utf8");
    const renderer = portalSource
      .slice(
        portalSource.indexOf("const renderCalendar ="),
        portalSource.indexOf("const renderDocuments ="),
      )
      .replace("const renderCalendar =", "window.renderCalendar =");
    await page.addScriptTag({ content: renderer });
    await page.evaluate(() => renderCalendar());
    assert.equal(
      await page
        .locator('[data-real-grid] [data-event-id="internal1"]')
        .count(),
      1,
    );
    assert.equal(
      await page.locator("[data-real-grid] [data-google-event-id]").count(),
      3,
      "one timed instance plus two all-day date cells",
    );
    assert.equal(
      await page
        .locator("[data-real-grid] [data-google-event-id][data-event-id]")
        .count(),
      0,
      "imported events never enter the internal editor path",
    );
    assert.equal(
      await page.evaluate(() => state.events.length),
      1,
      "Notion event state stays separate",
    );
    await page
      .locator("[data-real-grid] [data-google-event-id]")
      .first()
      .click();
    await page.locator("dialog[open]").waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    response = { ...response, canManage: true };
    await page.evaluate(async () => {
      await loadGoogleCalendar();
      renderPortal();
    });
    assert.equal(await page.locator("[data-google-action=connect]").count(), 1);
    response.connection.canCreate = true;
    response.links[0].canCreate = true;
    response.links[0].allowCreate = true;
    await page.evaluate(async () => {
      await loadGoogleCalendar();
      renderCalendar();
    });
    await page
      .locator("[data-google-calendar-controls] [data-google-create]")
      .click();
    await page
      .locator("[data-google-create-form] [name=title]")
      .fill("Partner rehearsal");
    await page
      .locator("[data-google-create-form] [name=startLocal]")
      .fill("2026-11-20T09:00");
    await page
      .locator("[data-google-create-form] [name=endLocal]")
      .fill("2026-11-20T10:00");
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert(
        await page
          .locator(".google-create-dialog")
          .evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
        "creation form fits phone",
      );
    }
    await page
      .getByRole("button", { name: "Review event", exact: true })
      .click();
    assert.equal(createAttempts.length, 0, "review does not send an event");
    assert(
      (await page.locator("[data-google-create-review]").innerText()).includes(
        "Client One Work",
      ),
    );
    await page
      .getByRole("button", {
        name: "Add event to Client One’s Google Calendar",
        exact: true,
      })
      .click();
    await page
      .getByText("Google did not confirm the save. Retry this form.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.locator("[data-google-create-form] [name=title]").inputValue(),
      "Partner rehearsal",
    );
    await page
      .getByRole("button", {
        name: "Add event to Client One’s Google Calendar",
        exact: true,
      })
      .click();
    await page.locator(".google-create-dialog").waitFor({ state: "hidden" });
    assert.equal(createAttempts.length, 2);
    assert.equal(
      createAttempts[0].requestId,
      createAttempts[1].requestId,
      "retries use the same stable request ID",
    );
    await page.evaluate(() => {
      clearGoogleCalendar();
      state.teamUser = null;
    });
    assert.equal(await page.evaluate(() => googleCalendar.events().length), 0);
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: "/tmp/kijiji-google-calendar-mobile.png",
      fullPage: true,
    });
    console.log(
      "PASS: read-only details, role controls, source/client filters, exclusive all-day dates, zone conversion, mobile themes, logout clearing.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
