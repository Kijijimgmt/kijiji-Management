const apiEndpoint = "/api/notion-clients";
const supabaseUrl = "https://vaqgriohhcccvvxgkhgh.supabase.co";
const supabasePublishableKey = "sb_publishable_DPHPYm5DJGMqw13aiZP76w_q7pNidrn";
const livePortalUrl = "https://www.kijijimgmt.com/client-portal";
const supabaseClient = window.supabase?.createClient?.(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});
const today = new Date();
const todayISO = today.toISOString().slice(0, 10);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const els = {
  rows: $("[data-client-rows]"),
  detail: $("[data-client-detail]"),
  actionList: $("[data-action-list]"),
  todayList: $("[data-today-list]"),
  priorityList: $("[data-priority-list]"),
  blockerList: $("[data-blocker-list]"),
  pipelineGrid: $("[data-pipeline-grid]"),
  calendarList: $("[data-calendar-list]"),
  myWorkActionList: $("[data-my-work-action-list]"),
  myWorkDealList: $("[data-my-work-deal-list]"),
  myWorkWatchList: $("[data-my-work-watch-list]"),
  myWorkTitle: $("[data-my-work-title]"),
  myWorkSubtitle: $("[data-my-work-subtitle]"),
  myWorkTasksMetric: $("[data-my-work-tasks]"),
  myWorkDealsMetric: $("[data-my-work-deals]"),
  myWorkEventsMetric: $("[data-my-work-events]"),
  myWorkBlockersMetric: $("[data-my-work-blockers]"),
  userBadge: $("[data-user-badge]"),
  search: $("[data-search-clients]"),
  statusFilter: $("[data-status-filter]"),
  clientDialog: $("[data-client-dialog]"),
  clientForm: $("[data-client-form]"),
  clientFormTitle: $("[data-form-title]"),
  actionDialog: $("[data-action-dialog]"),
  actionForm: $("[data-action-form]"),
  actionFormTitle: $("[data-action-form-title]"),
  actionClientSelect: $("[data-action-client-select]"),
  opportunityDialog: $("[data-opportunity-dialog]"),
  opportunityForm: $("[data-opportunity-form]"),
  opportunityFormTitle: $("[data-opportunity-form-title]"),
  opportunityClientSelect: $("[data-opportunity-client-select]"),
  eventDialog: $("[data-event-dialog]"),
  eventForm: $("[data-event-form]"),
  eventFormTitle: $("[data-event-form-title]"),
  eventClientSelect: $("[data-event-client-select]"),
  clientsMetric: $("[data-metric-clients]"),
  todayMetric: $("[data-metric-today]"),
  overdueMetric: $("[data-metric-overdue]"),
  blockersMetric: $("[data-metric-blockers]"),
  sourceBadge: $("[data-source-badge]"),
  logout: $("[data-logout-portal]"),
  accessPanel: $("[data-access-panel]"),
  accessForm: $("[data-access-form]"),
  accessInput: $("[data-auth-email]"),
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
  authSession: null,
  teamUser: null,
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
const isAdminUser = () => Boolean(state.teamUser?.isAdmin);
const ownerKey = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "max" || text === "maxwell") return "maxwell";
  if (text === "joe") return "joe";
  if (text === "erik") return "erik";
  return text;
};
const ownerMatches = (value, owner) => ownerKey(value) === ownerKey(owner);

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
  els.accessSubmit.textContent = isBusy ? "Sending..." : "Send Magic Link";
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

const applyRoleUi = () => {
  const isAdmin = isAdminUser();
  document.body.dataset.portalRole = state.teamUser?.role || "signed-out";
  $$("[data-admin-only]").forEach((element) => {
    element.hidden = !isAdmin;
  });
  $$("[data-member-owner-lock]").forEach((element) => {
    element.hidden = isAdmin;
  });
};

const getRequestHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (state.authSession?.access_token) {
    headers.Authorization = `Bearer ${state.authSession.access_token}`;
  }

  return headers;
};

