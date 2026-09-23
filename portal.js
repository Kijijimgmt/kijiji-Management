const apiEndpoint = "/api/notion-clients";
const documentsEndpoint = "/api/notion-documents";
const notificationsEndpoint = "/api/notifications";
const authLinkEndpoint = "/api/auth-link";
const authConfigEndpoint = "/api/auth-config";
const livePortalUrl = "https://www.kijijimgmt.com/client-portal";
const themeStorageKey = "kijiji-dashboard-theme";
const systemTheme = window.matchMedia("(prefers-color-scheme: light)");
let supabaseClient = null;
const today = new Date();
const todayISO = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-");

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
  calendarGrid: $("[data-calendar-grid]"),
  calendarPeriod: $("[data-calendar-period]"),
  calendarUpcomingCount: $("[data-calendar-upcoming-count]"),
  calendarPrevious: $("[data-calendar-previous]"),
  calendarNext: $("[data-calendar-next]"),
  calendarToday: $("[data-calendar-today]"),
  calendarViewButtons: $$('[data-calendar-view]'),
  documentList: $("[data-document-list]"),
  documentCount: $("[data-document-count]"),
  documentSearch: $("[data-search-documents]"),
  documentCategory: $("[data-document-category]"),
  documentDialog: $("[data-document-dialog]"),
  documentForm: $("[data-document-form]"),
  documentClientSelect: $("[data-document-client-select]"),
  documentMessage: $("[data-document-message]"),
  notificationCenter: $("[data-notification-center]"),
  notificationList: $("[data-notification-list]"),
  notificationCount: $("[data-notification-count]"),
  markNotificationsRead: $("[data-mark-notifications-read]"),
  myWorkActionList: $("[data-my-work-action-list]"),
  myWorkDealList: $("[data-my-work-deal-list]"),
  myWorkWatchList: $("[data-my-work-watch-list]"),
  dailyPriority: $("[data-daily-priority]"),
  clientHealthStrip: $("[data-client-health-strip]"),
  approvalList: $("[data-approval-list]"),
  approvalCount: $("[data-approval-count]"),
  workOpenCount: $("[data-work-open-count]"),
  workBlockedCount: $("[data-work-blocked-count]"),
  workDealCount: $("[data-work-deal-count]"),
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
  clientCount: $("[data-client-count]"),
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
  workspaceTitle: $("[data-workspace-title]"),
  navLinks: $$(".portal-nav a[href^='#']"),
  portalViews: $$("[data-portal-view]"),
  tourOverlay: $("[data-tour-overlay]"),
  tourProgress: $("[data-tour-progress]"),
  tourEyebrow: $("[data-tour-eyebrow]"),
  tourTitle: $("[data-tour-title]"),
  tourDescription: $("[data-tour-description]"),
  tourBack: $("[data-tour-back]"),
  tourNext: $("[data-tour-next]"),
  tourSkip: $("[data-tour-skip]"),
  tourTriggers: $$("[data-start-tour]"),
  themeButtons: $$('[data-theme-option]'),
};

const applyThemePreference = (preference, { save = false } = {}) => {
  const safePreference = ["light", "dark", "system"].includes(preference) ? preference : "system";
  const effectiveTheme = safePreference === "system" ? (systemTheme.matches ? "light" : "dark") : safePreference;

  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.dataset.themePreference = safePreference;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", effectiveTheme === "light" ? "#f6f2eb" : "#060504");
  els.themeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeOption === safePreference));
  });

  if (save) {
    try {
      window.localStorage.setItem(themeStorageKey, safePreference);
    } catch (error) {
      // The visual preference still applies when browser storage is unavailable.
    }
  }
};

applyThemePreference(document.documentElement.dataset.themePreference || "system");
systemTheme.addEventListener?.("change", () => {
  if (document.documentElement.dataset.themePreference === "system") applyThemePreference("system");
});

let state = {
  clients: [],
  actions: [],
  opportunities: [],
  events: [],
  documents: [],
  notifications: [],
  selectedClientId: "",
  isLoading: true,
  portalError: "",
  authSession: null,
  teamUser: null,
};

let calendarView = "month";
let calendarCursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
let tourIndex = 0;
let tourReturnFocus = null;

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

const formatNotificationTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const getDaysUntil = (value) => {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const dueDate = new Date(`${value}T00:00:00`);
  const start = new Date(`${todayISO}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((dueDate.getTime() - start.getTime()) / 86400000);
};

const toLocalISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfWeek = (date) => addDays(date, -date.getDay());

const formatCountdown = (value) => {
  const days = getDaysUntil(value);
  if (!Number.isFinite(days)) return "Date needed";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `${days} days away`;
  if (days === -1) return "1 day ago";
  return `${Math.abs(days)} days ago`;
};

const isComplete = (item) =>
  ["complete", "completed", "done", "closed", "won", "lost"].includes(String(item.status || item.stage || "").toLowerCase());
const isUrgent = (item) => ["urgent", "high"].includes(String(item.priority || item.focusLevel || "").toLowerCase());
const isWaiting = (item) => ["waiting", "needs approval"].includes(String(item.status || "").toLowerCase());
const isAdminUser = () => Boolean(state.teamUser?.isAdmin);
const ownerKey = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "max" || text === "maxwell") return "maxwell";
  if (text === "joe") return "joe";
  if (text === "erik") return "erik";
  if (text === "emad") return "emad";
  return text;
};
const ownerMatches = (value, owner) => ownerKey(value) === ownerKey(owner);

const getProgressEstimate = (client) => {
  if (Number.isFinite(Number(client.progress)) && Number(client.progress) >= 0) {
    return Math.min(100, Math.max(0, Number(client.progress)));
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

const getClientHealth = (client) => {
  const actions = getRelated(state.actions, client.id).filter((item) => !isComplete(item));
  const opportunities = getRelated(state.opportunities, client.id).filter((item) => !isComplete(item));
  const hasBlocker = [...actions, ...opportunities].some((item) => item.blocker);
  const overdue = [...actions, ...opportunities].filter((item) => getDaysUntil(item.dueDate) < 0).length;
  const waiting = actions.filter(isWaiting).length;

  if (hasBlocker || overdue > 1) {
    return { label: "At Risk", tone: "danger", reason: hasBlocker ? "Blocked work needs attention" : `${overdue} overdue next moves` };
  }

  if (overdue === 1 || !String(client.nextAction || "").trim()) {
    return { label: "Needs Attention", tone: "warning", reason: overdue ? "One next move is overdue" : "Next move is missing" };
  }

  if (waiting) {
    return { label: "Waiting", tone: "waiting", reason: `${waiting} item${waiting === 1 ? "" : "s"} awaiting input or approval` };
  }

  return { label: "On Track", tone: "success", reason: "No visible blockers or overdue work" };
};

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
  setActiveView();
};

const viewTitles = {
  "my-work": "Today",
  overview: "Team pulse",
  clients: "Clients",
  work: "Work",
  calendar: "Calendar",
  documents: "Documents",
  guidance: "Playbook",
};

const viewAliases = {
  actions: "work",
  opportunities: "work",
};

const setActiveView = ({ focusTitle = false } = {}) => {
  const requestedHash = window.location.hash.slice(1) || "my-work";
  const requestedView = viewAliases[requestedHash] || requestedHash;
  const isAdminView = requestedView === "overview";
  const activeView = viewTitles[requestedView] && (!isAdminView || isAdminUser()) ? requestedView : "my-work";

  els.portalViews.forEach((view) => {
    const adminOnly = view.hasAttribute("data-admin-only");
    view.hidden = view.dataset.portalView !== activeView || (adminOnly && !isAdminUser());
  });

  els.navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${activeView}`;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  $$(".nav-more").forEach((menu) => {
    const hasActiveLink = Boolean(menu.querySelector("a.is-active"));
    menu.querySelector(":scope > summary")?.classList.toggle("is-active", hasActiveLink);
    if (focusTitle) menu.open = false;
  });

  if (els.workspaceTitle) {
    els.workspaceTitle.textContent = viewTitles[activeView];
    if (focusTitle) els.workspaceTitle.focus({ preventScroll: true });
  }

  document.title = `${viewTitles[activeView]} | Kijiji Team Portal`;

  if (activeView !== requestedHash) {
    window.history.replaceState(null, "", `#${activeView}`);
  }
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

const parseJsonResponse = async (response) => {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {
      error: "invalid_response",
      message: response.ok
        ? "The dashboard service returned an unexpected response. Refresh and try again."
        : "The dashboard service is temporarily unavailable. Try again from the live secure portal.",
    };
  }
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

    const matchesStatus = status === "all" ? client.status !== "Archived" : client.status === status;
    return (!query || searchable.includes(query)) && matchesStatus;
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
  const allPersonalActions = getPersonalActions();
  const allPersonalDeals = getPersonalOpportunities();
  const waitingAll = [
    ...allPersonalActions.filter(isWaiting).map((item) => ({ kind: "action", item })),
    ...allPersonalDeals.filter((item) => item.blocker).map((item) => ({ kind: "opportunity", item })),
  ];
  const waitingItems = waitingAll.slice(0, 6);
  const needsActionAll = [
    ...allPersonalActions
      .filter((item) => !isWaiting(item))
      .map((item) => ({ kind: "action", item, days: getDaysUntil(item.dueDate) })),
    ...allPersonalDeals
      .filter((item) => !item.blocker && (isUrgent(item) || getDaysUntil(item.dueDate) <= 7))
      .map((item) => ({ kind: "opportunity", item, days: getDaysUntil(item.dueDate) })),
  ]
    .sort((a, b) => Number(Boolean(b.item.blocker)) - Number(Boolean(a.item.blocker)) || a.days - b.days);
  const needsAction = needsActionAll.slice(0, 6);
  const upcomingAll = [
    ...getPersonalEvents().map((item) => ({ kind: "event", item, days: getDaysUntil(item.date) })),
    ...allPersonalDeals
      .filter((item) => !item.blocker && getDaysUntil(item.dueDate) > 7)
      .map((item) => ({ kind: "opportunity", item, days: getDaysUntil(item.dueDate) })),
  ]
    .sort((a, b) => a.days - b.days);
  const upcomingItems = upcomingAll.slice(0, 6);
  const personalBlockers = [
    ...allPersonalActions
      .filter((action) => action.blocker)
      .map((item) => ({ kind: "action", item })),
    ...allPersonalDeals
      .filter((opportunity) => opportunity.blocker)
      .map((item) => ({ kind: "opportunity", item })),
  ];

  const renderLane = (items) =>
    items
      .map(({ kind, item }) => {
        if (kind === "event") return eventCard(item);
        return kind === "opportunity" ? opportunityCard(item) : actionCard(item);
      })
      .join("");

  els.myWorkTitle.textContent = `${userName}'s focus`;
  els.myWorkSubtitle.textContent = "Move what is actionable, track what is waiting, and protect what is next.";
  els.userBadge.textContent = `${state.teamUser?.role === "admin" ? "Admin" : "Member"} / ${state.teamUser?.email || "Signed in"}`;
  els.myWorkTasksMetric.textContent = String(needsActionAll.length);
  els.myWorkDealsMetric.textContent = String(waitingAll.length);
  els.myWorkEventsMetric.textContent = String(upcomingAll.length);
  els.myWorkBlockersMetric.textContent = String(personalBlockers.length);

  const priority = needsActionAll[0];
  if (priority) {
    const item = priority.item;
    const title = priority.kind === "opportunity" ? item.name : item.title;
    const context = item.nextStep || item.notes || getClientName(item);
    const recordAttribute = priority.kind === "opportunity" ? "data-opportunity-id" : "data-action-id";
    els.dailyPriority.innerHTML = `
      <div>
        <p class="eyebrow">Your next move</p>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(context)}</span>
      </div>
      <div class="daily-priority-meta">
        <span class="date-chip" data-tone="${priority.days < 0 ? "danger" : ""}">${formatDate(item.dueDate)}</span>
        <button class="button button-primary" type="button" ${recordAttribute}="${escapeHtml(item.id)}">Open</button>
      </div>
    `;
  } else {
    els.dailyPriority.innerHTML = `
      <div>
        <p class="eyebrow">Your next move</p>
        <strong>You are clear for now.</strong>
        <span>No urgent or overdue work needs your attention.</span>
      </div>
      <button class="button button-secondary" type="button" data-open-action-form>Add a task</button>
    `;
  }

  if (needsAction.length) {
    els.myWorkActionList.innerHTML = renderLane(needsAction);
  } else {
    renderEmptyList(els.myWorkActionList, "Clear for now", "No urgent, overdue, or active next moves need you.");
  }

  if (waitingItems.length) {
    els.myWorkDealList.innerHTML = renderLane(waitingItems);
  } else {
    renderEmptyList(els.myWorkDealList, "Nothing waiting", "Approvals, client replies, and blocked deal moves will appear here.");
  }

  if (upcomingItems.length) {
    els.myWorkWatchList.innerHTML = renderLane(upcomingItems);
  } else {
    renderEmptyList(els.myWorkWatchList, "No upcoming dates", "Assigned events, releases, and future deal moves will appear here.");
  }
};

const renderClientHealthStrip = () => {
  const toneRank = { danger: 0, warning: 1, waiting: 2, success: 3 };
  const clients = state.clients
    .map((client) => ({ client, health: getClientHealth(client) }))
    .sort((a, b) => toneRank[a.health.tone] - toneRank[b.health.tone])
    .slice(0, 5);

  if (!clients.length) {
    renderEmptyList(els.clientHealthStrip, "No clients yet", "Client health will appear as the roster grows.");
    return;
  }

  els.clientHealthStrip.innerHTML = clients
    .map(
      ({ client, health }) => `
        <button class="client-health-item" type="button" data-health-client-id="${escapeHtml(client.id)}">
          <span class="health-dot" data-tone="${escapeHtml(health.tone)}" aria-hidden="true"></span>
          <span>
            <strong>${escapeHtml(client.name)}</strong>
            <small>${escapeHtml(health.reason)}</small>
          </span>
          <em>${escapeHtml(health.label)}</em>
        </button>
      `,
    )
    .join("");
};

const renderApprovals = () => {
  const approvals = state.actions
    .filter((action) => String(action.status || "").toLowerCase() === "needs approval")
    .filter((action) => isAdminUser() || !action.approvalOwner || ownerMatches(action.approvalOwner, state.teamUser?.owner))
    .sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate));

  els.approvalCount.textContent = `${approvals.length} pending`;
  if (!approvals.length) {
    renderEmptyList(els.approvalList, "Inbox clear", "Tasks marked Needs Approval will appear here for review.");
    return;
  }

  els.approvalList.innerHTML = approvals
    .map(
      (action) => `
        <article class="approval-item editable-card" data-action-id="${escapeHtml(action.id)}" role="button" tabindex="0" aria-label="Review ${escapeHtml(action.title)}">
          <div>
            <span>${escapeHtml(getClientName(action))}</span>
            <strong>${escapeHtml(action.title)}</strong>
            <p>${escapeHtml(action.dependency || action.notes || "Review and record the decision.")}</p>
          </div>
          <div class="approval-meta">
            <span>${escapeHtml(action.approvalOwner || "Team approval")}</span>
            <span class="date-chip" data-tone="${getDaysUntil(action.dueDate) < 0 ? "danger" : ""}">${formatDate(action.dueDate)}</span>
            <span class="button button-secondary" aria-hidden="true">Review</span>
          </div>
        </article>
      `,
    )
    .join("");
};

