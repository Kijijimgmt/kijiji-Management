/* Client Google schedules and explicitly enabled event creation. Notion events stay separate. */
(() => {
  const PALETTE = [
    "#955020",
    "#246b8e",
    "#7254a0",
    "#29735c",
    "#a23d58",
    "#78651c",
    "#4563a5",
    "#9a4c85",
    "#437a27",
    "#b24b25",
    "#4f6570",
    "#6962b0",
  ];
  let data = { links: [], connection: { status: "loading" } },
    discovered = [],
    loading = false,
    message = "",
    selectedClient = "",
    source = "all",
    epoch = 0;
  let zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const endpoint = "/api/notion-clients?view=google-calendar";
  const e = (value) => escapeHtml(String(value ?? ""));
  const stamp = (value) =>
    value ? new Date(value).toLocaleString() : "Not synced yet";
  const dateKey = (value) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const api = async (action = "read", body) => {
    const r = await fetch(`${endpoint}&action=${action}`, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: getRequestHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await parseJsonResponse(r);
    if (!r.ok)
      throw new Error(result.message || "Calendar connection unavailable.");
    return result;
  };
  function events() {
    return (data.links || [])
      .filter((link) => state.clients.some((c) => c.id === link.clientId))
      .flatMap((link) =>
        (link.events || []).map((event) => ({
          ...event,
          id: `google:${link.id}:${event.id}`,
          googleEventId: event.id,
          source: "google",
          readOnly: true,
          clientIds: [link.clientId],
          clientName:
            state.clients.find((c) => c.id === link.clientId)?.name || "Client",
          calendarName: link.calendarName,
          color: link.color,
          lastSuccessAt: link.lastSuccessAt,
          syncStatus: link.status,
          date: event.allDay ? event.start : dateKey(event.start),
          name: event.name,
        })),
      );
  }
  function matches(event) {
    return (
      (!selectedClient || event.clientIds?.includes(selectedClient)) &&
      (source === "all" ||
        (source === "google") === (event.source === "google"))
    );
  }
  function occurs(event, key) {
    if (event.source !== "google")
      return String(event.date).slice(0, 10) === key;
    if (event.allDay) return event.start <= key && event.end > key;
    return (
      dateKey(event.start) <= key &&
      dateKey(new Date(new Date(event.end).getTime() - 1)) >= key
    );
  }
  function upcoming(event) {
    if (event.source !== "google") return getDaysUntil(event.date) >= 0;
    return event.allDay
      ? event.end > dateKey(new Date())
      : new Date(event.end) > new Date();
  }
  function when(event) {
    if (event.allDay) {
      const end = new Date(`${event.end}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() - 1);
      return `${formatDate(event.start)}${end.toISOString().slice(0, 10) !== event.start ? ` – ${formatDate(end.toISOString().slice(0, 10))}` : ""} · All day`;
    }
    const opts = {
      timeZone: zone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    };
    return `${new Date(event.start).toLocaleString(undefined, opts)} – ${new Date(event.end).toLocaleString(undefined, opts)}`;
  }
  const card = (event) =>
    `<button type="button" class="calendar-item google-event-card" data-google-event-id="${e(event.id)}" style="--client-color:${e(event.color)}"><span>${e(when(event))}</span><strong>${e(event.name)}</strong><em>${e(event.clientName)} · Google Calendar · Read only</em><small>Synced ${e(stamp(event.lastSuccessAt))}${event.syncStatus !== "connected" || Date.now() - new Date(event.lastSuccessAt).getTime() > 15 * 60000 ? " · Update delayed" : ""}</small></button>`;
  const statusText = () =>
    ({
      setup_needed: "Google Calendar setup needed",
      not_connected: "Google account not connected",
      reconnect: "Google account needs reconnecting",
      connected: "Google account connected",
      error: "Calendar connection unavailable",
      loading: "Checking Google connection…",
    })[data.connection?.status] || "Calendar connection unavailable";
  const createButton = (clientId = "") =>
    `<button type="button" class="button button-primary" data-google-create="${e(clientId)}" ${(data.links || []).some((l) => l.canCreate && (!clientId || l.clientId === clientId)) ? "" : "disabled"}>Add to client Google Calendar</button>`;
  function profile(client) {
    const links = (data.links || []).filter((l) => l.clientId === client.id);
    const list = events()
      .filter((ev) => ev.clientIds.includes(client.id) && upcoming(ev))
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 12);
    return `<section class="artist-section google-profile-schedule" data-google-profile-client="${e(client.id)}"><div class="artist-section-head"><h3>Shared schedule</h3>${createButton(client.id)}</div><details class="google-profile-details"><summary>Calendar details</summary><p>${e(statusText())}. Client updates and Kijiji-created events share the same Google calendar.</p>${links.map((l) => `<p><span class="calendar-color-dot" style="--client-color:${e(l.color)}"></span> ${e(l.calendarName)} · Last sync: ${e(stamp(l.lastSuccessAt))}${l.message ? `<br>${e(l.message)}` : ""}</p>`).join("")}</details>${list.map(card).join("") || `<p>${links.length ? "No upcoming imported events in the connected range." : "No Google calendar is mapped to this client yet."}</p>`}</section>`;
  }
  function controls() {
    const host = document.querySelector("[data-google-calendar-controls]");
    if (!host) return;
    const links = data.links || [];
    const zones = [
      ...new Set([
        zone,
        "UTC",
        "America/New_York",
        "America/Los_Angeles",
        ...links.map((l) => l.timeZone),
      ]),
    ];
    const wasOpen = Boolean(host.querySelector(".google-connections[open]"));
    host.innerHTML = `<div class="google-calendar-filters"><label>Client<select data-google-client><option value="">All clients</option>${state.clients.map((c) => `<option value="${e(c.id)}" ${selectedClient === c.id ? "selected" : ""}>${e(c.name)}</option>`).join("")}</select></label><label>Events<select data-google-source>${[
      ["all", "Internal & Google"],
      ["internal", "Internal Kijiji only"],
      ["google", "Client Google only"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${source === v ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Display timezone<select data-google-zone>${zones.map((z) => `<option ${zone === z ? "selected" : ""}>${e(z)}</option>`).join("")}</select></label>${createButton(selectedClient)}</div><p class="calendar-connection-alert" role="status" data-google-status>${data.connection?.status !== "connected" || message ? e(message || statusText()) : ""}</p><details class="google-connections" ${wasOpen ? "open" : ""}><summary>Calendar settings</summary><div class="calendar-settings-actions"><p>${e(statusText())}</p><button class="button button-secondary" type="button" data-google-action="sync" ${loading || !data.configured || data.connection?.status !== "connected" ? "disabled" : ""}>${loading ? "Working…" : "Sync Google now"}</button></div><p>Imported coverage: 90 days past through 366 days ahead. All-day dates stay as set by the client; timed events use the selected display time zone.</p><p>Integration Gmail: ${e(data.connection?.accountEmail || "kijijimgmt@gmail.com")}. Only explicitly mapped calendars appear here.</p>${data.connection?.message ? `<p>${e(data.connection.message)}</p>` : ""}${data.canManage ? `<button type="button" class="button button-secondary" data-google-action="${data.connection?.canCreate ? "connect-write" : "connect"}" ${loading || !data.configured ? "disabled" : ""}>${data.connection?.status === "connected" ? "Reconnect Google account" : "Connect Google account"}</button> ${!data.connection?.canCreate ? `<button type="button" class="button button-secondary" data-google-action="connect-write" ${loading || !data.configured ? "disabled" : ""}>Enable adding Google events</button>` : ""}<button type="button" class="button button-secondary" data-google-action="discover" ${loading || data.connection?.status !== "connected" ? "disabled" : ""}>Find shared calendars</button>` : ""}<div class="google-calendar-legend">${links.map((l) => `<div><span class="calendar-color-dot" style="--client-color:${e(l.color)}"></span><strong>${e(state.clients.find((c) => c.id === l.clientId)?.name || "Client")}</strong> · ${e(l.calendarName)}<br><small>Last successful sync: ${e(stamp(l.lastSuccessAt))} · ${e(l.status)}</small>${l.message ? `<p>${e(l.message)}</p>` : ""}${data.canManage ? `<button class="text-action" type="button" data-google-enable="${e(l.id)}" data-enabled="${l.allowCreate ? "false" : "true"}" ${loading ? "disabled" : ""}>${l.allowCreate ? "Turn off adding events" : "Allow adding events for this client"}</button><br><button class="text-action" type="button" data-google-unmap="${e(l.id)}" ${loading ? "disabled" : ""}>Disconnect this calendar</button>` : ""}</div>`).join("") || "<p>No client calendars connected yet.</p>"}</div>${discovered.length && data.canManage ? `<form data-google-map><h4>Map a calendar to its client</h4><label>Shared calendar<select name="calendarId" required><option value="">Choose a work calendar…</option>${discovered.map((c) => `<option value="${e(c.id)}">${e(c.name)}${c.primary ? " (integration account primary calendar)" : ""}</option>`).join("")}</select></label><label>Client<select name="clientId" required><option value="">Choose the correct client…</option>${state.clients.map((c) => `<option value="${e(c.id)}">${e(c.name)}</option>`).join("")}</select></label><label>Client color<select name="color">${PALETTE.map((color, i) => `<option value="${color}">Color ${i + 1} (${color})</option>`).join("")}</select></label><button class="button button-primary" type="submit" ${loading ? "disabled" : ""}>Save mapping</button><p>Use a dedicated client work calendar. Mapping does not change Google events. Event creation requires a separate opt-in for each calendar. Coverage: past 90 days through the next 366 days; normal polling target is every five minutes once the scheduler is enabled.</p></form>` : ""}</details>`;
  }
  async function load(initialData) {
    const ticket = ++epoch,
      user = state.teamUser?.email;
    try {
      const result = initialData || (await api());
      if (ticket !== epoch || user !== state.teamUser?.email) return;
      data = result;
      message = "";
    } catch (error) {
      if (ticket !== epoch || user !== state.teamUser?.email) return;
      data = {
        links: [],
        connection: { status: "error", message: error.message },
        canManage: state.teamUser?.isAdmin,
      };
      message = error.message;
    }
    controls();
  }
  function redraw() {
    controls();
    if (typeof renderCalendar === "function") renderCalendar();
    document
      .querySelectorAll("[data-google-profile-client]")
      .forEach((host) => {
        const client = state.clients.find(
          (c) => c.id === host.dataset.googleProfileClient,
        );
        if (client) host.outerHTML = profile(client);
      });
  }
  async function action(name, body = {}) {
    if (loading) return;
    const ticket = epoch,
      user = state.teamUser?.email;
    loading = true;
    message = "Working on the calendar connection…";
    controls();
    try {
      const result = await api(name, body);
      if (ticket !== epoch || user !== state.teamUser?.email) return;
      if (name === "connect" || name === "connect-write") {
        window.location.assign(result.url);
        return;
      }
      if (name === "discover") {
        discovered = result.calendars;
        message = discovered.length
          ? "Choose a shared calendar and the correct client below."
          : "No readable calendars found. Accept the sharing invitation in the Gmail account, then try again.";
      } else {
        data = result;
        message =
          name === "sync"
            ? "Sync finished. Check each calendar’s status and last successful sync below."
            : name === "enable-create"
              ? "Calendar event-creation setting updated."
              : "Calendar mapping updated.";
      }
    } catch (error) {
      if (ticket === epoch && user === state.teamUser?.email)
        message = error.message;
    } finally {
      loading = false;
      if (ticket === epoch && user === state.teamUser?.email) redraw();
    }
  }
  const dialog = document.createElement("dialog");
  dialog.className = "google-event-dialog";
  dialog.setAttribute("aria-labelledby", "google-event-title");
  document.body.append(dialog);
  function open(id) {
    const ev = events().find((x) => x.id === id);
    if (!ev) return;
    dialog.innerHTML = `<header><h2 id="google-event-title">${e(ev.name)}</h2><button type="button" class="button button-secondary" data-google-close>Close</button></header><p>${e(ev.clientName)} · ${e(ev.calendarName)} · Read only</p><p><strong>${e(when(ev))}</strong></p>${ev.location ? `<p>${e(ev.location)}</p>` : ""}<div class="google-event-description">${e(ev.description)}</div><p>Last successful sync: ${e(stamp(ev.lastSuccessAt))}</p><p>To change this event, ask the client to update their Google Calendar.</p>`;
    dialog.querySelector("[data-google-close]").onclick = () => dialog.close();
    dialog.showModal();
  }
  // A separate form and explicit review step prevent confusion with internal events.
  const createDialog = document.createElement("dialog");
  createDialog.className = "google-event-dialog google-create-dialog";
  createDialog.setAttribute("aria-labelledby", "google-create-heading");
  document.body.append(createDialog);
  let createBusy = false,
    requestId = "",
    createPayload = null;
  function openCreate(clientId) {
    const links = (data.links || []).filter(
      (l) => l.canCreate && (!clientId || l.clientId === clientId),
    );
    if (!links.length) return;
    requestId = crypto.randomUUID();
    createPayload = null;
    const today = new Date().toLocaleDateString("en-CA");
    const zones = [
      ...new Set([
        links[0].timeZone,
        zone,
        "UTC",
        "America/New_York",
        "America/Los_Angeles",
        "Europe/London",
      ]),
    ];
    createDialog.innerHTML = `<header><h2 id="google-create-heading">Add a Google event</h2><button type="button" class="button button-secondary" data-google-create-close>Close</button></header><p>This creates one event directly on the selected client’s Google Calendar. The management dashboard displays that same event.</p><p role="status" data-google-create-message></p><form data-google-create-form><label>Client calendar<select name="linkId" required>${links.map((l) => `<option value="${e(l.id)}">${e(state.clients.find((c) => c.id === l.clientId)?.name)} — ${e(l.calendarName)}</option>`).join("")}</select></label><label>Event title<input name="title" maxlength="200" required></label><label class="google-all-day"><input name="allDay" type="checkbox">All-day event</label><div data-google-timed><label>Start time<input name="startLocal" type="datetime-local" value="${today}T09:00" required></label><label>End time<input name="endLocal" type="datetime-local" value="${today}T10:00" required></label></div><div data-google-all-day hidden><label>First day<input name="startDate" type="date" value="${today}" disabled required></label><label>Last day (included)<input name="endDate" type="date" value="${today}" disabled required></label></div><label>Event time zone<select name="timeZone">${zones.map((z) => `<option>${e(z)}</option>`).join("")}</select></label><label>Location (optional)<input name="location" maxlength="1000"></label><label>Details shared with the client (optional)<textarea name="notes" rows="4" maxlength="3000"></textarea></label><p>No guest invitations are sent from this form. Anyone with access to the shared calendar can see its event details.</p><button class="button button-primary" type="submit">Review event</button></form><section data-google-create-review hidden></section>`;
    const form = createDialog.querySelector("form");
    createDialog.querySelector("[data-google-create-close]").onclick = () => {
      if (!createBusy) createDialog.close();
    };
    form.elements.allDay.onchange = () => {
      const all = form.elements.allDay.checked;
      createDialog.querySelector("[data-google-timed]").hidden = all;
      createDialog.querySelector("[data-google-all-day]").hidden = !all;
      ["startLocal", "endLocal"].forEach(
        (k) => (form.elements[k].disabled = all),
      );
      ["startDate", "endDate"].forEach(
        (k) => (form.elements[k].disabled = !all),
      );
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      createPayload = Object.fromEntries(new FormData(form));
      createPayload.allDay = form.elements.allDay.checked;
      createPayload.requestId = requestId;
      const link = links.find((l) => l.id === createPayload.linkId),
        client = state.clients.find((c) => c.id === link.clientId);
      form.hidden = true;
      const review = createDialog.querySelector("[data-google-create-review]");
      review.hidden = false;
      review.innerHTML = `<h3>Review before adding</h3><p><strong>${e(client.name)} — ${e(link.calendarName)}</strong></p><p>${e(createPayload.title)}</p><p>${e(createPayload.allDay ? createPayload.startDate + " through " + createPayload.endDate + " (all day)" : createPayload.startLocal.replace("T", " ") + " to " + createPayload.endLocal.replace("T", " "))}<br>Time zone: ${e(createPayload.timeZone)}</p><p>${e(createPayload.location)}</p><p class="google-event-description">${e(createPayload.notes)}</p><button type="button" class="button button-secondary" data-google-create-back>Back to edit</button><button type="button" class="button button-primary" data-google-create-confirm>Add event to ${e(client.name)}’s Google Calendar</button>`;
      review.querySelector("[data-google-create-back]").onclick = () => {
        if (!createBusy) {
          review.hidden = true;
          form.hidden = false;
        }
      };
      review.querySelector("[data-google-create-confirm]").onclick = saveCreate;
    };
    createDialog.showModal();
  }
  async function saveCreate() {
    if (createBusy) return;
    const ticket = epoch,
      user = state.teamUser?.email;
    createBusy = true;
    const status = createDialog.querySelector("[data-google-create-message]");
    status.textContent = "Adding the event to Google Calendar…";
    createDialog.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      const result = await api("create-event", createPayload);
      if (ticket !== epoch || user !== state.teamUser?.email) return;
      data = result;
      message = result.created?.cached
        ? "Event added to the client’s Google Calendar."
        : "Google confirmed the event. Use Sync Google now to refresh its dashboard copy.";
      createDialog.close();
      redraw();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      createBusy = false;
      createDialog
        .querySelectorAll("button")
        .forEach((b) => (b.disabled = false));
    }
  }
  createDialog.addEventListener("cancel", (event) => {
    if (createBusy) event.preventDefault();
  });
  document.addEventListener("click", (event) => {
    const create = event.target.closest("[data-google-create]");
    if (create) {
      openCreate(create.dataset.googleCreate);
      return;
    }
    const enable = event.target.closest("[data-google-enable]");
    if (enable) {
      action("enable-create", {
        linkId: enable.dataset.googleEnable,
        enabled: enable.dataset.enabled === "true",
      });
      return;
    }
    const btn = event.target.closest("[data-google-action]");
    if (btn) {
      action(btn.dataset.googleAction);
      return;
    }
    const ev = event.target.closest("[data-google-event-id]");
    if (ev) {
      open(ev.dataset.googleEventId);
      return;
    }
    const unmap = event.target.closest("[data-google-unmap]");
    if (
      unmap &&
      confirm(
        "Remove this calendar from the dashboard? Its Google events stay in Google Calendar.",
      )
    )
      action("unmap", { linkId: unmap.dataset.googleUnmap });
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-google-client]"))
      selectedClient = event.target.value;
    else if (event.target.matches("[data-google-source]"))
      source = event.target.value;
    else if (event.target.matches("[data-google-zone]"))
      zone = event.target.value;
    else if (event.target.matches("[data-google-map] [name=clientId]")) {
      const form = event.target.form,
        existing = (data.links || []).find(
          (l) => l.clientId === event.target.value,
        );
      form.elements.color.value =
        existing?.color ||
        PALETTE[
          state.clients.findIndex((c) => c.id === event.target.value) %
            PALETTE.length
        ];
      return;
    } else return;
    redraw();
  });
  document.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-google-map]")) return;
    event.preventDefault();
    action("map", Object.fromEntries(new FormData(event.target)));
  });
  window.loadGoogleCalendar = load;
  window.clearGoogleCalendar = () => {
    epoch++;
    loading = false;
    data = { links: [], connection: { status: "not_connected" } };
    discovered = [];
    selectedClient = "";
    message = "";
    dialog.close();
    createDialog.close();
    controls();
  };
  window.googleCalendar = {
    events,
    matches,
    occurs,
    upcoming,
    card,
    profile,
    controls,
    when,
  };
  setInterval(async () => {
    if (
      !document.hidden &&
      state.teamUser &&
      !state.isLoading &&
      !loading &&
      !createDialog.open &&
      !document.activeElement?.closest(
        "[data-google-calendar-controls],.google-event-dialog",
      )
    ) {
      await load();
      redraw();
    }
  }, 60000);
})();