const getPortalErrorMessage = (response, data) => {
  if (response.status === 401) {
    return data?.message || "Your secure session expired. Sign in again with your Kijiji email.";
  }

  if (response.status === 403) {
    return data?.message || "This email is not approved for the Kijiji team portal.";
  }

  if (data?.error === "notion_not_configured") {
    return "Your sign-in worked, but Notion is not configured in Vercel yet.";
  }

  if (data?.error === "notion_access_missing") {
    return data.message || "Share all four Kijiji Notion data sources with the integration, then redeploy if needed.";
  }

  if (data?.error === "portal_access_not_configured") {
    return "Supabase Auth is not configured in Vercel yet.";
  }

  if (response.status >= 500) {
    return "Your sign-in worked, but the Notion operating system could not load. Check the Notion token and database sharing.";
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
const getOpportunityBlockers = () => state.opportunities.filter((opportunity) => opportunity.blocker);
const getOpenOpportunities = () => state.opportunities.filter((opportunity) => !isComplete(opportunity));

const renderMetrics = () => {
  els.clientsMetric.textContent = String(state.clients.length);
  els.todayMetric.textContent = String(getOpenActions().filter((action) => action.dueDate === todayISO).length);
  els.overdueMetric.textContent = String(getOpenActions().filter((action) => getDaysUntil(action.dueDate) < 0).length);
  els.blockersMetric.textContent = String(getBlockers().length);
};

const getPersonalActions = () => {
  if (!isAdminUser()) {
    return getOpenActions();
  }

  return getOpenActions().filter((action) => ownerMatches(action.owner, state.teamUser?.owner));
};

const getPersonalOpportunities = () => {
  const open = getOpenOpportunities();
  if (!isAdminUser()) {
    return open;
  }

  return open.filter((opportunity) => ownerMatches(opportunity.owner, state.teamUser?.owner));
};

const getPersonalEvents = () => {
  const upcoming = state.events.filter((event) => getDaysUntil(event.date) >= 0);
  if (!isAdminUser()) {
    return upcoming;
  }

  return upcoming.filter((event) => ownerMatches(event.owner, state.teamUser?.owner));
};

const renderMyWork = () => {
  const userName = state.teamUser?.fullName || "Team member";
  const personalActions = getPersonalActions().sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate)).slice(0, 6);
  const personalDeals = getPersonalOpportunities()
    .sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate))
    .slice(0, 6);
  const personalEvents = getPersonalEvents()
    .sort((a, b) => getDaysUntil(a.date) - getDaysUntil(b.date))
    .slice(0, 4);
  const personalBlockers = [
    ...getPersonalActions()
      .filter((action) => action.blocker)
      .map((item) => ({ kind: "action", item })),
    ...getPersonalOpportunities()
      .filter((opportunity) => opportunity.blocker)
      .map((item) => ({ kind: "opportunity", item })),
  ].slice(0, 4);
  const watchItems = [...personalBlockers, ...personalEvents.map((item) => ({ kind: "event", item }))].slice(0, 6);

  els.myWorkTitle.textContent = `${userName}'s work`;
  els.myWorkSubtitle.textContent = isAdminUser()
    ? "Your personal lane is here. The full command center remains available below."
    : "Your dashboard is filtered to the tasks, deals, dates, and clients assigned to you.";
  els.userBadge.textContent = `${state.teamUser?.role === "admin" ? "Admin" : "Member"} / ${state.teamUser?.email || "Signed in"}`;
  els.myWorkTasksMetric.textContent = String(getPersonalActions().length);
  els.myWorkDealsMetric.textContent = String(getPersonalOpportunities().length);
  els.myWorkEventsMetric.textContent = String(getPersonalEvents().length);
  els.myWorkBlockersMetric.textContent = String(personalBlockers.length);

  if (personalActions.length) {
    els.myWorkActionList.innerHTML = personalActions.map(actionCard).join("");
  } else {
    renderEmptyList(els.myWorkActionList, "No assigned tasks", "Assigned open tasks will appear here.");
  }

  if (personalDeals.length) {
    els.myWorkDealList.innerHTML = personalDeals.map(opportunityCard).join("");
  } else {
    renderEmptyList(els.myWorkDealList, "No assigned deals", "Assigned opportunities and partnership moves will appear here.");
  }

  if (watchItems.length) {
    els.myWorkWatchList.innerHTML = watchItems
      .map(({ kind, item }) => {
        if (kind === "event") return eventCard(item);
        return kind === "opportunity" ? opportunityCard(item) : actionCard(item);
      })
      .join("");
  } else {
    renderEmptyList(els.myWorkWatchList, "No blockers or dates", "Visible blockers and upcoming dates assigned to you will appear here.");
  }
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
  <article class="action-item editable-card" data-action-id="${escapeHtml(action.id)}" tabindex="0">
    <header>
      <strong>${escapeHtml(action.title)}</strong>
      <span class="date-chip" data-tone="${getDaysUntil(action.dueDate) < 0 ? "danger" : ""}">${formatDate(action.dueDate)}</span>
    </header>
    <p title="${escapeHtml(action.notes || getClientName(action))}">${escapeHtml(action.notes || getClientName(action))}</p>
    <div class="item-meta">
      <span>${escapeHtml(action.owner || "Unassigned")}</span>
      <span>${escapeHtml(action.priority || "Normal")}</span>
      ${action.blocker ? "<span>Blocker</span>" : ""}
    </div>
    <button class="text-action" type="button">Edit Task</button>
  </article>