const renderWorkSummary = () => {
  const openActions = getOpenActions();
  const openOpportunities = getOpenOpportunities();
  if (els.workOpenCount) els.workOpenCount.textContent = openActions.length;
  if (els.workBlockedCount) {
    els.workBlockedCount.textContent = [...openActions, ...openOpportunities].filter((item) => item.blocker).length;
  }
  if (els.workDealCount) els.workDealCount.textContent = openOpportunities.length;
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
  <article class="action-item editable-card" data-action-id="${escapeHtml(action.id)}" role="button" tabindex="0" aria-label="Edit task: ${escapeHtml(action.title)}">
    <header>
      <strong>${escapeHtml(action.title)}</strong>
      <span class="date-chip" data-tone="${getDaysUntil(action.dueDate) < 0 ? "danger" : ""}">${formatDate(action.dueDate)}</span>
    </header>
    <p title="${escapeHtml(action.notes || getClientName(action))}">${escapeHtml(action.notes || getClientName(action))}</p>
    ${action.dependency ? `<p class="workflow-context"><span>Waiting on</span> ${escapeHtml(action.dependency)}</p>` : ""}
    <div class="item-meta">
      <span data-state="${isWaiting(action) ? "waiting" : "active"}">${escapeHtml(action.status || "Open")}</span>
      <span>${escapeHtml(action.owner || "Unassigned")}</span>
      <span>${escapeHtml(action.priority || "Normal")}</span>
      ${action.approvalOwner ? `<span>Approver: ${escapeHtml(action.approvalOwner)}</span>` : ""}
      ${action.recurrence ? `<span>Repeats: ${escapeHtml(action.recurrence)}</span>` : ""}
      ${action.blocker ? "<span>Blocker</span>" : ""}
    </div>
    <span class="text-action" aria-hidden="true">Edit Task</span>
  </article>
`;

const opportunityCard = (opportunity) => `
  <article class="action-item editable-card" data-opportunity-id="${escapeHtml(opportunity.id)}" role="button" tabindex="0" aria-label="Edit opportunity: ${escapeHtml(opportunity.name)}">
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
    <span class="text-action" aria-hidden="true">Edit Opportunity</span>
  </article>
`;

const eventCard = (event) => `
  <article class="calendar-item editable-card" data-event-id="${escapeHtml(event.id)}" role="button" tabindex="0" aria-label="Edit event: ${escapeHtml(event.name)}">
    <span>${formatDate(event.date)} <small>${escapeHtml(formatCountdown(event.date))}</small></span>
    <strong>${escapeHtml(event.name)}</strong>
    <em>${escapeHtml(getClientName(event))}${event.type ? ` / ${escapeHtml(event.type)}` : ""}</em>
    <span class="text-action" aria-hidden="true">Edit Event</span>
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
  els.clientCount.textContent = `${filtered.length} ${filtered.length === 1 ? "client" : "clients"}`;

  if (!filtered.length) {
    els.rows.innerHTML = `
      <div class="empty-state client-roster-empty">
        <p class="eyebrow">No matches</p>
        <h2>No clients found</h2>
        <p>Try a different name, owner, focus, or status.</p>
      </div>
    `;
    return;
  }

  els.rows.innerHTML = filtered
    .map((client) => {
      const progress = getProgressEstimate(client);
      const health = getClientHealth(client);
      const selected = client.id === state.selectedClientId;

      return `
        <button
          type="button"
          class="client-card${selected ? " is-selected" : ""}"
          data-client-id="${escapeHtml(client.id)}"
          aria-pressed="${selected}"
          aria-label="Open ${escapeHtml(client.name || "Untitled client")} client roadmap"
        >
          <div class="client-card-head">
            <div class="client-name">
              <strong>${escapeHtml(client.name || "Untitled client")}</strong>
              <span>${escapeHtml(client.category || "Type not set")}</span>
            </div>
            <span class="health-pill" data-tone="${health.tone}" title="${escapeHtml(health.reason)}">${escapeHtml(health.label)}</span>
          </div>
          <div class="client-card-pills">
            <span class="status-pill" data-status="${escapeHtml(client.status)}">${escapeHtml(client.status)}</span>
            <span class="focus-pill" data-focus="${escapeHtml(client.focusLevel)}">${escapeHtml(client.focusLevel || "Normal")}</span>
          </div>
          <div class="client-card-next">
            <span>Next move</span>
            <strong>${escapeHtml(client.nextAction || "Add a clear next move")}</strong>
          </div>
          <div class="client-card-footer">
            <span class="client-card-owner">${escapeHtml(client.owner || "Unassigned")}</span>
            <div class="client-card-progress">
              <div class="progress-track" role="progressbar" aria-label="${progress} percent complete" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
                <span style="width:${progress}%"></span>
              </div>
              <strong>${progress}%</strong>
            </div>
          </div>
          <span class="client-card-open" aria-hidden="true">Open roadmap <b>→</b></span>
        </button>
      `;
    })
    .join("");
};

