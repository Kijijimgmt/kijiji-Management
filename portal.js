const apiEndpoint = "/api/notion-clients";
const accessStorageKey = "kijiji-portal-access-code";
const today = new Date();
const todayISO = today.toISOString().slice(0, 10);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const els = {
  rows: $("[data-client-rows]"),
  detail: $("[data-client-detail]"),
  actionList: $("[data-action-list]"),
  ownerGrid: $("[data-owner-grid]"),
  todayList: $("[data-today-list]"),
  priorityList: $("[data-priority-list]"),
  blockerList: $("[data-blocker-list]"),
  pipelineGrid: $("[data-pipeline-grid]"),
  calendarList: $("[data-calendar-list]"),
  search: $("[data-search-clients]"),
  statusFilter: $("[data-status-filter]"),
  clientDialog: $("[data-client-dialog]"),
  clientForm: $("[data-client-form]"),
  clientFormTitle: $("[data-form-title]"),
  actionDialog: $("[data-action-dialog]"),
  actionForm: $("[data-action-form]"),
  actionFormTitle: $("[data-action-form-title]"),
  actionClientSelect: $("[data-action-client-select]"),
  clientsMetric: $("[data-metric-clients]"),
  todayMetric: $("[data-metric-today]"),
  overdueMetric: $("[data-metric-overdue]"),
  blockersMetric: $("[data-metric-blockers]"),
  sourceBadge: $("[data-source-badge]"),
  logout: $("[data-logout-portal]"),
  accessPanel: $("[data-access-panel]"),
  accessForm: $("[data-access-form]"),
  accessInput: $("[data-access-code]"),
  accessSubmit: $("[data-access-submit]"),
  accessMessage: $("[data-access-message]"),
  dashboard: $("[data-dashboard-content]"),
};

let state = {
  clients: [],
  actions: [],
  opportunities: [],
  events: [],
  selectedClientId: "",
  isLoading: true,
  portalError: "",
  portalAccessCode: sessionStorage.getItem(accessStorageKey) || "",
};

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatDate = (value) => {
  if (!value) {
    return "No date";
  }

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
};

const getDaysUntil = (value) => {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const dueDate = new Date(`${value}T00:00:00`);
  const start = new Date(`${todayISO}T00:00:00`);
  return Math.ceil((dueDate.getTime() - start.getTime()) / 86400000);
};

const isComplete = (item) => ["complete", "done", "closed"].includes(String(item.status || "").toLowerCase());
const isUrgent = (item) => ["urgent", "high"].includes(String(item.priority || item.focusLevel || "").toLowerCase());

const getProgressEstimate = (client) => {
  if (Number.isFinite(Number(client.progress)) && Number(client.progress) > 0) {
    return Number(client.progress);
  }

  const byStatus = {
    Prospect: 15,
    Onboarding: 35,
    Active: 65,
    Paused: 45,
    Archived: 100,
  };

  return byStatus[client.status] || 25;
};

const getClient = (clientId) => state.clients.find((client) => client.id === clientId);

const getClientName = (item) => {
  const related = item.clientIds?.map(getClient).find(Boolean);
  return related?.name || item.clientName || "No client linked";
};

const getRelated = (collection, clientId) =>
  collection.filter((item) => item.clientIds?.includes(clientId) || item.clientName === getClient(clientId)?.name);

const setSourceBadge = (mode, text) => {
  if (!els.sourceBadge) {
    return;
  }

  els.sourceBadge.dataset.state = mode;
  els.sourceBadge.textContent = text;
};

const setAccessMessage = (message = "", mode = "") => {
  els.accessMessage.textContent = message;
  els.accessMessage.dataset.state = mode;
};

const setAccessBusy = (isBusy) => {
  els.accessSubmit.disabled = isBusy;
  els.accessSubmit.textContent = isBusy ? "Unlocking..." : "Unlock Dashboard";
  els.accessInput.disabled = isBusy;
};

const setProtectedAccess = (isAvailable) => {
  $$("[data-requires-access]").forEach((control) => {
    control.disabled = !isAvailable;
  });
};