`;

const opportunityCard = (opportunity) => `
  <article class="action-item editable-card" data-opportunity-id="${escapeHtml(opportunity.id)}" tabindex="0">
    <header>
      <strong>${escapeHtml(opportunity.name)}</strong>
      <span class="date-chip" data-tone="${getDaysUntil(opportunity.dueDate) < 0 ? "danger" : ""}">${formatDate(opportunity.dueDate)}</span>
    </header>
    <p title="${escapeHtml(opportunity.nextStep || getClientName(opportunity))}">${escapeHtml(opportunity.nextStep || getClientName(opportunity))}</p>
    <div class="item-meta">
      <span>${escapeHtml(opportunity.stage || "New")}</span>
      <span>${escapeHtml(opportunity.owner || "Unassigned")}</span>
      ${opportunity.priority ? `<span>${escapeHtml(opportunity.priority)}</span>` : ""}
      ${opportunity.blocker ? "<span>Blocker</span>" : ""}
    </div>
    <button class="text-action" type="button">Edit Opportunity</button>
  </article>
`;

const eventCard = (event) => `
  <article class="calendar-item editable-card" data-event-id="${escapeHtml(event.id)}" tabindex="0">
    <span>${formatDate(event.date)}</span>
    <strong>${escapeHtml(event.name)}</strong>
    <em>${escapeHtml(getClientName(event))}${event.type ? ` / ${escapeHtml(event.type)}` : ""}</em>
    <button class="text-action" type="button">Edit Event</button>
  </article>
`;

const renderFocusLists = () => {
  const due = getDueActions().sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate)).slice(0, 5);
  const priorityDeals = getOpenOpportunities()
    .filter((opportunity) => isUrgent(opportunity) || getDaysUntil(opportunity.dueDate) <= 7)
    .sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate))
    .slice(0, 5);
  const blockersAndDates = [
    ...getBlockers().slice(0, 3).map((item) => ({ kind: "action", item })),
    ...getOpportunityBlockers().slice(0, 3).map((item) => ({ kind: "opportunity", item })),
    ...state.events
      .filter((event) => getDaysUntil(event.date) >= 0)
      .sort((a, b) => getDaysUntil(a.date) - getDaysUntil(b.date))
      .slice(0, 3)
      .map((item) => ({ kind: "event", item })),
  ].slice(0, 6);

  if (due.length) {
    els.todayList.innerHTML = due.map(actionCard).join("");
  } else {
    renderEmptyList(els.todayList, "Nothing due today", "No overdue or same-day actions are currently open.");
  }

  if (priorityDeals.length) {
    els.priorityList.innerHTML = priorityDeals.map(opportunityCard).join("");
  } else {
    renderEmptyList(els.priorityList, "No urgent deal moves", "High-priority opportunities and upcoming deal actions will appear here.");
  }

  if (blockersAndDates.length) {
    els.blockerList.innerHTML = blockersAndDates
      .map(({ kind, item }) => {
        if (kind === "event") {
          return eventCard(item);
        }

        return kind === "opportunity" ? opportunityCard(item) : actionCard(item);
      })
      .join("");
  } else {
    renderEmptyList(els.blockerList, "Nothing blocking the system", "Blocked tasks, blocked deals, and upcoming launches will appear here.");
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
        ${relatedList(relatedOpportunities, "No opportunities linked yet.", (item) => `<button type="button" data-jump-opportunity="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.stage || "No stage")} / ${formatDate(item.dueDate)}</span></button>`)}
      </article>
      <article>
        <h3>Events / Releases</h3>
        ${relatedList(relatedEvents, "No events or releases linked yet.", (item) => `<button type="button" data-jump-event="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><span>${formatDate(item.date)} ${item.type ? `/ ${escapeHtml(item.type)}` : ""}</span></button>`)}
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
                  <button class="compact-card editable-card" type="button" data-opportunity-id="${escapeHtml(item.id)}">
                    <span>${escapeHtml(item.name)}</span>
                    <em>${escapeHtml(getClientName(item))} / ${escapeHtml(item.owner || "Unassigned")}</em>
                    <small title="${escapeHtml(item.nextStep || "Add next step")}">${escapeHtml(item.nextStep || "Add next step")}</small>
                  </button>
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

  els.calendarList.innerHTML = upcoming.map(eventCard).join("");
};