const roadmapPhases = [
  { name: "Align", detail: "Goals and direction" },
  { name: "Build", detail: "Systems and assets" },
  { name: "Activate", detail: "Launch and execution" },
  { name: "Scale", detail: "Growth and expansion" },
];

const getRoadmapMilestones = (clientId) => {
  const milestones = [
    ...getRelated(state.actions, clientId).map((item) => ({
      id: item.id,
      kind: "Task",
      jump: "action",
      title: item.title,
      date: item.dueDate,
      status: item.status || "Open",
      owner: item.owner,
      blocker: item.blocker,
      complete: isComplete(item),
    })),
    ...getRelated(state.opportunities, clientId).map((item) => ({
      id: item.id,
      kind: "Deal",
      jump: "opportunity",
      title: item.name,
      date: item.dueDate,
      status: item.stage || "New",
      owner: item.owner,
      blocker: item.blocker,
      complete: isComplete(item),
    })),
    ...getRelated(state.events, clientId).map((item) => ({
      id: item.id,
      kind: item.type || "Event",
      jump: "event",
      title: item.name,
      date: item.date,
      status: item.status || "Planned",
      owner: item.owner,
      blocker: item.status === "Delayed",
      complete: isComplete(item),
    })),
  ];

  return milestones.sort((a, b) => {
    if (!a.date && !b.date) return a.title.localeCompare(b.title);
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
};

const renderRoadmapMilestone = (item) => `
  <button
    class="roadmap-milestone ${item.complete ? "is-complete" : ""} ${item.blocker ? "is-blocked" : ""}"
    type="button"
    data-jump-${item.jump}="${escapeHtml(item.id)}"
  >
    <span class="roadmap-milestone-marker" aria-hidden="true"></span>
    <span class="roadmap-milestone-copy">
      <span>${escapeHtml(item.kind)} / ${formatDate(item.date)}</span>
      <strong>${escapeHtml(item.title || "Untitled milestone")}</strong>
    </span>
    <span class="roadmap-milestone-meta">
      <em>${escapeHtml(item.status)}</em>
      <small>${escapeHtml(item.owner || "Unassigned")}</small>
    </span>
  </button>
`;

const getRoadmapSnapshot = (milestones, currentPhase) => {
  const open = milestones.filter((item) => !item.complete);
  const overdue = open.filter((item) => getDaysUntil(item.date) < 0).length;
  const next = open.find((item) => item.date && getDaysUntil(item.date) >= 0);

  return {
    phase: roadmapPhases[currentPhase]?.name || roadmapPhases[0].name,
    open: open.length,
    overdue,
    nextDate: next?.date || "",
  };
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
  const currentPhase = Math.min(roadmapPhases.length - 1, Math.floor(Math.min(progress, 99) / 25));
  const milestones = getRoadmapMilestones(client.id);
  const health = getClientHealth(client);
  const roadmapSnapshot = getRoadmapSnapshot(milestones, currentPhase);

  els.detail.innerHTML = `
    <div class="client-detail-head">
      <div>
        <p class="eyebrow">${escapeHtml(client.category || "Client")}</p>
        <h2>${escapeHtml(client.name)}</h2>
        <div class="pill-row">
          <span class="status-pill" data-status="${escapeHtml(client.status)}">${escapeHtml(client.status)}</span>
          <span class="focus-pill" data-focus="${escapeHtml(client.focusLevel)}">${escapeHtml(client.focusLevel || "Normal")}</span>
          <span class="health-pill" data-tone="${health.tone}">${escapeHtml(health.label)}</span>
        </div>
        <p class="health-reason">${escapeHtml(health.reason)}</p>
      </div>
      ${isAdminUser() ? `<button class="button button-secondary" type="button" data-edit-client="${escapeHtml(client.id)}">Edit Client</button>` : ""}
    </div>

    <section class="client-roadmap" aria-label="${escapeHtml(client.name)} roadmap" style="--roadmap-progress:${progress}%">
      <div class="roadmap-head">
        <div>
          <p class="eyebrow">Client roadmap</p>
          <h3>Where we are and what comes next</h3>
        </div>
        <div class="roadmap-actions">
          <button class="button button-secondary" type="button" data-roadmap-add-task="${escapeHtml(client.id)}">Add Task</button>
          <button class="button button-primary" type="button" data-roadmap-add-milestone="${escapeHtml(client.id)}">Add Milestone</button>
        </div>
      </div>

      <div class="roadmap-track" aria-label="${progress} percent complete">
        ${roadmapPhases
          .map(
            (phase, index) => `
              <div class="roadmap-phase ${progress === 100 || index < currentPhase ? "is-complete" : ""} ${progress < 100 && index === currentPhase ? "is-current" : ""}">
                <span class="roadmap-phase-marker">${progress === 100 || index < currentPhase ? "&#10003;" : index + 1}</span>
                <strong>${phase.name}</strong>
                <small>${phase.detail}</small>
              </div>
            `,
          )
          .join("")}
      </div>

      <div class="roadmap-current">
        <span>Current focus</span>
        <strong>${escapeHtml(client.nextAction || "Add the next move")}</strong>
        <small>${progress}% complete / ${escapeHtml(client.owner || "Unassigned")}</small>
      </div>

      <div class="roadmap-snapshot" aria-label="Roadmap summary">
        <div><span>Phase</span><strong>${escapeHtml(roadmapSnapshot.phase)}</strong></div>
        <div><span>Open items</span><strong>${roadmapSnapshot.open}</strong></div>
        <div><span>Next date</span><strong>${formatDate(roadmapSnapshot.nextDate)}</strong></div>
        <div data-tone="${roadmapSnapshot.overdue ? "danger" : "calm"}"><span>Overdue</span><strong>${roadmapSnapshot.overdue}</strong></div>
      </div>

      <div class="roadmap-milestones">
        <div class="roadmap-milestones-head">
          <h4>Timeline</h4>
          <span>${milestones.length} linked ${milestones.length === 1 ? "item" : "items"}</span>
        </div>
        ${
          milestones.length
            ? `<div class="roadmap-milestone-list">${milestones.map(renderRoadmapMilestone).join("")}</div>`
            : `<div class="roadmap-empty"><strong>No milestones yet</strong><span>Add a client-linked task or milestone to start the roadmap.</span></div>`
        }
      </div>
    </section>

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
  const upcomingAll = [...state.events]
    .filter((event) => getDaysUntil(event.date) >= 0)
    .sort((a, b) => getDaysUntil(a.date) - getDaysUntil(b.date));
  const upcoming = upcomingAll.slice(0, 10);

  const firstDate = calendarView === "week"
    ? startOfWeek(calendarCursor)
    : startOfWeek(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1));
  const dayCount = calendarView === "week" ? 7 : 42;
  const dates = Array.from({ length: dayCount }, (_, index) => addDays(firstDate, index));
  const currentMonth = calendarCursor.getMonth();
  const eventsByDate = new Map();

  state.events.forEach((event) => {
    if (!event.date) return;
    const dateEvents = eventsByDate.get(event.date) || [];
    dateEvents.push(event);
    eventsByDate.set(event.date, dateEvents);
  });

  if (calendarView === "week") {
    const weekEnd = addDays(firstDate, 6);
    const startLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(firstDate);
    const endLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(weekEnd);
    els.calendarPeriod.textContent = `${startLabel} - ${endLabel}`;
  } else {
    els.calendarPeriod.textContent = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(calendarCursor);
  }

  els.calendarGrid.dataset.view = calendarView;
  els.calendarGrid.innerHTML = dates
    .map((date) => {
      const dateKey = toLocalISODate(date);
      const events = eventsByDate.get(dateKey) || [];
      const outsideMonth = calendarView === "month" && date.getMonth() !== currentMonth;
      const visibleEvents = events.slice(0, calendarView === "week" ? 5 : 3);
      return `
        <div class="calendar-day${outsideMonth ? " is-outside" : ""}${dateKey === todayISO ? " is-today" : ""}">
          <button class="calendar-day-number" type="button" data-calendar-date="${dateKey}" aria-label="Add event on ${escapeHtml(formatDate(dateKey))}">${date.getDate()}</button>
          <div class="calendar-day-events">
            ${visibleEvents
              .map(
                (event) => `
                  <button class="calendar-event-pill" type="button" data-event-id="${escapeHtml(event.id)}" title="${escapeHtml(event.name)} - ${escapeHtml(formatCountdown(event.date))}" aria-label="Open ${escapeHtml(event.name)}">
                    <span>${escapeHtml(event.name)}</span>
                    <small>${escapeHtml(getClientName(event))}</small>
                  </button>
                `,
              )
              .join("")}
            ${events.length > visibleEvents.length ? `<span class="calendar-more">+${events.length - visibleEvents.length} more</span>` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  els.calendarViewButtons.forEach((button) => {
    const active = button.dataset.calendarView === calendarView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  els.calendarUpcomingCount.textContent = `${upcomingAll.length} upcoming`;

  if (!upcoming.length) {
    renderEmptyList(els.calendarList, "No upcoming releases", "Events and release dates will appear here once they are added in Notion.");
    return;
  }

  els.calendarList.innerHTML = upcoming.map(eventCard).join("");
};

const renderDocuments = () => {
  if (!els.documentList) return;
  const query = String(els.documentSearch?.value || "").trim().toLowerCase();
  const category = els.documentCategory?.value || "all";
  const documents = state.documents.filter((document) => {
    const matchesCategory = category === "all" || document.category === category;
    const haystack = `${document.name} ${document.description} ${document.owner} ${document.category}`.toLowerCase();
    return matchesCategory && (!query || haystack.includes(query));
  });
  els.documentCount.textContent = `${documents.length} ${documents.length === 1 ? "file" : "files"}`;
  if (!documents.length) {
    renderEmptyList(els.documentList, "No documents found", state.documents.length ? "Try another search or category." : "Upload the first contract, template, or team resource.");
    return;
  }
  els.documentList.innerHTML = documents.map((document) => {
    const client = document.clientIds?.length ? getClient(document.clientIds[0]) : null;
    return `<article class="document-card">
      <div class="document-icon" aria-hidden="true">${escapeHtml((document.fileName || document.name).split(".").pop().slice(0, 4).toUpperCase())}</div>
      <div class="document-copy"><span>${escapeHtml(document.category)}${client ? ` / ${escapeHtml(client.name)}` : ""}</span><h3>${escapeHtml(document.name)}</h3><p>${escapeHtml(document.description || "Shared Kijiji resource")}</p><small>${escapeHtml(document.owner)} · Updated ${formatDate(String(document.updatedAt || "").slice(0, 10))}</small></div>
      <div class="document-card-actions">${document.fileUrl ? `<a class="button button-primary" href="${escapeHtml(document.fileUrl)}" target="_blank" rel="noreferrer">Download</a>` : ""}${document.notionUrl ? `<a class="text-action" href="${escapeHtml(document.notionUrl)}" target="_blank" rel="noreferrer">Open in Notion</a>` : ""}</div>
    </article>`;
  }).join("");
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
  if (els.approvalCount) els.approvalCount.textContent = "Checking";
  if (els.dailyPriority) {
    els.dailyPriority.innerHTML = `<div><p class="eyebrow">Your next move</p><strong>Finding your focus...</strong><span>Checking priorities, dates, and blockers.</span></div>`;
  }
  els.rows.innerHTML = `
    <div class="empty-state client-roster-empty">
      <p class="eyebrow">Loading Notion</p>
      <h2>Syncing the operating system</h2>
      <p>Pulling clients, tasks, opportunities, and key dates from the shared Kijiji workspace.</p>
    </div>
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
    [els.clientHealthStrip, "Client pulse", "Checking relationship health."],
    [els.approvalList, "Approvals", "Checking what needs a decision."],
    [els.actionList, "Tasks", "Loading open team actions."],
    [els.pipelineGrid, "Pipeline", "Loading opportunities by stage."],
    [els.calendarGrid, "Calendar", "Building the team calendar."],
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
  if (els.approvalCount) els.approvalCount.textContent = "0 pending";
  if (els.dailyPriority) {
    els.dailyPriority.innerHTML = `<div><p class="eyebrow">Your next move</p><strong>Shared data unavailable</strong><span>Reconnect Notion to restore your daily focus.</span></div>`;
  }
  els.rows.innerHTML = `
    <div class="empty-state client-roster-empty">
      <p class="eyebrow">Shared data unavailable</p>
      <h2>Connect Notion to use the team portal</h2>
      <p>${escapeHtml(state.portalError || "The portal could not reach the shared Kijiji operating system.")}</p>
    </div>
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
    [els.clientHealthStrip, "No client data", "Client health will appear here when the shared dashboard loads."],
    [els.approvalList, "No approval data", "Approval items will appear here when the shared dashboard loads."],
    [els.actionList, "No actions available", "Task editing will unlock once the shared Actions database is reachable."],
    [els.pipelineGrid, "No pipeline available", "Opportunity stages will unlock once the shared Opportunities database is reachable."],
    [els.calendarGrid, "No calendar available", "The calendar will return once the shared Events database is reachable."],
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
  renderClientHealthStrip();
  renderWorkSummary();
  renderApprovals();
  renderFocusLists();
  renderRows();
  renderDetail();
  renderActions();
  renderPipeline();
  renderCalendar();
  renderDocuments();
  renderActionClientOptions();
  renderClientOptions(els.documentClientSelect);
};

const renderNotifications = () => {
  if (!els.notificationList || !els.notificationCount) return;
  const unread = state.notifications.filter((item) => !item.read_at).length;
  els.notificationCount.textContent = unread > 99 ? "99+" : String(unread);
  els.notificationCount.hidden = unread === 0;

  if (!state.notifications.length) {
    renderEmptyList(els.notificationList, "All caught up", "Partner updates will appear here.");
    return;
  }

  els.notificationList.innerHTML = state.notifications.map((item) => `
    <a class="notification-item${item.read_at ? "" : " is-unread"}" href="${escapeHtml(item.portal_url || "#my-work")}" data-notification-id="${escapeHtml(item.id)}">
      <span class="notification-dot" aria-hidden="true"></span>
      <span class="notification-copy">
        <strong>${escapeHtml(item.actor_name)} ${escapeHtml(item.operation)} ${escapeHtml(item.resource_type.toLowerCase())}</strong>
        <span>${escapeHtml(item.resource_title)}</span>
        <small>${escapeHtml(item.summary || "Open the dashboard for details.")} · ${escapeHtml(formatNotificationTime(item.created_at))}</small>
      </span>
    </a>
  `).join("");
};

const tourSteps = [
  {
    eyebrow: "Welcome",
    title: "Learn the dashboard in two minutes",
    description: "This quick tour shows where work lives and how the team hands it off.",
    selector: ".portal-topbar",
    hash: "my-work",
  },
  {
    eyebrow: "Today",
    title: "Start with your operating lane",
    description: "Today collects your assigned tasks, deals, upcoming dates, and blockers so you know what needs attention first.",
    selector: "[data-my-work-title]",
    hash: "my-work",
  },
  {
    eyebrow: "Clients",
    title: "Keep the client truth in one place",
    description: "Use Clients to review health, ownership, progress, next moves, and the full roadmap for each relationship.",
    selector: "#clients-title",
    hash: "clients",
  },
  {
    eyebrow: "Work",
    title: "Move tasks and opportunities forward",
    description: "Work combines approvals, the team task queue, and deals by stage. Open any card to update it or hand it to another partner.",
    selector: "#work-title",
    hash: "work",
  },
  {
    eyebrow: "Calendar",
    title: "Plan launches and important dates",
    description: "Switch between month and week views, see countdowns, and keep releases, meetings, and milestones visible.",
    selector: "#calendar-title",
    hash: "calendar",
  },
  {
    eyebrow: "Documents",
    title: "Find shared files quickly",
    description: "Contracts, templates, briefs, and brand assets live in the Document Library and can be filtered by category.",
    selector: "#documents-title",
    hash: "documents",
  },
  {
    eyebrow: "Create and hand off",
    title: "Add work from anywhere",
    description: "Use + New to create a task, deal, event, or client. Assigning an owner makes the handoff clear to the team.",
    selector: ".create-menu",
    hash: "my-work",
  },
  {
    eyebrow: "Stay aligned",
    title: "Partner updates come to you",
    description: "The notification bell shows changes made by other partners. You can restart this tour anytime from More → Take Dashboard Tour.",
    selector: ".notification-trigger",
    hash: "my-work",
  },
];

const getTourStorageKey = () => `kijiji-dashboard-tour-v1:${state.teamUser?.email || "team"}`;

const setTourComplete = () => {
  try {
    window.localStorage.setItem(getTourStorageKey(), "complete");
  } catch {
    // The tour still works when storage is unavailable; it simply cannot remember completion.
  }
};

const clearTourHighlight = () => {
  document.querySelector(".tour-highlight")?.classList.remove("tour-highlight");
};

const renderTourStep = () => {
  const step = tourSteps[tourIndex];
  if (!step || !els.tourOverlay) return;
  clearTourHighlight();
  window.location.hash = step.hash;
  els.tourProgress.textContent = `${tourIndex + 1} of ${tourSteps.length}`;
  els.tourEyebrow.textContent = step.eyebrow;
  els.tourTitle.textContent = step.title;
  els.tourDescription.textContent = step.description;
  els.tourBack.hidden = tourIndex === 0;
  els.tourNext.textContent = tourIndex === tourSteps.length - 1 ? "Finish" : tourIndex === 0 ? "Start tour" : "Next";

  window.requestAnimationFrame(() => {
    const target = document.querySelector(step.selector);
    if (target && !target.closest("[hidden]")) {
      target.classList.add("tour-highlight");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
};

const closeTour = ({ completed = true } = {}) => {
  if (!els.tourOverlay) return;
  if (completed) setTourComplete();
  clearTourHighlight();
  els.tourOverlay.hidden = true;
  document.body.classList.remove("tour-open");
  tourReturnFocus?.focus?.();
};

const startTour = (trigger = null) => {
  if (!els.tourOverlay || els.dashboard.hidden) return;
  tourReturnFocus = trigger || document.activeElement;
  tourIndex = 0;
  els.tourOverlay.hidden = false;
  document.body.classList.add("tour-open");
  renderTourStep();
  els.tourNext.focus();
};

const maybeStartTour = () => {
  if (!state.teamUser?.email || !els.tourOverlay) return;
  if (!els.tourOverlay.hidden) return;
  let completed = false;
  try {
    completed = window.localStorage.getItem(getTourStorageKey()) === "complete";
  } catch {
    completed = false;
  }
  if (!completed) window.setTimeout(() => startTour(), 450);
};

const loadNotifications = async () => {
  if (!state.authSession?.access_token) return;
  try {
    const response = await fetch(notificationsEndpoint, { headers: getRequestHeaders(), cache: "no-store" });
    const data = await parseJsonResponse(response);
    state.notifications = response.ok && Array.isArray(data.notifications) ? data.notifications : [];
  } catch {
    state.notifications = [];
  }
  renderNotifications();
};

const markNotificationsRead = async (id = "") => {
  try {
    const response = await fetch(notificationsEndpoint, {
      method: "PATCH",
      headers: getRequestHeaders(),
      body: JSON.stringify(id ? { id } : {}),
    });
    if (!response.ok) return;
    const readAt = new Date().toISOString();
    state.notifications = state.notifications.map((item) => (!id || item.id === id ? { ...item, read_at: readAt } : item));
    renderNotifications();
  } catch {
    // Notification availability should never interrupt dashboard navigation.
  }
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
    const data = await parseJsonResponse(response);

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
    try {
      const documentsResponse = await fetch(documentsEndpoint, { headers: getRequestHeaders() });
      const documentsData = await parseJsonResponse(documentsResponse);
      state.documents = documentsResponse.ok && Array.isArray(documentsData.documents) ? documentsData.documents : [];
    } catch {
      state.documents = [];
    }
    state.selectedClientId = state.selectedClientId || state.clients[0]?.id || "";
    state.isLoading = false;
    setSourceBadge("ready", state.teamUser?.fullName ? `${state.teamUser.fullName} / Notion synced` : "Synced with Notion");
    setAccessMessage("");
    showDashboard();
    renderPortal();
    await loadNotifications();
    maybeStartTour();
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
  window.requestAnimationFrame(() => {
    const primaryField = dialog.querySelector("input:not([type='hidden']):not(:disabled), select:not(:disabled), textarea:not(:disabled)");
    (primaryField || dialog.querySelector("button:not(:disabled)"))?.focus();
  });
};

const setFormError = (form, message = "") => {
  if (!form) return;
  let feedback = form.querySelector("[data-form-feedback]");
  if (!feedback) {
    feedback = document.createElement("p");
    feedback.className = "access-message form-feedback";
    feedback.dataset.formFeedback = "";
    feedback.setAttribute("role", "alert");
    feedback.tabIndex = -1;
    form.querySelector(".dialog-actions")?.before(feedback);
  }
  feedback.textContent = message;
  feedback.hidden = !message;
  if (message) feedback.focus();
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
  setFormError(els.clientForm);
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

const openActionForm = (action = null, clientId = "") => {
  els.actionForm.reset();
  setFormError(els.actionForm);
  renderClientOptions(els.actionClientSelect);
  els.actionFormTitle.textContent = action ? "Edit task" : "Add task";
  els.actionForm.elements.id.value = action?.id || "";
  els.actionForm.elements.title.value = action?.title || "";
  setSelectValue(els.actionForm.elements.status, action?.status || "Open");
  setSelectValue(els.actionForm.elements.owner, action?.owner || "Unassigned");
  setSelectValue(els.actionForm.elements.priority, action?.priority || "Normal");
  els.actionForm.elements.dueDate.value = action?.dueDate || todayISO;
  els.actionForm.elements.clientId.value = action?.clientIds?.[0] || clientId;
  setSelectValue(els.actionForm.elements.approvalOwner, action?.approvalOwner || "");
  setSelectValue(els.actionForm.elements.recurrence, action?.recurrence || "");
  els.actionForm.elements.blocker.checked = Boolean(action?.blocker);
  els.actionForm.elements.dependency.value = action?.dependency || "";
  els.actionForm.elements.notes.value = action?.notes || "";
  applyOwnerFieldPolicy(els.actionForm.elements.owner);
  openDialog(els.actionDialog);
};

const openOpportunityForm = (opportunity = null) => {
  els.opportunityForm.reset();
  setFormError(els.opportunityForm);
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

const openEventForm = (eventItem = null, clientId = "", eventDate = todayISO) => {
  els.eventForm.reset();
  setFormError(els.eventForm);
  renderClientOptions(els.eventClientSelect);
  els.eventFormTitle.textContent = eventItem ? "Edit event" : "Add event";
  els.eventForm.elements.id.value = eventItem?.id || "";
  els.eventForm.elements.name.value = eventItem?.name || "";
  setSelectValue(els.eventForm.elements.type, eventItem?.type || "Release");
  setSelectValue(els.eventForm.elements.status, eventItem?.status || "Planned");
  setSelectValue(els.eventForm.elements.owner, eventItem?.owner || "Unassigned");
  els.eventForm.elements.date.value = eventItem?.date || eventDate;
  els.eventForm.elements.clientId.value = eventItem?.clientIds?.[0] || clientId;
  els.eventForm.elements.notes.value = eventItem?.notes || "";
  applyOwnerFieldPolicy(els.eventForm.elements.owner);
  openDialog(els.eventDialog);
};

const openDocumentForm = () => {
  els.documentForm.reset();
  els.documentMessage.textContent = "";
  renderClientOptions(els.documentClientSelect);
  openDialog(els.documentDialog);
};

const saveResource = async (payload) => {
  const response = await fetch(apiEndpoint, {
    method: payload.id ? "PATCH" : "POST",
    headers: getRequestHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse(response);

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
    setFormError(els.clientForm, error.message);
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
    approvalOwner: String(formData.get("approvalOwner") || "").trim(),
    recurrence: String(formData.get("recurrence") || "").trim(),
    blocker: formData.get("blocker") === "on",
    dependency: String(formData.get("dependency") || "").trim(),
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
    setFormError(els.actionForm, error.message);
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
    setFormError(els.opportunityForm, error.message);
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
    setFormError(els.eventForm, error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Save Event";
  }
};

const handleDocumentSubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(els.documentForm);
  const file = formData.get("file");
  const submit = els.documentForm.querySelector('[type="submit"]');
  if (!(file instanceof File) || !file.size) return;
  if (file.size > 3 * 1024 * 1024) {
    els.documentMessage.textContent = "Choose a file smaller than 3 MB.";
    return;
  }
  submit.disabled = true;
  submit.textContent = "Uploading...";
  els.documentMessage.textContent = "Securely uploading to the Kijiji Notion workspace...";
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const response = await fetch(documentsEndpoint, { method: "POST", headers: getRequestHeaders(), body: JSON.stringify({ name: String(formData.get("name") || "").trim(), category: formData.get("category"), clientId: formData.get("clientId"), description: String(formData.get("description") || "").trim(), filename: file.name, contentType: file.type, base64 }) });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error(data.message || "Unable to upload the document.");
    closeDialog(els.documentDialog);
    await loadDashboard();
    window.location.hash = "documents";
  } catch (error) {
    els.documentMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "Upload File";
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

  setAccessBusy(true);
  setAccessMessage("Sending secure sign-in link...", "info");

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  let error = null;
  let data = null;

  try {
    const response = await fetch(authLinkEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        redirectTo,
      }),
    });

    data = await parseJsonResponse(response);

    if (!response.ok) {
      error = new Error(data.message || "Unable to send a sign-in link.");
    }
  } catch (fetchError) {
    error = fetchError;
  }

  setAccessBusy(false);

  if (error) {
    const message = /failed to fetch/i.test(error.message || "")
      ? "Could not reach the Kijiji sign-in service. Refresh the live portal and try again."
      : error.message || "Unable to send a sign-in link. Check Supabase Auth settings.";
    setAccessMessage(message, "error");
    els.accessInput.focus();
    return;
  }

  setAccessMessage(data?.message || "Check your inbox for the secure Kijiji sign-in link.", "info");
};

async function logoutPortal() {
  await supabaseClient?.auth?.signOut?.();
  state = {
    clients: [],
    actions: [],
    opportunities: [],
    events: [],
    documents: [],
    notifications: [],
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
  const addRoadmapTask = event.target.closest("[data-roadmap-add-task]");
  const addRoadmapMilestone = event.target.closest("[data-roadmap-add-milestone]");
  const jumpAction = event.target.closest("[data-jump-action]");
  const jumpOpportunity = event.target.closest("[data-jump-opportunity]");
  const jumpEvent = event.target.closest("[data-jump-event]");

  if (editClient) {
    const client = getClient(editClient.dataset.editClient);
    if (client) {
      openClientForm(client);
    }
  }

  if (addRoadmapTask) {
    openActionForm(null, addRoadmapTask.dataset.roadmapAddTask);
  }

  if (addRoadmapMilestone) {
    openEventForm(null, addRoadmapMilestone.dataset.roadmapAddMilestone);
    els.eventFormTitle.textContent = "Add roadmap milestone";
    setSelectValue(els.eventForm.elements.type, "Milestone");
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

[els.todayList, els.priorityList, els.blockerList, els.myWorkActionList, els.myWorkDealList, els.myWorkWatchList, els.dailyPriority, els.approvalList].forEach((target) => {
  target.addEventListener("click", (event) => {
    const createActionButton = event.target.closest("[data-open-action-form]");
    const actionCardEl = event.target.closest("[data-action-id]");
    const opportunityCardEl = event.target.closest("[data-opportunity-id]");
    const eventCardEl = event.target.closest("[data-event-id]");
    if (createActionButton && !actionCardEl) {
      openActionForm();
      return;
    }

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

els.clientHealthStrip.addEventListener("click", (event) => {
  const clientButton = event.target.closest("[data-health-client-id]");
  if (!clientButton) return;
  state.selectedClientId = clientButton.dataset.healthClientId;
  window.location.hash = "clients";
  renderRows();
  renderDetail();
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

els.calendarGrid.addEventListener("click", (event) => {
  const eventButton = event.target.closest("[data-event-id]");
  if (eventButton) {
    const eventItem = state.events.find((item) => item.id === eventButton.dataset.eventId);
    if (eventItem) openEventForm(eventItem);
    return;
  }

  const dayButton = event.target.closest("[data-calendar-date]");
  if (dayButton) {
    openEventForm(null, "", dayButton.dataset.calendarDate);
  }
});

els.calendarPrevious.addEventListener("click", () => {
  calendarCursor = calendarView === "week"
    ? addDays(calendarCursor, -7)
    : new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderCalendar();
});

els.calendarNext.addEventListener("click", () => {
  calendarCursor = calendarView === "week"
    ? addDays(calendarCursor, 7)
    : new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderCalendar();
});

els.calendarToday.addEventListener("click", () => {
  calendarCursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  renderCalendar();
});

els.calendarViewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    calendarView = button.dataset.calendarView === "week" ? "week" : "month";
    renderCalendar();
  });
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
$$("[data-open-document-form]").forEach((button) => button.addEventListener("click", openDocumentForm));
$$(".create-menu [data-open-action-form], .create-menu [data-open-client-form], .create-menu [data-open-opportunity-form], .create-menu [data-open-event-form]").forEach((button) =>
  button.addEventListener("click", () => button.closest("details")?.removeAttribute("open")),
);
$$("details").forEach((details) => details.addEventListener("toggle", () => {
  details.querySelector(":scope > summary")?.setAttribute("aria-expanded", String(details.open));
}));
$$("[data-close-action-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.actionDialog)));
$$("[data-close-client-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.clientDialog)));
$$("[data-close-opportunity-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.opportunityDialog)));
$$("[data-close-event-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.eventDialog)));
$$("[data-close-document-form]").forEach((button) => button.addEventListener("click", () => closeDialog(els.documentDialog)));
$("[data-refresh-dashboard]").addEventListener("click", () => loadDashboard());
els.logout?.addEventListener("click", logoutPortal);
els.accessForm.addEventListener("submit", handleAccessSubmit);
els.clientForm.addEventListener("submit", handleClientSubmit);
els.actionForm.addEventListener("submit", handleActionSubmit);
els.opportunityForm.addEventListener("submit", handleOpportunitySubmit);
els.eventForm.addEventListener("submit", handleEventSubmit);
els.documentForm.addEventListener("submit", handleDocumentSubmit);
els.documentSearch.addEventListener("input", renderDocuments);
els.documentCategory.addEventListener("change", renderDocuments);
els.search.addEventListener("input", renderRows);
els.statusFilter.addEventListener("change", renderRows);
els.tourTriggers.forEach((trigger) => trigger.addEventListener("click", () => {
  trigger.closest("details")?.removeAttribute("open");
  startTour(trigger);
}));
els.themeButtons.forEach((button) => button.addEventListener("click", () => {
  applyThemePreference(button.dataset.themeOption, { save: true });
}));
els.tourNext?.addEventListener("click", () => {
  if (tourIndex >= tourSteps.length - 1) {
    closeTour();
    return;
  }
  tourIndex += 1;
  renderTourStep();
});
els.tourBack?.addEventListener("click", () => {
  tourIndex = Math.max(0, tourIndex - 1);
  renderTourStep();
});
els.tourSkip?.addEventListener("click", () => closeTour());
els.tourOverlay?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeTour();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [els.tourSkip, els.tourBack, els.tourNext].filter((item) => item && !item.hidden);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
els.markNotificationsRead?.addEventListener("click", (event) => {
  event.preventDefault();
  markNotificationsRead();
});
els.notificationList?.addEventListener("click", (event) => {
  const item = event.target.closest("[data-notification-id]");
  if (item) markNotificationsRead(item.dataset.notificationId);
});
window.addEventListener("hashchange", () => setActiveView({ focusTitle: !document.body.classList.contains("tour-open") }));

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

const bootstrapAuth = async () => {
  if (!window.supabase?.createClient) {
    state.isLoading = false;
    setSourceBadge("error", "Auth unavailable");
    showAccessPanel("Supabase Auth could not load. Refresh the page, then try again.", "error");
    return;
  }

  try {
    const response = await fetch(authConfigEndpoint, { cache: "no-store" });
    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(data.message || "Supabase Auth is not configured in Vercel yet.");
    }

    supabaseClient = window.supabase.createClient(data.supabaseUrl, data.supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });

    await initializeAuth();
  } catch (error) {
    state.isLoading = false;
    setSourceBadge("error", "Auth setup issue");
    showAccessPanel(error.message || "The Kijiji sign-in service could not load. Check Supabase settings.", "error");
  }
};

bootstrapAuth();