const showAccessPanel = (message = "", mode = "") => {
  els.accessPanel.hidden = false;
  els.dashboard.hidden = true;
  setProtectedAccess(false);
  setAccessBusy(false);
  setAccessMessage(message, mode);
};

const showDashboard = () => {
  els.accessPanel.hidden = true;
  els.dashboard.hidden = false;
  setProtectedAccess(true);
};

const getRequestHeaders = () => ({
  "Content-Type": "application/json",
  "X-Portal-Access-Code": state.portalAccessCode,
});

const getPortalErrorMessage = (response, data) => {
  if (response.status === 401) {
    return "That passcode did not unlock the dashboard. Check it and try again.";
  }

  if (data?.error === "notion_not_configured") {
    return "The passcode worked, but Notion is not configured in Vercel yet.";
  }

  if (data?.error === "notion_access_missing") {
    return data.message || "Share all four Kijiji Notion data sources with the integration, then redeploy if needed.";
  }

  if (data?.error === "portal_access_not_configured") {
    return "The portal passcode is not configured in Vercel yet.";
  }

  if (response.status >= 500) {
    return "The passcode was accepted, but the Notion operating system could not load. Check the Notion token and database sharing.";
  }

  return data?.message || "The dashboard could not load. Try again or check the portal configuration.";
};

const getFilteredClients = () => {
  const query = String(els.search?.value || "").trim().toLowerCase();
  const status = els.statusFilter?.value || "all";

  return state.clients.filter((client) => {
    const searchable = [
      client.name,
      client.category,
      client.type?.join(" "),
      client.status,
      client.owner,
      client.stage,
      client.nextAction,
      client.focusLevel,
      client.email,
      client.phone,
    ]
      .join(" ")
      .toLowerCase();

    return (!query || searchable.includes(query)) && (status === "all" || client.status === status);
  });
};

const getOpenActions = () => state.actions.filter((action) => !isComplete(action));
const getDueActions = () => getOpenActions().filter((action) => getDaysUntil(action.dueDate) <= 0);
const getBlockers = () => getOpenActions().filter((action) => action.blocker);

const renderMetrics = () => {
  els.clientsMetric.textContent = String(state.clients.length);
  els.todayMetric.textContent = String(getOpenActions().filter((action) => action.dueDate === todayISO).length);
  els.overdueMetric.textContent = String(getOpenActions().filter((action) => getDaysUntil(action.dueDate) < 0).length);
  els.blockersMetric.textContent = String(getBlockers().length);
};

const renderEmptyList = (target, title, text) => {
  target.innerHTML = `
    <div class="mini-empty">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
};

const actionCard = (action) => `
  <article class="action-item" data-action-id="${escapeHtml(action.id)}" tabindex="0">
    <header>
      <strong>${escapeHtml(action.title)}</strong>
      <span class="date-chip" data-tone="${getDaysUntil(action.dueDate) < 0 ? "danger" : ""}">${formatDate(action.dueDate)}</span>
    </header>
    <p>${escapeHtml(action.notes || getClientName(action))}</p>
    <div class="item-meta">
      <span>${escapeHtml(action.owner || "Unassigned")}</span>
      <span>${escapeHtml(action.priority || "Normal")}</span>
      ${action.blocker ? "<span>Blocker</span>" : ""}
    </div>
  </article>
`;

const renderFocusLists = () => {
  const due = getDueActions().sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate)).slice(0, 5);
  const priority = getOpenActions().filter(isUrgent).slice(0, 5);
  const blockers = getBlockers().slice(0, 5);

  if (due.length) {
    els.todayList.innerHTML = due.map(actionCard).join("");
  } else {
    renderEmptyList(els.todayList, "Nothing due today", "No overdue or same-day actions are currently open.");
  }

  if (priority.length) {
    els.priorityList.innerHTML = priority.map(actionCard).join("");
  } else {
    renderEmptyList(els.priorityList, "Priority queue is clean", "Mark an action High or Urgent when it needs sharper visibility.");
  }

  if (blockers.length) {
    els.blockerList.innerHTML = blockers.map(actionCard).join("");
  } else {
    renderEmptyList(els.blockerList, "No visible blockers", "Blocked work will appear here when an action is marked as a blocker.");
  }
};

const renderRows = () => {
  const filtered = getFilteredClients();

  if (!filtered.length) {
    els.rows.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <p class="eyebrow">No matches</p>
            <h2>No clients found</h2>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  els.rows.innerHTML = filtered
    .map((client) => {
      const progress = getProgressEstimate(client);

      return `
        <tr data-client-id="${escapeHtml(client.id)}" class="${client.id === state.selectedClientId ? "is-selected" : ""}" tabindex="0">
          <td>
            <div class="client-name">
              <strong>${escapeHtml(client.name || "Untitled client")}</strong>
              <span>${escapeHtml(client.category || "Type not set")}</span>
            </div>
          </td>
          <td><span class="status-pill" data-status="${escapeHtml(client.status)}">${escapeHtml(client.status)}</span></td>
          <td>${escapeHtml(client.owner || "Unassigned")}</td>
          <td><span class="focus-pill" data-focus="${escapeHtml(client.focusLevel)}">${escapeHtml(client.focusLevel || "Normal")}</span></td>
          <td>${escapeHtml(client.nextAction || "Add next move in Notion")}</td>
          <td>
            <div class="client-name">
              <div class="progress-track" aria-label="${progress} percent complete">
                <span style="width:${progress}%"></span>
              </div>
              <span>${progress}%</span>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
};