const renderClientOptions = (selectEl) => {
  if (!selectEl) {
    return;
  }

  selectEl.innerHTML = `<option value="">No client relation</option>${state.clients
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`)
    .join("")}`;
};

const renderActionClientOptions = () => renderClientOptions(els.actionClientSelect);

const setLoadingState = () => {
  els.clientsMetric.textContent = "-";
  els.todayMetric.textContent = "-";
  els.overdueMetric.textContent = "-";
  els.blockersMetric.textContent = "-";
  els.myWorkTasksMetric.textContent = "-";
  els.myWorkDealsMetric.textContent = "-";
  els.myWorkEventsMetric.textContent = "-";
  els.myWorkBlockersMetric.textContent = "-";
  els.rows.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">
          <p class="eyebrow">Loading Notion</p>
          <h2>Syncing the operating system</h2>
          <p>Pulling clients, tasks, opportunities, and key dates from the shared Kijiji workspace.</p>
        </div>
      </td>
    </tr>
  `;
  els.detail.innerHTML = `
    <div class="empty-state">
      <p class="eyebrow">Client detail</p>
      <h2>Loading roster</h2>
      <p>The selected client profile will appear here when the shared data finishes syncing.</p>
    </div>
  `;
  [
    [els.todayList, "Today", "Checking what needs attention now."],
    [els.priorityList, "Priority", "Sorting high-focus work."],
    [els.blockerList, "Blockers", "Looking for anything stuck."],
    [els.myWorkActionList, "My Tasks", "Loading your assigned tasks."],
    [els.myWorkDealList, "My Deals", "Loading your assigned opportunities."],
    [els.myWorkWatchList, "Watch List", "Loading your blockers and dates."],
    [els.actionList, "Tasks", "Loading open team actions."],
    [els.pipelineGrid, "Pipeline", "Loading opportunities by stage."],
    [els.calendarList, "Calendar", "Loading upcoming releases and events."],
  ].forEach(([target, title, text]) => {
    if (target) {
      renderEmptyList(target, title, text);
    }
  });
};

const setErrorState = () => {
  setSourceBadge("error", "Notion setup needed");
  els.clientsMetric.textContent = "0";
  els.todayMetric.textContent = "0";
  els.overdueMetric.textContent = "0";
  els.blockersMetric.textContent = "0";
  els.myWorkTasksMetric.textContent = "0";
  els.myWorkDealsMetric.textContent = "0";
  els.myWorkEventsMetric.textContent = "0";
  els.myWorkBlockersMetric.textContent = "0";
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
  [
    [els.todayList, "No task data", "Once Notion is connected, today's actions will appear here."],
    [els.priorityList, "No priority data", "Urgent and high-priority work will appear here."],
    [els.blockerList, "No blocker data", "Visible blockers will appear here."],
    [els.myWorkActionList, "No task data", "Your assigned tasks will appear here when the shared dashboard loads."],
    [els.myWorkDealList, "No deal data", "Your assigned deals will appear here when the shared dashboard loads."],
    [els.myWorkWatchList, "No watch data", "Your blockers and dates will appear here when the shared dashboard loads."],
    [els.actionList, "No actions available", "Task editing will unlock once the shared Actions database is reachable."],
    [els.pipelineGrid, "No pipeline available", "Opportunity stages will unlock once the shared Opportunities database is reachable."],
    [els.calendarList, "No calendar available", "Events and releases will unlock once the shared Events database is reachable."],
  ].forEach(([target, title, text]) => {
    if (target) {
      renderEmptyList(target, title, text);
    }
  });
};

