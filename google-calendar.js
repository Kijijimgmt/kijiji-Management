/* Read-only client schedules. Internal Notion events stay in state.events. */
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
  function profile(client) {
    const links = (data.links || []).filter((l) => l.clientId === client.id);
    const list = events()
      .filter((ev) => ev.clientIds.includes(client.id) && upcoming(ev))
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 12);
    return `<section class="artist-section google-profile-schedule" data-google-profile-client="${e(client.id)}"><h3>Client Google schedule</h3><p>${e(statusText())}. Events are maintained by the client in Google Calendar.</p>${links.map((l) => `<p><span class="calendar-color-dot" style="--client-color:${e(l.color)}"></span> ${e(l.calendarName)} · Last sync: ${e(stamp(l.lastSuccessAt))}${l.message ? `<br>${e(l.message)}` : ""}</p>`).join("")}${list.map(card).join("") || `<p>${links.length ? "No upcoming imported events in the connected range." : "No Google calendar is mapped to this client yet."}</p>`}</section>`;
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
      )}</select></label><label>Google display time zone<select data-google-zone>${zones.map((z) => `<option ${zone === z ? "selected" : ""}>${e(z)}</option>`).join("")}</select></label><button class="button button-secondary" type="button" data-google-action="sync" ${loading || !data.configured || data.connection?.status !== "connected" ? "disabled" : ""}>${loading ? "Working…" : "Sync Google now"}</button></div><p role="status" data-google-status>${e(message || statusText())}</p><details class="google-connections"><summary>Google calendar connections</summary><p>Imported coverage: 90 days past through 366 days ahead. All-day dates stay as set by the client; timed events use the selected display time zone.</p><p>Integration Gmail: ${e(data.connection?.accountEmail || "kijijimgmt@gmail.com")}. Only explicitly mapped calendars appear here.</p>${data.connection?.message ? `<p>${e(data.connection.message)}</p>` : ""}${data.canManage ? `<button type="button" class="button button-secondary" data-google-action="connect" ${loading || !data.configured ? "disabled" : ""}>${data.connection?.status === "connected" ? "Reconnect Google account" : "Connect Google account"}</button> <button type="button" class="button button-secondary" data-google-action="discover" ${loading || data.connection?.status !== "connected" ? "disabled" : ""}>Find shared calendars</button>` : ""}<div class="google-calendar-legend">${links.map((l) => `<div><span class="calendar-color-dot" style="--client-color:${e(l.color)}"></span><strong>${e(state.clients.find((c) => c.id === l.clientId)?.name || "Client")}</strong> · ${e(l.calendarName)}<br><small>Last successful sync: ${e(stamp(l.lastSuccessAt))} · ${e(l.status)}</small>${l.message ? `<p>${e(l.message)}</p>` : ""}${data.canManage ? `<button class="text-action" type="button" data-google-unmap="${e(l.id)}" ${loading ? "disabled" : ""}>Disconnect this calendar</button>` : ""}</div>`).join("") || "<p>No client calendars connected yet.</p>"}</div>${discovered.length && data.canManage ? `<form data-google-map><h4>Map a calendar to its client</h4><label>Shared calendar<select name="calendarId" required><option value="">Choose a work calendar…</option>${discovered.map((c) => `<option value="${e(c.id)}">${e(c.name)}${c.primary ? " (integration account primary calendar)" : ""}</option>`).join("")}</select></label><label>Client<select name="clientId" required><option value="">Choose the correct client…</option>${state.clients.map((c) => `<option value="${e(c.id)}">${e(c.name)}</option>`).join("")}</select></label><label>Client color<select name="color">${PALETTE.map((color, i) => `<option value="${color}">Color ${i + 1} (${color})</option>`).join("")}</select></label><button class="button button-primary" type="submit" ${loading ? "disabled" : ""}>Save mapping</button><p>Use a dedicated client work calendar. Changes here never edit Google events. Coverage: past 90 days through the next 366 days; normal polling target is every five minutes once the scheduler is enabled.</p></form>` : ""}</details>`;
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
      if (name === "connect") {
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
  document.addEventListener("click", (event) => {
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
      !document.activeElement?.closest(
        "[data-google-calendar-controls],.google-event-dialog",
      )
    ) {
      await load();
      redraw();
    }
  }, 60000);
})();