const relatedList = (items, emptyText, formatter) => {
  if (!items.length) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }

  return `<div class="related-list">${items.map(formatter).join("")}</div>`;
};

const renderDetail = () => {
  const client = getClient(state.selectedClientId);

  if (!client) {
    els.detail.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">Client detail</p>
        <h2>Select a client</h2>
        <p>Related actions, opportunities, events, next move, and focus level appear here.</p>
      </div>
    `;
    return;
  }

  const progress = getProgressEstimate(client);
  const relatedActions = getRelated(state.actions, client.id).filter((action) => !isComplete(action));
  const relatedOpportunities = getRelated(state.opportunities, client.id);
  const relatedEvents = getRelated(state.events, client.id);

  els.detail.innerHTML = `
    <div class="client-detail-head">
      <div>
        <p class="eyebrow">${escapeHtml(client.category || "Client")}</p>
        <h2>${escapeHtml(client.name)}</h2>
        <div class="pill-row">
          <span class="status-pill" data-status="${escapeHtml(client.status)}">${escapeHtml(client.status)}</span>
          <span class="focus-pill" data-focus="${escapeHtml(client.focusLevel)}">${escapeHtml(client.focusLevel || "Normal")}</span>
        </div>
      </div>
      <button class="button button-secondary" type="button" data-edit-client="${escapeHtml(client.id)}">Edit Client</button>
    </div>

    <div class="detail-meta">
      <div>
        <span>Assigned owner</span>
        <strong>${escapeHtml(client.owner || "Unassigned")}</strong>
      </div>
      <div>
        <span>Current offer</span>
        <strong>${escapeHtml(client.stage || "Not added")}</strong>
      </div>
      <div>
        <span>Next move</span>
        <strong>${escapeHtml(client.nextAction || "Not added")}</strong>
      </div>
      <div>
        <span>Last touch</span>
        <strong>${formatDate(client.lastTouch || client.dueDate)}</strong>
      </div>
      <div>
        <span>Contact email</span>
        <strong>${escapeHtml(client.email || "Not added")}</strong>
      </div>
      <div>
        <span>Progress</span>
        <strong>${progress}%</strong>
      </div>
    </div>

    <div class="relation-grid">
      <article>
        <h3>Related Actions</h3>
        ${relatedList(relatedActions, "No open actions linked yet.", (item) => `<button type="button" data-jump-action="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.owner || "Unassigned")} / ${formatDate(item.dueDate)}</span></button>`)}
      </article>
      <article>
        <h3>Opportunities</h3>
        ${relatedList(relatedOpportunities, "No opportunities linked yet.", (item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.stage || "No stage")}</span></a>`)}
      </article>
      <article>
        <h3>Events / Releases</h3>
        ${relatedList(relatedEvents, "No events or releases linked yet.", (item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.name)}</strong><span>${formatDate(item.date)} ${item.type ? `/ ${escapeHtml(item.type)}` : ""}</span></a>`)}
      </article>
    </div>

    <p class="detail-notes">${escapeHtml(client.notes || "No notes added yet.")}</p>
    ${
      client.url
        ? `<a class="button button-secondary notion-link" href="${escapeHtml(client.url)}" target="_blank" rel="noreferrer">Open in Notion</a>`
        : ""
    }
  `;
};

const renderActions = () => {
  const sorted = [...getOpenActions()].sort((a, b) => {
    const priorityWeight = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
    const priorityDelta = (priorityWeight[a.priority] ?? 2) - (priorityWeight[b.priority] ?? 2);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate);
  });

  if (!sorted.length) {
    renderEmptyList(els.actionList, "No open actions", "Add an action when a next move needs a clear owner and due date.");
    return;
  }

  els.actionList.innerHTML = sorted.map(actionCard).join("");
};

const renderPipeline = () => {
  const stages = [...new Set(state.opportunities.map((opportunity) => opportunity.stage || "New"))];

  if (!stages.length) {
    renderEmptyList(els.pipelineGrid, "No opportunities yet", "Deals and partnership opportunities will appear by stage once the Notion database is shared.");
    return;
  }

  els.pipelineGrid.innerHTML = stages
    .map((stage) => {
      const items = state.opportunities.filter((opportunity) => (opportunity.stage || "New") === stage);

      return `
        <article class="pipeline-column">
          <h3>${escapeHtml(stage)}</h3>
          <strong>${items.length}</strong>
          <div class="stack-list">
            ${items
              .map(
                (item) => `
                  <a class="compact-card" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
                    <span>${escapeHtml(item.name)}</span>
                    <em>${escapeHtml(getClientName(item))}</em>
                  </a>
                `
              )
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
};

const renderCalendar = () => {
  const upcoming = [...state.events]
    .filter((event) => getDaysUntil(event.date) >= 0)
    .sort((a, b) => getDaysUntil(a.date) - getDaysUntil(b.date))
    .slice(0, 8);

  if (!upcoming.length) {
    renderEmptyList(els.calendarList, "No upcoming releases", "Events and release dates will appear here once they are added in Notion.");
    return;
  }

  els.calendarList.innerHTML = upcoming
    .map(
      (event) => `
        <a class="calendar-item" href="${escapeHtml(event.url)}" target="_blank" rel="noreferrer">
          <span>${formatDate(event.date)}</span>
          <strong>${escapeHtml(event.name)}</strong>
          <em>${escapeHtml(getClientName(event))}${event.type ? ` / ${escapeHtml(event.type)}` : ""}</em>
        </a>
      `
    )
    .join("");
};

const renderOwners = () => {
  const owners = ["Maxwell", "Joe", "Erik", "Unassigned"];

  els.ownerGrid.innerHTML = owners
    .map((owner) => {
      const ownedClients = state.clients.filter((client) => (client.owner || "Unassigned") === owner || (owner === "Maxwell" && client.owner === "Max"));
      const ownedActions = getOpenActions().filter((action) => (action.owner || "Unassigned") === owner || (owner === "Maxwell" && action.owner === "Max"));
      const nextAction = [...ownedActions].sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate))[0];

      return `
        <article class="owner-card">
          <h3>${escapeHtml(owner)}</h3>
          <strong>${ownedActions.length}</strong>
          <p>${ownedClients.length} client${ownedClients.length === 1 ? "" : "s"} / ${ownedActions.length} open action${ownedActions.length === 1 ? "" : "s"}</p>
          <p class="muted">${nextAction ? `Next: ${escapeHtml(nextAction.title)} on ${formatDate(nextAction.dueDate)}` : "No open action assigned"}</p>
        </article>
      `;
    })
    .join("");
};