const renderPortal = () => {
  applyRoleUi();

  if (state.isLoading) {
    setLoadingState();
    return;
  }

  if (state.portalError) {
    setErrorState();
    return;
  }

  renderMetrics();
  renderMyWork();
  renderFocusLists();
  renderRows();
  renderDetail();
  renderActions();
  renderPipeline();
  renderCalendar();
  renderActionClientOptions();
};

const loadDashboard = async ({ fromAuth = false } = {}) => {
  state.isLoading = true;
  state.portalError = "";
  setSourceBadge("loading", fromAuth ? "Verifying" : "Syncing Notion");

  if (fromAuth) {
    showAccessPanel("Verifying your Kijiji session and syncing Notion...", "info");
    setAccessBusy(true);
  } else {
    showDashboard();
    renderPortal();
  }

  try {
    const response = await fetch(apiEndpoint, {
      headers: getRequestHeaders(),
    });
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(getPortalErrorMessage(response, data));
      error.statusCode = response.status;
      error.apiError = data?.error;
      throw error;
    }

    state.teamUser = data.source?.user || state.teamUser;
    state.clients = Array.isArray(data.clients) ? data.clients : [];
    state.actions = Array.isArray(data.actions) ? data.actions : [];
    state.opportunities = Array.isArray(data.opportunities) ? data.opportunities : [];
    state.events = Array.isArray(data.events) ? data.events : [];
    state.selectedClientId = state.selectedClientId || state.clients[0]?.id || "";
    state.isLoading = false;
    setSourceBadge("ready", state.teamUser?.fullName ? `${state.teamUser.fullName} / Notion synced` : "Synced with Notion");
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
    state.teamUser = error.statusCode === 401 || error.statusCode === 403 ? null : state.teamUser;
    state.portalError = fromAuth ? "" : error.message;

    if (error.statusCode === 401 || error.statusCode === 403) {
      await supabaseClient?.auth?.signOut?.();
    }

    if (fromAuth) {
      setSourceBadge("error", "Access failed");
      showAccessPanel(error.message, "error");
    } else if (error.statusCode === 401) {
      state.portalError = "";
      setSourceBadge("locked", "Locked");
      showAccessPanel("Your secure session expired. Sign in again with your Kijiji email.", "error");
    } else if (error.statusCode === 403) {
      state.portalError = "";
      setSourceBadge("locked", "Not approved");
      showAccessPanel(error.message, "error");
    }

    return false;
  } finally {
    state.isLoading = false;
    setAccessBusy(false);

    if (!fromAuth) {
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

const setSelectValue = (selectEl, value) => {
  if (!selectEl) {
    return;
  }

  const nextValue = String(value || "");
  if (nextValue && ![...selectEl.options].some((option) => option.value === nextValue)) {
    selectEl.add(new Option(nextValue, nextValue));
  }
  selectEl.value = nextValue;
};

const applyOwnerFieldPolicy = (selectEl) => {
  if (!selectEl) {
    return;
  }

  if (isAdminUser()) {
    selectEl.disabled = false;
    return;
  }

  setSelectValue(selectEl, state.teamUser?.owner || "Unassigned");
  selectEl.disabled = true;
};

const getFormOwnerValue = (form, formData) =>
  String(formData.get("owner") || form.elements.owner?.value || state.teamUser?.owner || "Unassigned");

const openClientForm = (client = null) => {
  els.clientForm.reset();
  els.clientFormTitle.textContent = client ? "Edit client" : "Add client";
  els.clientForm.elements.id.value = client?.id || "";
  els.clientForm.elements.name.value = client?.name || "";
  els.clientForm.elements.category.value = client?.category || "";
  setSelectValue(els.clientForm.elements.status, client?.status || "Prospect");
  els.clientForm.elements.owner.value = client?.owner || "";
  setSelectValue(els.clientForm.elements.focusLevel, client?.focusLevel || "Normal");
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
  renderClientOptions(els.actionClientSelect);
  els.actionFormTitle.textContent = action ? "Edit task" : "Add task";
  els.actionForm.elements.id.value = action?.id || "";
  els.actionForm.elements.title.value = action?.title || "";
  setSelectValue(els.actionForm.elements.status, action?.status || "Open");
  setSelectValue(els.actionForm.elements.owner, action?.owner || "Unassigned");
  setSelectValue(els.actionForm.elements.priority, action?.priority || "Normal");
  els.actionForm.elements.dueDate.value = action?.dueDate || todayISO;
  els.actionForm.elements.clientId.value = action?.clientIds?.[0] || "";
  els.actionForm.elements.blocker.checked = Boolean(action?.blocker);
  els.actionForm.elements.notes.value = action?.notes || "";
  applyOwnerFieldPolicy(els.actionForm.elements.owner);
  openDialog(els.actionDialog);
};

const openOpportunityForm = (opportunity = null) => {
  els.opportunityForm.reset();
  renderClientOptions(els.opportunityClientSelect);
  els.opportunityFormTitle.textContent = opportunity ? "Edit opportunity" : "Add opportunity";
  els.opportunityForm.elements.id.value = opportunity?.id || "";
  els.opportunityForm.elements.name.value = opportunity?.name || "";
  setSelectValue(els.opportunityForm.elements.stage, opportunity?.stage || "New");
  setSelectValue(els.opportunityForm.elements.owner, opportunity?.owner || "Unassigned");
  setSelectValue(els.opportunityForm.elements.priority, opportunity?.priority || "Normal");
  els.opportunityForm.elements.dueDate.value = opportunity?.dueDate || todayISO;
  els.opportunityForm.elements.clientId.value = opportunity?.clientIds?.[0] || "";
  els.opportunityForm.elements.blocker.checked = Boolean(opportunity?.blocker);
  els.opportunityForm.elements.nextStep.value = opportunity?.nextStep || "";
  applyOwnerFieldPolicy(els.opportunityForm.elements.owner);
  openDialog(els.opportunityDialog);
};

const openEventForm = (eventItem = null) => {
  els.eventForm.reset();
  renderClientOptions(els.eventClientSelect);
  els.eventFormTitle.textContent = eventItem ? "Edit event" : "Add event";
  els.eventForm.elements.id.value = eventItem?.id || "";
  els.eventForm.elements.name.value = eventItem?.name || "";
  setSelectValue(els.eventForm.elements.type, eventItem?.type || "Release");
  setSelectValue(els.eventForm.elements.status, eventItem?.status || "Planned");
  setSelectValue(els.eventForm.elements.owner, eventItem?.owner || "Unassigned");
  els.eventForm.elements.date.value = eventItem?.date || todayISO;
  els.eventForm.elements.clientId.value = eventItem?.clientIds?.[0] || "";
  els.eventForm.elements.notes.value = eventItem?.notes || "";
  applyOwnerFieldPolicy(els.eventForm.elements.owner);
  openDialog(els.eventDialog);
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
    throw new Error("Your secure session expired. Sign in again with your Kijiji email.");
  }

  if (response.status === 403) {
    throw new Error(data.message || "This action is outside your Kijiji portal access.");
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
    owner: getFormOwnerValue(els.actionForm, formData),
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
    submit.textContent = "Save Task";
  }
};

const handleOpportunitySubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(els.opportunityForm);
  const client = getClient(String(formData.get("clientId") || ""));
  const payload = {
    resource: "opportunity",
    id: String(formData.get("id") || ""),
    name: String(formData.get("name") || "").trim(),
    stage: String(formData.get("stage") || "New"),
    owner: getFormOwnerValue(els.opportunityForm, formData),
    priority: String(formData.get("priority") || "Normal"),
    dueDate: String(formData.get("dueDate") || "").trim(),
    clientId: client?.id || "",
    clientName: client?.name || "",
    blocker: formData.get("blocker") === "on",
    nextStep: String(formData.get("nextStep") || "").trim(),
  };
  const submit = els.opportunityForm.querySelector('[type="submit"]');

  submit.disabled = true;
  submit.textContent = "Saving...";

  try {
    await saveResource(payload);
    closeDialog(els.opportunityDialog);
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Save Opportunity";
  }
};

const handleEventSubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(els.eventForm);
  const client = getClient(String(formData.get("clientId") || ""));
  const payload = {
    resource: "event",
    id: String(formData.get("id") || ""),
    name: String(formData.get("name") || "").trim(),
    type: String(formData.get("type") || "Event"),
    status: String(formData.get("status") || "Planned"),
    owner: getFormOwnerValue(els.eventForm, formData),
    date: String(formData.get("date") || "").trim(),
    clientId: client?.id || "",
    clientName: client?.name || "",
    notes: String(formData.get("notes") || "").trim(),
  };
  const submit = els.eventForm.querySelector('[type="submit"]');

  submit.disabled = true;
  submit.textContent = "Saving...";

  try {
    await saveResource(payload);
    closeDialog(els.eventDialog);
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Save Event";
  }
};

const handleAccessSubmit = async (event) => {
  event.preventDefault();
  const email = els.accessInput.value.trim().toLowerCase();

  if (window.location.protocol === "file:") {
    setAccessMessage(`Magic-link sign-in only works from the live secure portal: ${livePortalUrl}`, "error");
    return;
  }

  if (!email) {
    setAccessMessage("Enter your Kijiji email to receive a secure sign-in link.", "error");
    els.accessInput.focus();
    return;
  }

  if (!supabaseClient) {
    setAccessMessage("Supabase Auth did not load. Refresh the page, then try again.", "error");
    return;
  }

  setAccessBusy(true);
  setAccessMessage("Sending secure sign-in link...", "info");

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  let error = null;

  try {
    const result = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });
    error = result.error;
  } catch (fetchError) {
    error = fetchError;
  }

  setAccessBusy(false);

  if (error) {
    const message = /failed to fetch/i.test(error.message || "")
      ? "Could not reach Supabase Auth from this page. Open the live secure portal and try again."
      : error.message || "Unable to send a sign-in link. Check Supabase Auth settings.";
    setAccessMessage(message, "error");
    els.accessInput.focus();
    return;
  }

  setAccessMessage("Check your inbox for the secure Kijiji sign-in link. Keep this tab open after you click it.", "info");
};

async function logoutPortal() {
  await supabaseClient?.auth?.signOut?.();
  state = {
    clients: [],
    actions: [],
    opportunities: [],
    events: [],
    selectedClientId: "",
    isLoading: false,
    portalError: "",
    authSession: null,
    teamUser: null,
  };
  setSourceBadge("signed-out", "Signed out");
  applyRoleUi();
  showAccessPanel("You have been signed out. Use your approved Kijiji email to sign back in.", "info");
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
  const jumpOpportunity = event.target.closest("[data-jump-opportunity]");
  const jumpEvent = event.target.closest("[data-jump-event]");

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

  if (jumpOpportunity) {
    const opportunity = state.opportunities.find((item) => item.id === jumpOpportunity.dataset.jumpOpportunity);
    if (opportunity) {
      openOpportunityForm(opportunity);
    }
  }

  if (jumpEvent) {
    const eventItem = state.events.find((item) => item.id === jumpEvent.dataset.jumpEvent);
    if (eventItem) {
      openEventForm(eventItem);
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
    const opportunityCardEl = event.target.closest("[data-opportunity-id]");
    const eventCardEl = event.target.closest("[data-event-id]");
    if (actionCardEl) {
      const action = state.actions.find((item) => item.id === actionCardEl.dataset.actionId);
      if (action) {
        openActionForm(action);
      }
    }

    if (opportunityCardEl) {
      const opportunity = state.opportunities.find((item) => item.id === opportunityCardEl.dataset.opportunityId);
      if (opportunity) {
        openOpportunityForm(opportunity);
      }
    }

    if (eventCardEl) {
      const eventItem = state.events.find((item) => item.id === eventCardEl.dataset.eventId);
      if (eventItem) {
        openEventForm(eventItem);
      }
    }
  });

  target.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const actionCardEl = event.target.closest("[data-action-id]");
    const opportunityCardEl = event.target.closest("[data-opportunity-id]");
    const eventCardEl = event.target.closest("[data-event-id]");
    if (actionCardEl) {
      event.preventDefault();
      const action = state.actions.find((item) => item.id === actionCardEl.dataset.actionId);
      if (action) {
        openActionForm(action);
      }
    }

    if (opportunityCardEl) {
      event.preventDefault();
      const opportunity = state.opportunities.find((item) => item.id === opportunityCardEl.dataset.opportunityId);
      if (opportunity) {
        openOpportunityForm(opportunity);
      }
    }

    if (eventCardEl) {
      event.preventDefault();
      const eventItem = state.events.find((item) => item.id === eventCardEl.dataset.eventId);
      if (eventItem) {
        openEventForm(eventItem);
      }
    }
  });
});