const renderActionClientOptions = () => {
  els.actionClientSelect.innerHTML = `<option value="">No client relation</option>${state.clients
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`)
    .join("")}`;
};

const setLoadingState = () => {
  els.clientsMetric.textContent = "-";
  els.todayMetric.textContent = "-";
  els.overdueMetric.textContent = "-";
  els.blockersMetric.textContent = "-";
  els.rows.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">
          <p class="eyebrow">Loading Notion</p>
          <h2>Syncing the operating system</h2>
        </div>
      </td>
    </tr>
  `;
  [els.todayList, els.priorityList, els.blockerList, els.actionList, els.pipelineGrid, els.calendarList, els.ownerGrid].forEach((target) => {
    target.innerHTML = "";
  });
};

const setErrorState = () => {
  setSourceBadge("error", "Notion setup needed");
  els.clientsMetric.textContent = "0";
  els.todayMetric.textContent = "0";
  els.overdueMetric.textContent = "0";
  els.blockersMetric.textContent = "0";
  els.rows.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">
          <p class="eyebrow">Shared data unavailable</p>
          <h2>Connect Notion to use the team portal</h2>
          <p>${escapeHtml(state.portalError || "The portal could not reach the shared Kijiji operating system.")}</p>
        </div>
      </td>
    </tr>
  `;
  els.detail.innerHTML = `
    <div class="empty-state">
      <p class="eyebrow">Source of truth</p>
      <h2>Notion Operating System</h2>
      <p>Share Client Roster, Actions, Opportunities & Deals, and Events & Releases with the integration used by NOTION_TOKEN.</p>
    </div>
  `;
};

const renderPortal = () => {
  if (state.isLoading) {
    setLoadingState();
    return;
  }

  if (state.portalError) {
    setErrorState();
    return;
  }

  renderMetrics();
  renderFocusLists();
  renderRows();
  renderDetail();
  renderActions();
  renderPipeline();
  renderCalendar();
  renderOwners();
  renderActionClientOptions();
};

const loadDashboard = async ({ code = state.portalAccessCode, fromUnlock = false } = {}) => {
  const candidateCode = String(code || "").trim();
  let showAccessAfterFailure = false;

  if (!candidateCode) {
    state.portalAccessCode = "";
    sessionStorage.removeItem(accessStorageKey);
    setSourceBadge("locked", "Locked");
    showAccessPanel("Enter the team passcode to unlock the dashboard.", "info");
    return false;
  }

  state.isLoading = true;
  state.portalError = "";
  setSourceBadge("loading", fromUnlock ? "Unlocking" : "Syncing Notion");

  if (fromUnlock) {
    showAccessPanel("Checking passcode and syncing Notion...", "info");
    setAccessBusy(true);
  } else {
    showDashboard();
    renderPortal();
  }

  try {
    const response = await fetch(apiEndpoint, {
      headers: {
        "Content-Type": "application/json",
        "X-Portal-Access-Code": candidateCode,
      },
    });
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(getPortalErrorMessage(response, data));
      error.statusCode = response.status;
      error.apiError = data?.error;
      throw error;
    }

    state.portalAccessCode = candidateCode;
    sessionStorage.setItem(accessStorageKey, state.portalAccessCode);
    state.clients = Array.isArray(data.clients) ? data.clients : [];
    state.actions = Array.isArray(data.actions) ? data.actions : [];
    state.opportunities = Array.isArray(data.opportunities) ? data.opportunities : [];
    state.events = Array.isArray(data.events) ? data.events : [];
    state.selectedClientId = state.selectedClientId || state.clients[0]?.id || "";
    state.isLoading = false;
    setSourceBadge("ready", "Synced with Notion");
    setAccessMessage("");
    showDashboard();
    renderPortal();
    return true;
  } catch (error) {
    state.clients = [];
    state.actions = [];
    state.opportunities = [];
    state.events = [];
    state.selectedClientId = "";
    state.portalAccessCode = error.statusCode === 401 ? "" : candidateCode;
    state.portalError = fromUnlock ? "" : error.message;

    if (error.statusCode === 401) {
      sessionStorage.removeItem(accessStorageKey);
    } else if (candidateCode) {
      sessionStorage.setItem(accessStorageKey, candidateCode);
    }

    if (fromUnlock) {
      setSourceBadge("error", "Access failed");
      showAccessPanel(error.message, "error");
    } else if (error.statusCode === 401) {
      state.portalError = "";
      showAccessAfterFailure = true;
      setSourceBadge("locked", "Locked");
      showAccessPanel("Your saved passcode no longer works. Enter it again to unlock the dashboard.", "error");
    }

    return false;
  } finally {
    state.isLoading = false;
    setAccessBusy(false);

    if (!fromUnlock && !showAccessAfterFailure) {
      renderPortal();
    }
  }
};

const openDialog = (dialog) => {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
};

const closeDialog = (dialog) => {
  dialog.close();
};

const openClientForm = (client = null) => {
  els.clientForm.reset();
  els.clientFormTitle.textContent = client ? "Edit client" : "Add client";
  els.clientForm.elements.id.value = client?.id || "";
  els.clientForm.elements.name.value = client?.name || "";
  els.clientForm.elements.category.value = client?.category || "";
  els.clientForm.elements.status.value = client?.status || "Prospect";
  els.clientForm.elements.owner.value = client?.owner || "";
  els.clientForm.elements.focusLevel.value = client?.focusLevel || "Normal";
  els.clientForm.elements.stage.value = client?.stage || "";
  els.clientForm.elements.lastTouch.value = client?.lastTouch || client?.dueDate || todayISO;
  els.clientForm.elements.nextAction.value = client?.nextAction || "";
  els.clientForm.elements.progress.value = client?.progress || getProgressEstimate(client || {});
  els.clientForm.elements.email.value = client?.email || "";
  els.clientForm.elements.phone.value = client?.phone || "";
  els.clientForm.elements.leadSource.value = client?.leadSource || "";
  els.clientForm.elements.notes.value = client?.notes || "";
  openDialog(els.clientDialog);
};

const openActionForm = (action = null) => {
  els.actionForm.reset();
  renderActionClientOptions();
  els.actionFormTitle.textContent = action ? "Edit action" : "Add action";
  els.actionForm.elements.id.value = action?.id || "";
  els.actionForm.elements.title.value = action?.title || "";
  els.actionForm.elements.status.value = action?.status || "Open";
  els.actionForm.elements.owner.value = action?.owner || "Unassigned";
  els.actionForm.elements.priority.value = action?.priority || "Normal";
  els.actionForm.elements.dueDate.value = action?.dueDate || todayISO;
  els.actionForm.elements.clientId.value = action?.clientIds?.[0] || "";
  els.actionForm.elements.blocker.checked = Boolean(action?.blocker);
  els.actionForm.elements.notes.value = action?.notes || "";
  openDialog(els.actionDialog);
};

const saveResource = async (payload) => {
  const response = await fetch(apiEndpoint, {
    method: payload.id ? "PATCH" : "POST",
    headers: getRequestHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await response.json();

  if (response.status === 401) {
    logoutPortal();
    throw new Error("Your portal session expired or the passcode no longer works. Unlock the dashboard again.");
  }

  if (!response.ok) {
    throw new Error(data.message || "Unable to save to Notion.");
  }

  return data;
};

const handleClientSubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(els.clientForm);
  const payload = {
    resource: "client",
    id: String(formData.get("id") || ""),
    name: String(formData.get("name") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    status: String(formData.get("status") || "Prospect"),
    owner: String(formData.get("owner") || "").trim(),
    focusLevel: String(formData.get("focusLevel") || "Normal"),
    stage: String(formData.get("stage") || "").trim(),
    lastTouch: String(formData.get("lastTouch") || "").trim(),
    nextAction: String(formData.get("nextAction") || "").trim(),
    progress: Number(formData.get("progress") || 0),
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    leadSource: String(formData.get("leadSource") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
  };
  const submit = els.clientForm.querySelector('[type="submit"]');

  submit.disabled = true;
  submit.textContent = "Saving...";

  try {
    const data = await saveResource(payload);
    state.selectedClientId = data.client?.id || state.selectedClientId;
    closeDialog(els.clientDialog);
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Save Client";
  }
};

const handleActionSubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(els.actionForm);
  const client = getClient(String(formData.get("clientId") || ""));
  const payload = {
    resource: "action",
    id: String(formData.get("id") || ""),
    title: String(formData.get("title") || "").trim(),
    status: String(formData.get("status") || "Open"),
    owner: String(formData.get("owner") || "Unassigned"),
    priority: String(formData.get("priority") || "Normal"),
    dueDate: String(formData.get("dueDate") || "").trim(),
    clientId: client?.id || "",
    clientName: client?.name || "",
    blocker: formData.get("blocker") === "on",
    notes: String(formData.get("notes") || "").trim(),
  };
  const submit = els.actionForm.querySelector('[type="submit"]');

  submit.disabled = true;
  submit.textContent = "Saving...";

  try {
    await saveResource(payload);
    closeDialog(els.actionDialog);
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Save Action";
  }
};

const handleAccessSubmit = async (event) => {
  event.preventDefault();
  const code = els.accessInput.value.trim();

  if (!code) {
    setAccessMessage("Enter the team passcode to unlock the dashboard.", "error");
    els.accessInput.focus();
    return;
  }

  const didUnlock = await loadDashboard({ code, fromUnlock: true });

  if (!didUnlock) {
    els.accessInput.focus();
    els.accessInput.select();
  }
};

function logoutPortal() {
  sessionStorage.removeItem(accessStorageKey);
  state = {
    clients: [],
    actions: [],
    opportunities: [],
    events: [],
    selectedClientId: "",
    isLoading: false,
    portalError: "",
    portalAccessCode: "",
  };
  setSourceBadge("signed-out", "Signed out");
  showAccessPanel("You have been signed out. Enter the team passcode to unlock the dashboard again.", "info");
  els.accessInput.focus();
}

els.rows.addEventListener("click", (event) => {
  const row = event.target.closest("[data-client-id]");
  if (row) {
    state.selectedClientId = row.dataset.clientId;
    renderPortal();
  }
});

els.rows.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const row = event.target.closest("[data-client-id]");
  if (row) {
    event.preventDefault();
    state.selectedClientId = row.dataset.clientId;
    renderPortal();
  }
});

els.detail.addEventListener("click", (event) => {
  const editClient = event.target.closest("[data-edit-client]");
  const jumpAction = event.target.closest("[data-jump-action]");

  if (editClient) {
    const client = getClient(editClient.dataset.editClient);
    if (client) {
      openClientForm(client);
    }
  }

  if (jumpAction) {
    const action = state.actions.find((item) => item.id === jumpAction.dataset.jumpAction);
    if (action) {
      openActionForm(action);
    }
  }
});

els.actionList.addEventListener("click", (event) => {
  const actionCardEl = event.target.closest("[data-action-id]");
  if (actionCardEl) {
    const action = state.actions.find((item) => item.id === actionCardEl.dataset.actionId);
    if (action) {
      openActionForm(action);
    }
  }
});

[els.todayList, els.priorityList, els.blockerList].forEach((target) => {
  target.addEventListener("click", (event) => {
    const actionCardEl = event.target.closest("[data-action-id]");
    if (actionCardEl) {
      const action = state.actions.find((item) => item.id === actionCardEl.dataset.actionId);
      if (action) {
        openActionForm(action);
      }
    }
  });
});

$$("[data-open-action-form]").forEach((button) => button.addEventListener("click", () => openActionForm()));
$$("[data-open-client-form]").forEach((button) => button.addEventListener("click", () => openClientForm()));
$$("[data-close-action-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.actionDialog)));
$$("[data-close-client-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.clientDialog)));
$("[data-refresh-dashboard]").addEventListener("click", () => loadDashboard());
els.logout?.addEventListener("click", logoutPortal);
els.accessForm.addEventListener("submit", handleAccessSubmit);
els.clientForm.addEventListener("submit", handleClientSubmit);
els.actionForm.addEventListener("submit", handleActionSubmit);
els.search.addEventListener("input", renderRows);
els.statusFilter.addEventListener("change", renderRows);

if (state.portalAccessCode) {
  loadDashboard();
} else {
  state.isLoading = false;
  setSourceBadge("locked", "Locked");
  showAccessPanel("Enter the team passcode to unlock the dashboard.", "info");
}