els.actionList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const actionCardEl = event.target.closest("[data-action-id]");
  if (actionCardEl) {
    event.preventDefault();
    const action = state.actions.find((item) => item.id === actionCardEl.dataset.actionId);
    if (action) {
      openActionForm(action);
    }
  }
});

els.pipelineGrid.addEventListener("click", (event) => {
  const opportunityCardEl = event.target.closest("[data-opportunity-id]");
  if (opportunityCardEl) {
    const opportunity = state.opportunities.find((item) => item.id === opportunityCardEl.dataset.opportunityId);
    if (opportunity) {
      openOpportunityForm(opportunity);
    }
  }
});

els.pipelineGrid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const opportunityCardEl = event.target.closest("[data-opportunity-id]");
  if (opportunityCardEl) {
    event.preventDefault();
    const opportunity = state.opportunities.find((item) => item.id === opportunityCardEl.dataset.opportunityId);
    if (opportunity) {
      openOpportunityForm(opportunity);
    }
  }
});

els.calendarList.addEventListener("click", (event) => {
  const eventCardEl = event.target.closest("[data-event-id]");
  if (eventCardEl) {
    const eventItem = state.events.find((item) => item.id === eventCardEl.dataset.eventId);
    if (eventItem) {
      openEventForm(eventItem);
    }
  }
});

els.calendarList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const eventCardEl = event.target.closest("[data-event-id]");
  if (eventCardEl) {
    event.preventDefault();
    const eventItem = state.events.find((item) => item.id === eventCardEl.dataset.eventId);
    if (eventItem) {
      openEventForm(eventItem);
    }
  }
});

$$("[data-open-action-form]").forEach((button) => button.addEventListener("click", () => openActionForm()));
$$("[data-open-client-form]").forEach((button) => button.addEventListener("click", () => openClientForm()));
$$("[data-open-opportunity-form]").forEach((button) => button.addEventListener("click", () => openOpportunityForm()));
$$("[data-open-event-form]").forEach((button) => button.addEventListener("click", () => openEventForm()));
$$("[data-close-action-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.actionDialog)));
$$("[data-close-client-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.clientDialog)));
$$("[data-close-opportunity-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.opportunityDialog)));
$$("[data-close-event-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.eventDialog)));
$("[data-refresh-dashboard]").addEventListener("click", () => loadDashboard());
els.logout?.addEventListener("click", logoutPortal);
els.accessForm.addEventListener("submit", handleAccessSubmit);
els.clientForm.addEventListener("submit", handleClientSubmit);
els.actionForm.addEventListener("submit", handleActionSubmit);
els.opportunityForm.addEventListener("submit", handleOpportunitySubmit);
els.eventForm.addEventListener("submit", handleEventSubmit);
els.search.addEventListener("input", renderRows);
els.statusFilter.addEventListener("change", renderRows);

const initializeAuth = async () => {
  if (!supabaseClient) {
    state.isLoading = false;
    setSourceBadge("error", "Auth unavailable");
    showAccessPanel("Supabase Auth could not load. Refresh the page, then try again.", "error");
    return;
  }

  setSourceBadge("loading", "Checking session");
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    state.isLoading = false;
    setSourceBadge("locked", "Locked");
    showAccessPanel(error.message || "Sign in with your approved Kijiji email.", "error");
    return;
  }

  state.authSession = data?.session || null;

  if (state.authSession) {
    await loadDashboard({ fromAuth: true });
  } else {
    state.isLoading = false;
    setSourceBadge("locked", "Locked");
    showAccessPanel("Sign in with your approved Kijiji email to open your dashboard.", "info");
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    state.authSession = session || null;
    if (event === "SIGNED_IN" && state.authSession) {
      await loadDashboard({ fromAuth: true });
    }
    if (event === "SIGNED_OUT") {
      state.teamUser = null;
      state.authSession = null;
      applyRoleUi();
    }
  });
};

if (!supabaseClient) {
  state.isLoading = false;
  setSourceBadge("error", "Auth unavailable");
  showAccessPanel("Supabase Auth could not load. Refresh the page, then try again.", "error");
} else {
  initializeAuth();
}
