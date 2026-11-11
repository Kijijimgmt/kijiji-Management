const apiEndpoint = "/api/notion-clients";
const documentsEndpoint = "/api/notion-documents";
const dashboardInsightsEndpoint = "/api/notion-documents?view=insights";
const notificationsEndpoint = "/api/notifications";
const authLinkEndpoint = "/api/auth-link";
const authConfigEndpoint = "/api/auth-config";
const livePortalUrl = "https://www.kijijimgmt.com/client-portal";
const themeStorageKey = "kijiji-dashboard-theme-v2";
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
  documentFolders: $("[data-document-folders]"),
  documentBrandKit: $("[data-client-brand-kit]"),
  documentCount: $("[data-document-count]"),
  documentSearch: $("[data-search-documents]"),
  documentCategory: $("[data-document-category]"),
  documentDialog: $("[data-document-dialog]"),
  documentForm: $("[data-document-form]"),
  documentClientSelect: $("[data-document-client-select]"),
  documentMessage: $("[data-document-message]"),
  assessmentList: $("[data-assessment-list]"),
  industryBriefList: $("[data-industry-brief-list]"),
  assessmentCount: $("[data-assessment-count]"),
  briefCount: $("[data-brief-count]"),
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
  myWorkEyebrow: $("[data-my-work-eyebrow]"),
  myWorkSubtitle: $("[data-my-work-subtitle]"),
  myWorkTasksMetric: $("[data-my-work-tasks]"),
  myWorkDealsMetric: $("[data-my-work-deals]"),
  myWorkEventsMetric: $("[data-my-work-events]"),
  myWorkBlockersMetric: $("[data-my-work-blockers]"),
  userBadge: $("[data-user-badge]"),
  maxwellRolePanel: $("[data-maxwell-role-panel]"),
  search: $("[data-search-clients]"),
  statusFilter: $("[data-status-filter]"),
  clientDialog: $("[data-client-dialog]"),
  clientForm: $("[data-client-form]"),
  clientFormTitle: $("[data-form-title]"),
  actionDialog: $("[data-action-dialog]"),
  actionForm: $("[data-action-form]"),
  actionFormTitle: $("[data-action-form-title]"),
  actionClientSelect: $("[data-action-client-select]"),
  actionDocumentPicker: $("[data-action-document-picker]"),
  actionDocumentUpload: $("[data-action-document-upload]"),
  actionDocumentUploadName: $("[data-action-document-upload-name]"),
  actionDocumentMessage: $("[data-action-document-message]"),
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
  quickStart: $("[data-quick-start]"),
  quickStartDismiss: $("[data-dismiss-quick-start]"),
  quickStartTriggers: $$('[data-show-quick-start]'),
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
  submissions: [],
  industryBriefs: [],
  insightsIntegrations: {},
  notifications: [],
  retiredClientIds: [],
  selectedClientId: "",
  isLoading: true,
  portalError: "",
  authSession: null,
  teamUser: null,
  documentFolder: "all",
};

let calendarView = "month";
let calendarCursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
let tourIndex = 0;
let activeTourSteps = [];
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

  const date = new Date(`${String(value).slice(0,10)}T12:00:00`);
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

  const dueDate = new Date(`${String(value).slice(0,10)}T00:00:00`);
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
const isMaxwellUser = () => String(state.teamUser?.email || "").trim().toLowerCase() === "max@kijijimgmt.com";
const ownerKey = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "max" || text === "maxwell") return "maxwell";
  if (text === "joe") return "joe";
  if (text === "erik") return "erik";
  if (text === "emad") return "emad";
  return text;
};
const ownerMatches = (value, owner) => String(value || "").split(/[,;/&]+/).some(part => ownerKey(part) === ownerKey(owner));

const getProgressEstimate = (client) => {
  if (Number.isFinite(Number(client.progress)) && Number(client.progress) >= 0) {
    return Math.min(100, Math.max(0, Number(client.progress)));
  }

  return 0; // A relationship status is not evidence of progress.

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

  if (!actions.length && !opportunities.length && !["Paused", "Archived"].includes(client.status)) return { label: "Needs next action", tone: "warning", reason: "No actionable work is recorded for this client" };

  if (overdue === 1 || !String(client.nextAction || "").trim()) {
    return { label: "Needs Attention", tone: "warning", reason: overdue ? "One next move is overdue" : "Next move is missing" };
  }


  if (waiting) {
    return { label: "Waiting", tone: "waiting", reason: `${waiting} item${waiting === 1 ? "" : "s"} awaiting input or approval` };
  }

  const missing = actions.filter((item) => !String(item.owner || "").trim() || /^unassigned$/i.test(item.owner) || !item.dueDate).length;
  if (missing) return { label: "Setup needed", tone: "warning", reason: `${missing} open task${missing === 1 ? " needs" : "s need"} an owner or date` };
  return { label: "On Track", tone: "success", reason: "Tracked work has owners and dates, with no visible blockers or overdue work" };
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
  const isMaxwell = isMaxwellUser();
  document.body.dataset.portalRole = state.teamUser?.role || "signed-out";
  document.body.dataset.portalProfile = "shared-team";
  if (els.maxwellRolePanel) els.maxwellRolePanel.hidden = !isMaxwell;
  $$("[data-admin-only]").forEach((element) => {
    element.hidden = !isAdmin;
  });
  $$("[data-member-owner-lock]").forEach((element) => {
    element.hidden = isAdmin;
  });
  setActiveView();
};

const viewTitles = {
  "my-work": "Home",
  overview: "Team pulse",
  clients: "Clients",
  projects: "Projects",
  work: "Tasks & opportunities",
  calendar: "Calendar",
  files: "Files",
  reports: "Reports",
  decisions: "Decisions",
  "talent-bookings": "Talent Bookings",
  guidance: "Playbook",
};

const viewAliases = {
  documents: "files",
  attention: "my-work",
  actions: "work",
  opportunities: "work",
};

const setActiveView = ({ focusTitle = false } = {}) => {
  const requestedHash = window.location.hash.slice(1) || "my-work";
  const requestedView = viewAliases[requestedHash] || requestedHash;
  const isAdminView = requestedView === "overview";
  const activeView = viewTitles[requestedView] && (!isAdminView || isAdminUser()) ? requestedView : "my-work";
  if (activeView === "work") {
    const tab = requestedHash === "opportunities" ? "opportunities" : "tasks";
    const buttons = [...document.querySelectorAll('[data-work-tab]')];
    const target = buttons.find(button => button.dataset.workTab === tab);
    target?.click();
  }

  els.portalViews.forEach((view) => {
    const adminOnly = view.hasAttribute("data-admin-only");
    view.hidden = view.dataset.portalView !== activeView || (adminOnly && !isAdminUser());
  });

  els.navLinks.forEach((link) => {
    const linkView = link.getAttribute("href");
    const isActive = linkView === `#${activeView}` && requestedHash !== "opportunities" || linkView === "#opportunities" && requestedHash === "opportunities";
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
    els.workspaceTitle.textContent = activeView === "work" ? (requestedHash === "opportunities" ? "Opportunities" : "Tasks") : viewTitles[activeView];
    if (focusTitle) els.workspaceTitle.focus({ preventScroll: true });
  }

  document.title = `${viewTitles[activeView]} | Kijiji Team Portal`;

  if (activeView !== requestedHash) {
    window.history.replaceState(null, "", `#${activeView}`);
    if (requestedHash === "attention") $("#attention")?.scrollIntoView({ block: "start" });
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
    if (isProjectClient(client)) return false;
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
  els.clientsMetric.textContent = String(state.clients.filter(isActiveClient).length);
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

// Executive summaries use the records visible to the signed-in identity.
const retiredClientNames = new Set(["broshigeez", "chef andra"]);
const normalizedClientName = (value) => String(value || "").trim().toLowerCase();
const isRetiredClient = (client) => retiredClientNames.has(normalizedClientName(client?.name));
const isProjectClient = (client) => /luchador/i.test(client?.name || "");
const isActiveRecord = (client) => !isRetiredClient(client) && !["archived", "inactive"].includes(String(client.status || "").toLowerCase());
const isActiveClient = (client) => !isProjectClient(client) && isActiveRecord(client);
const isCurrentRecord = (item) => {
  const ids = item.clientIds || [];
  if (ids.length && ids.every((id) => state.retiredClientIds.includes(id))) return false;
  return !retiredClientNames.has(normalizedClientName(item.clientName));
};
const isLiveEvent = (item) => !isComplete(item) && !["cancelled", "canceled"].includes(String(item.status || "").toLowerCase());
const getDecisions = () => getOpenActions().filter(isCurrentRecord)
  .filter((item) => String(item.status || "").toLowerCase() === "needs approval")
  .filter((item) => isAdminUser() || !item.approvalOwner || ownerMatches(item.approvalOwner, state.teamUser?.owner))
  .sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate));
const getBookings = () => state.events.filter(isCurrentRecord).filter(isLiveEvent).filter((item) => {
  const isBobby = (item.clientIds || []).some((id) => /bobby outside/i.test(getClient(id)?.name || "")) || /bobby outside/i.test(item.clientName || item.name || "");
  return isBobby && /^(talent booking|guest booking)$/i.test(item.type || "");
}).filter((item) => !item.date || getDaysUntil(item.date) >= 0)
  .sort((a, b) => getDaysUntil(a.date) - getDaysUntil(b.date));
const executiveRow = (kind, item, context = "") => `<button class="executive-row" type="button" data-${kind}-id="${escapeHtml(item.id)}">
  <span class="executive-copy"><strong>${escapeHtml(item.title || item.name)}</strong><span>${escapeHtml(context || item.nextStep || item.dependency || item.notes || getClientName(item))}</span></span>
  <span class="executive-meta"><span>${escapeHtml(item.approvalOwner || item.owner || "Owner needed")}</span><small>${escapeHtml(item.status || item.stage || "Open")} · ${escapeHtml(formatDate(item.date || item.dueDate))}</small></span>
</button>`;
const fillExecutiveList = (target, items, emptyTitle, emptyText) => {
  if (items.length) target.innerHTML = items.join("");
  else renderEmptyList(target, emptyTitle, emptyText);
};
const renderMyWork = () => {
  const owner = document.querySelector('[data-home-owner]')?.value || "";
  const owns = item => !owner || (owner === "me" ? ownerMatches(item.owner, state.teamUser?.owner) : owner === "unassigned" ? !item.owner || /^unassigned$/i.test(item.owner) : ownerMatches(item.owner, owner));
  const open = getOpenActions().filter(isCurrentRecord).filter(owns);
  const decisions = getDecisions().filter(owns);
  const needsSetup = item => !item.owner || /^unassigned$/i.test(item.owner) || !item.dueDate;
  const attention = [
    ...open.filter(item => String(item.status).toLowerCase() !== "needs approval").map(item => ({kind:"action",item})),
    ...getOpenOpportunities().filter(isCurrentRecord).filter(owns).map(item => ({kind:"opportunity",item}))
  ].filter(({item}) => item.blocker || isUrgent(item) || getDaysUntil(item.dueDate) <= 0 || needsSetup(item))
    .sort((a,b) => Number(Boolean(b.item.blocker))-Number(Boolean(a.item.blocker)) || getDaysUntil(a.item.dueDate)-getDaysUntil(b.item.dueDate));
  els.myWorkEyebrow.textContent = "Daily workspace";
  els.myWorkTitle.textContent = "Your next move.";
  els.myWorkSubtitle.textContent = "Tasks, commitments, and decisions.";
  document.querySelector('[data-home-open]').textContent = open.length;
  document.querySelector('[data-home-setup]').textContent = open.filter(needsSetup).length;
  els.myWorkDealsMetric.textContent = decisions.length;
  els.myWorkTasksMetric.textContent = attention.length;
  const reason = item => item.blocker ? "Blocked" : getDaysUntil(item.dueDate)<0 ? "Overdue" : !item.owner || /^unassigned$/i.test(item.owner) ? "Owner needed" : !item.dueDate ? "Date needed" : getDaysUntil(item.dueDate) === 0 ? "Due today" : "Priority";
  fillExecutiveList(els.myWorkActionList, attention.slice(0,6).map(({kind,item}) => executiveRow(kind,item, `${kind === "opportunity" ? "Opportunity" : "Task"} · ${reason(item)} · ${getClientName(item)}`)), "Nothing needs attention", "Open all tasks to review planned work.");
  if (attention.length > 6) els.myWorkActionList.innerHTML += `<a class="text-action executive-more" href="#work">Review all tasks and opportunities →</a>`;
  fillExecutiveList(els.myWorkDealList, decisions.slice(0,4).map(item=>executiveRow("action",item)), "No decisions waiting", "");
  const events = [...state.events.filter(isCurrentRecord).filter(isLiveEvent).filter(item=>!/^milestone$/i.test(item.type||"")), ...(window.googleCalendar?.events() || [])]
    .filter(item => (!owner || item.source === "google" && (owner !== "unassigned") && item.clientIds?.some(id=>ownerMatches(getClient(id)?.owner, owner === "me" ? state.teamUser?.owner : owner)) || item.source !== "google" && owns(item)) && (window.googleCalendar ? window.googleCalendar.upcoming(item) : getDaysUntil(item.date)>=0))
    .sort((a,b)=>String(a.start || a.date).localeCompare(String(b.start || b.date)));
  const schedule = document.querySelector('[data-home-schedule]');
  fillExecutiveList(schedule,events.slice(0,5).map(item=>item.source === "google" ? `<button type="button" class="executive-row" data-google-event-id="${escapeHtml(item.id)}"><span class="executive-copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.clientName)} · Google Calendar</span></span><span class="executive-meta">${escapeHtml(window.googleCalendar.when(item))}</span></button>` : executiveRow("event",item,getClientName(item))),"No upcoming commitments","Open Calendar to review the schedule.");
  const calendarStatus = document.querySelector('[data-home-calendar-status]');
  if(calendarStatus) calendarStatus.textContent = window.googleCalendar?.summary?.() || "Checking Google Calendar…";
  els.myWorkEventsMetric.textContent = events.length;
  els.myWorkBlockersMetric.textContent = open.filter(item=>item.blocker).length;
  const clients = state.clients.filter(isActiveClient);
  document.querySelector('[data-home-clients]').innerHTML = clients.map(client=>`<button type="button" class="home-client-link" data-health-client-id="${escapeHtml(client.id)}"><span class="home-avatar">${escapeHtml(client.name.split(" ").map(word=>word[0]).slice(0,2).join(""))}</span><span><strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(getClientHealth(client).label)}</small></span><span aria-hidden="true">→</span></button>`).join("");
  const milestone = state.events.filter(item=>isCurrentRecord(item) && isLiveEvent(item) && /^milestone$/i.test(item.type||"")).sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999"))[0];
  document.querySelector('[data-home-milestone]').innerHTML = milestone ? `<h3 id="home-milestone-title">${escapeHtml(String(milestone.name).replace(/^\d+[.\s]+/,""))}</h3><p>${escapeHtml(getClientName(milestone))}</p><small>${milestone.date ? formatDate(milestone.date) : "Date needed"}</small><button type="button" class="text-action" data-home-milestone-client="${escapeHtml(milestone.clientIds?.[0] || "")}">Open roadmap →</button>` : '<h3 id="home-milestone-title">No milestone set</h3><a href="#clients" class="text-action">Open a client roadmap →</a>';
  fillExecutiveList(document.querySelector('[data-booking-list]'),getBookings().map(item=>executiveRow("event",item)),"No guest bookings yet", "Bobby Outside Show guests appear here.");
};

const renderClientHealthStrip = () => {
  const toneRank = { danger: 0, warning: 1, waiting: 2, success: 3 };
  const clients = state.clients
    .filter(isActiveClient)
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
  const approvals = getDecisions();

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

const getActionDocuments = (action) => (action.documentIds || [])
  .map((id) => state.documents.find((document) => document.id === id))
  .filter(Boolean);

const renderActionAttachments = (action) => {
  const files = getActionDocuments(action);
  if (!files.length) return "";
  return `<div class="task-attachments" aria-label="Attached files">
    ${files.map((file) => `<a href="${escapeHtml(file.fileUrl || file.notionUrl)}" target="_blank" rel="noreferrer" data-task-file-link title="Open ${escapeHtml(file.name)}">📎 ${escapeHtml(file.name)}</a>`).join("")}
  </div>`;
};

const actionCard = (action) => `
  <article class="action-item editable-card compact-task-row" data-action-id="${escapeHtml(action.id)}" aria-label="Task: ${escapeHtml(action.title)}">
    <button class="task-title-button" type="button" aria-label="Edit task: ${escapeHtml(action.title)}"><strong>${escapeHtml(action.title)}</strong><span>${escapeHtml(getClientName(action))}</span></button>
    <span class="task-owner">${escapeHtml(action.owner && !/^unassigned$/i.test(action.owner) ? action.owner : "Owner needed")}</span>
    <span class="status-pill">${escapeHtml(action.blocker ? "Blocked" : action.status || "Open")}</span>
    <span class="date-chip" data-tone="${getDaysUntil(action.dueDate) < 0 ? "danger" : ""}">${action.dueDate ? formatDate(action.dueDate) : "Date needed"}</span>
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
    ${(isAdminUser() || ownerMatches(opportunity.owner, state.teamUser?.owner)) ? `<button class="task-row-delete" type="button" data-delete-lead="${escapeHtml(opportunity.id)}">Delete lead</button>` : ""}
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
            ${window.artistRosterPortrait?.(client) || ""}
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
            <strong>${escapeHtml(getClientNextStep(client))}</strong>
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
          <span class="client-card-open" aria-hidden="true">Open client profile <b>→</b></span>
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
        <strong>${escapeHtml(getClientNextStep(client))}</strong>
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
        <strong>${escapeHtml(getClientNextStep(client))}</strong>
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
  window.renderArtistWorkspace?.(client, els.detail);
};

const renderActions = () => {
  const queueFilter = document.querySelector('[data-task-queue-filter]')?.value || "open";
  const queueOwner = document.querySelector('[data-task-queue-owner]')?.value || "";
  const sorted = [...getOpenActions()].filter(item => !queueOwner || (queueOwner === "me" ? ownerMatches(item.owner,state.teamUser?.owner) : queueOwner === "unassigned" ? !item.owner || /^unassigned$/i.test(item.owner) : ownerMatches(item.owner,queueOwner))).filter(item => queueFilter === "setup" ? !item.owner || /^unassigned$/i.test(item.owner) || !item.dueDate : queueFilter === "overdue" ? getDaysUntil(item.dueDate) < 0 : queueFilter === "mine" ? ownerMatches(item.owner, state.teamUser?.owner) : true).sort((a, b) => {
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
  window.googleCalendar?.controls();
  const allEvents = [...state.events.filter(isCurrentRecord).filter(isLiveEvent), ...(window.googleCalendar?.events() || [])].filter(event=>!window.googleCalendar || window.googleCalendar.matches(event));
  const upcomingAll = allEvents
    .filter((event) => window.googleCalendar ? window.googleCalendar.upcoming(event) : getDaysUntil(event.date) >= 0)
    .sort((a, b) => getDaysUntil(a.date) - getDaysUntil(b.date));
  const upcoming = upcomingAll.slice(0, 10);

  const firstDate = calendarView === "week"
    ? startOfWeek(calendarCursor)
    : startOfWeek(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1));
  const dayCount = calendarView === "week" ? 7 : 42;
  const dates = Array.from({ length: dayCount }, (_, index) => addDays(firstDate, index));
  const currentMonth = calendarCursor.getMonth();
  const eventsByDate = new Map();

  dates.forEach(date=>{
    const key=toLocalISODate(date);
    eventsByDate.set(key,allEvents.filter(event=>window.googleCalendar?window.googleCalendar.occurs(event,key):String(event.date).slice(0,10)===key));
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
                  <button class="calendar-event-pill${event.source==='google'?' google-event-pill':''}" type="button" ${event.source==='google'?`data-google-event-id="${escapeHtml(event.id)}" style="--client-color:${escapeHtml(event.color)}"`:`data-event-id="${escapeHtml(event.id)}"`} title="${escapeHtml(event.name)} - ${escapeHtml(formatCountdown(event.date))}" aria-label="Open ${escapeHtml(event.name)}">
                    <span>${escapeHtml(event.name)}</span>
                    <small>${escapeHtml(getClientName(event))}${event.source==='google'?' · Google · Read only':''}</small>
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
    renderEmptyList(els.calendarList, "No upcoming dates", "Events and release dates will appear here once they are added in Notion.");
    return;
  }

  els.calendarList.innerHTML = upcoming.map(event=>event.source==='google'?window.googleCalendar.card(event):eventCard(event)).join("");
};

const renderDocuments = () => {
  if (!els.documentList) return;
  const query = String(els.documentSearch?.value || "").trim().toLowerCase();
  const category = els.documentCategory?.value || "all";
  const folder = state.documentFolder || "all";
  const activeClients = state.clients.filter(isActiveRecord);
  const folderItems = [
    { id: "all", name: "All Files", count: state.documents.length },
    { id: "shared", name: "Shared Resources", count: state.documents.filter((item) => !item.clientIds?.length).length },
    ...activeClients.map((client) => ({
      id: client.id,
      name: client.name,
      count: state.documents.filter((item) => item.clientIds?.includes(client.id)).length,
    })),
  ];
  if (els.documentFolders) {
    els.documentFolders.innerHTML = folderItems.map((item) => `<button type="button" class="document-folder${folder === item.id ? " is-active" : ""}" data-document-folder="${escapeHtml(item.id)}" aria-pressed="${folder === item.id}">
      <span><strong>${escapeHtml(item.name)}</strong><small>${state.documentsLoaded ? `${item.count} ${item.count === 1 ? "file" : "files"}` : "Not loaded"}</small></span>
    </button>`).join("");
  }
  if (state.documentsError && !state.documentsLoaded) { els.documentBrandKit.hidden = true; } else renderClientBrandKit(folder);
  const documents = state.documents.filter((document) => {
    const matchesCategory = category === "all" || document.category === category;
    const matchesFolder = folder === "all" || (folder === "shared" ? !document.clientIds?.length : document.clientIds?.includes(folder));
    const clientName = document.clientIds?.length ? getClient(document.clientIds[0])?.name || "" : "Shared Resources";
    const haystack = `${document.name} ${document.description} ${document.owner} ${document.category} ${clientName}`.toLowerCase();
    return matchesCategory && matchesFolder && (!query || haystack.includes(query));
  });
  els.documentCount.textContent = state.documentsError && !state.documentsLoaded ? "File count unavailable" : `${documents.length} ${documents.length === 1 ? "file" : "files"}${state.documentsError ? " · saved view" : ""}`;
  let notice = document.querySelector('[data-files-status]');
  if (!notice) { notice = document.createElement('div'); notice.dataset.filesStatus = ''; notice.className = 'files-status'; notice.setAttribute('role','status'); els.documentList.before(notice); }
  notice.innerHTML = state.documentsError ? `<p><strong>${state.documentsLoaded ? "Showing the last loaded files." : "Files could not be loaded."}</strong> ${escapeHtml(state.documentsMessage || "Try loading again.")}</p><button type="button" class="button button-secondary" data-retry-files>Retry files</button>` : "";
  if (!documents.length) {
    if (state.documentsError && !state.documentsLoaded) els.documentList.innerHTML = "";
    else renderEmptyList(els.documentList, "No files found", state.documents.length ? "Try another search or category." : "Upload the first contract, template, or team resource.");
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

const getLatestClientDocument = (clientId, category) => [...state.documents]
  .filter((document) => document.clientIds?.includes(clientId) && document.category === category)
  .sort((a, b) => String(b.updatedAt || b.uploadedAt || "").localeCompare(String(a.updatedAt || a.uploadedAt || "")))[0];

const renderClientBrandKit = (folder) => {
  if (!els.documentBrandKit) return;
  const client = getClient(folder);
  if (!client) {
    els.documentBrandKit.hidden = true;
    els.documentBrandKit.innerHTML = "";
    return;
  }
  const logo = getLatestClientDocument(client.id, "Logo");
  const guide = getLatestClientDocument(client.id, "Brand Guide");
  const slot = (category, document, description) => {
    const fileUrl = document?.fileUrl || document?.notionUrl || "";
    const preview = category === "Logo" && document?.fileUrl
      ? `<img src="${escapeHtml(document.fileUrl)}" alt="${escapeHtml(client.name)} logo" loading="lazy" />`
      : `<span aria-hidden="true">${category === "Logo" ? "LOGO" : "PDF"}</span>`;
    return `<article class="brand-kit-slot${document ? " has-file" : ""}">
      <div class="brand-kit-preview">${preview}</div>
      <div class="brand-kit-copy"><span>${escapeHtml(category)}</span><strong>${escapeHtml(document?.name || `${category} needed`)}</strong><p>${escapeHtml(document?.description || description)}</p></div>
      <div class="brand-kit-actions">
        ${fileUrl ? `<a class="button button-secondary" href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer">Open</a>` : ""}
        <button class="text-action" type="button" data-brand-upload data-client-id="${escapeHtml(client.id)}" data-category="${escapeHtml(category)}">${document ? "Replace" : "Add"} ${escapeHtml(category)}</button>
      </div>
    </article>`;
  };
  els.documentBrandKit.hidden = false;
  els.documentBrandKit.innerHTML = `<header><div><p class="eyebrow">${escapeHtml(client.name)}</p><h3>Brand essentials</h3></div><p>Keep the approved logo and current brand guide easy for the whole team to find.</p></header><div class="brand-kit-grid">${slot("Logo", logo, "Upload the approved PNG or JPG logo.")}${slot("Brand Guide", guide, "Upload the current PDF brand standards.")}</div>`;
};

const renderHomeIndustry = () => {
  const target = document.querySelector('[data-home-industry]');
  if (!target) return;
  const brief = [...state.industryBriefs].sort((a,b) => String(b.issueDate || '').localeCompare(String(a.issueDate || '')))[0];
  if (!brief) {
    const integration = state.insightsIntegrations?.industryBriefs || {};
    target.innerHTML = `<p class="home-news-state">${integration.error ? 'Industry updates are unavailable. Open Reports to check the feed.' : 'No industry brief has been saved yet. The latest update will appear here when available.'}</p>`;
    return;
  }
  let reportUrl = '';
  try { const url = new URL(brief.reportUrl || brief.notionUrl); if (url.protocol === 'https:') reportUrl = url.href; } catch {}
  target.innerHTML = `<article class="home-news-brief"><p class="eyebrow">Latest saved brief · ${escapeHtml(formatDate(String(brief.issueDate || '').slice(0,10)))}</p><h4>${escapeHtml(brief.title || 'Kijiji Music Industry Brief')}</h4><p>${escapeHtml(brief.summary || 'Open the full report for the latest industry updates.')}</p>${brief.keyMoves ? `<details><summary>Key moves</summary><p>${escapeHtml(brief.keyMoves)}</p></details>` : ''}<a class="text-action" href="${escapeHtml(reportUrl || '#reports')}" ${reportUrl ? 'target="_blank" rel="noopener noreferrer"' : ''}>Open full report →</a></article>`;
};

const renderReports = () => {
  renderHomeIndustry();
  if (!els.assessmentList || !els.industryBriefList) return;
  els.assessmentCount.textContent = String(state.submissions.length);
  els.briefCount.textContent = String(state.industryBriefs.length);

  if (!state.submissions.length) {
    const integration = state.insightsIntegrations?.jotform || {};
    renderEmptyList(
      els.assessmentList,
      integration.configured ? "No assessments yet" : "Connect Jotform",
      integration.error || (integration.configured
        ? "New client assessment responses will appear here automatically."
        : "Add the secure Jotform API key in Vercel to sync assessment answers."),
    );
  } else {
    els.assessmentList.innerHTML = state.submissions.map((submission) => `<article class="assessment-card">
      <header><div><span>Submitted ${escapeHtml(formatDate(String(submission.submittedAt || "").slice(0, 10)))}</span><h4>${escapeHtml(submission.artistName)}</h4></div><span class="report-status">New intake</span></header>
      ${submission.priority ? `<p><strong>90-day priority</strong>${escapeHtml(submission.priority)}</p>` : ""}
      ${submission.obstacle ? `<p><strong>Biggest obstacle</strong>${escapeHtml(submission.obstacle)}</p>` : ""}
      ${submission.helpAreas ? `<p><strong>Help needed</strong>${escapeHtml(submission.helpAreas)}</p>` : ""}
      <details><summary>View all answers</summary><dl>${submission.answers.map((answer) => `<div><dt>${escapeHtml(answer.question)}</dt><dd>${escapeHtml(answer.answer)}</dd></div>`).join("")}</dl></details>
      <button class="button button-primary" type="button" data-build-strategy="${escapeHtml(submission.id)}">Build / open client strategy</button>
    </article>`).join("");
  }

  if (!state.industryBriefs.length) {
    const integration = state.insightsIntegrations?.industryBriefs || {};
    renderEmptyList(
      els.industryBriefList,
      integration.error ? "Brief feed needs access" : "First brief is pending",
      integration.error || "The next scheduled Kijiji Music Industry Brief will appear here after it is saved to the shared report library.",
    );
  } else {
    els.industryBriefList.innerHTML = state.industryBriefs.map((brief) => `<article class="industry-brief-card">
      <header><div><span>${escapeHtml(formatDate(String(brief.issueDate || "").slice(0, 10)))}</span><h4>${escapeHtml(brief.title)}</h4></div><span class="report-status">${escapeHtml(brief.status)}</span></header>
      <p>${escapeHtml(brief.summary || "Weekly music-industry intelligence for the Kijiji team.")}</p>
      ${brief.keyMoves ? `<div><strong>Key moves</strong><span>${escapeHtml(brief.keyMoves)}</span></div>` : ""}
      ${brief.watchlist ? `<div><strong>Watchlist</strong><span>${escapeHtml(brief.watchlist)}</span></div>` : ""}
      <a class="text-action" href="${escapeHtml(brief.reportUrl || brief.notionUrl)}" target="_blank" rel="noreferrer">Open full brief →</a>
    </article>`).join("");
  }
};

const renderClientOptions = (selectEl) => {
  if (!selectEl) {
    return;
  }

  selectEl.innerHTML = `<option value="">No client relation</option>${state.clients.filter(isActiveRecord)
    .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`)
    .join("")}`;
};

const renderActionClientOptions = () => renderClientOptions(els.actionClientSelect);

const setLoadingState = () => {
  document.querySelector("[data-home-industry]").innerHTML = '<p class="home-news-state">Loading the latest industry brief…</p>';
  ["[data-booking-snapshot]", "[data-booking-list]", "[data-recent-files]"].forEach((selector) => renderEmptyList($(selector), "Loading shared data", "Syncing with Notion…"));

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
    [els.assessmentList, "Assessments", "Checking for new Jotform responses."],
    [els.industryBriefList, "Industry briefs", "Loading the latest weekly report."],
  ].forEach(([target, title, text]) => {
    if (target) {
      renderEmptyList(target, title, text);
    }
  });
};

const setErrorState = () => {
  document.querySelector("[data-home-industry]").innerHTML = '<p class="home-news-state">Industry updates unavailable. Refresh to try again.</p>';
  ["[data-booking-snapshot]", "[data-booking-list]", "[data-recent-files]"].forEach((selector) => renderEmptyList($(selector), "Shared data unavailable", "Refresh to try again."));

  setSourceBadge("error", "Notion setup needed");
  els.clientsMetric.textContent = "—";
  els.todayMetric.textContent = "—";
  els.overdueMetric.textContent = "—";
  els.blockersMetric.textContent = "—";
  els.myWorkTasksMetric.textContent = "—";
  els.myWorkDealsMetric.textContent = "—";
  els.myWorkEventsMetric.textContent = "—";
  els.myWorkBlockersMetric.textContent = "—";
  if (els.approvalCount) els.approvalCount.textContent = "Unavailable";
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
    [els.assessmentList, "Assessments unavailable", "Refresh to try loading Jotform responses again."],
    [els.industryBriefList, "Briefs unavailable", "Refresh to try loading the weekly brief again."],
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
  renderProjects();
  renderTeamCheckins();
  renderActions();
  renderPipeline();
  renderCalendar();
  renderDocuments();
  renderReports();
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
        <strong>${escapeHtml(item.actor_name)} ${escapeHtml(String(item.operation || "").startsWith("reminder-") ? "reminder for" : item.operation)} ${escapeHtml(item.resource_type.toLowerCase())}</strong>
        <span>${escapeHtml(item.resource_title)}</span>
        <small>${escapeHtml(item.summary || "Open the dashboard for details.")} · ${escapeHtml(formatNotificationTime(item.created_at))}</small>
      </span>
    </a>
  `).join("");
};

const tourSteps = [
  {
    "eyebrow": "Welcome",
    "title": "Welcome to your Kijiji workspace",
    "description": "This dashboard keeps clients, assignments, decisions, dates, documents, and team updates together. Your sign-in controls what you can edit. The top badge confirms Notion access; Files and Calendar show their own loading and sync status.",
    "selector": ".portal-topbar",
    "hash": "my-work"
  },
  {
    "eyebrow": "Today",
    "title": "Start with your daily priorities",
    "description": "Open task, missing-owner/date, and decision counts link to the matching records. My work filters your daily focus.",
    "selector": ".home-stats",
    "hash": "my-work"
  },
  {
    "eyebrow": "Needs Attention",
    "title": "Unblock the next move",
    "description": "Start here for blocked, overdue, due-today, or high-priority work. Each row names an owner. Open an item, update its next step or status, and keep the context clear enough for another partner to understand.",
    "selector": "#attention",
    "hash": "my-work"
  },
  {
    "eyebrow": "Decisions",
    "title": "Make the call and record it",
    "description": "Tasks marked Needs Approval appear here. Open a task, read the context, and update its status and notes after the decision. Choose an approver when a task needs a specific person’s review.",
    "selector": "#decisions",
    "hash": "decisions"
  },
  {
    "eyebrow": "Clients",
    "title": "Open the full client picture",
    "description": "Select an artist to open their profile. Use the tabs for tasks, events and ticket sales, social snapshots, and files. Ticket and social numbers are manual entries until accounts are connected. Use Roadmap for goals and milestones; Overview shows existing next actions.",
    "selector": "#clients",
    "hash": "clients"
  },
  {
    eyebrow: "Artist overview", title: "Start with the artist's actual position",
    description: "Overview holds the bio, official links, current priority, and work totals. Expand Edit bio, photo & official links to update the profile. Open Roadmap for milestones. More client details holds administrative fields.",
    selector: "[data-client-detail]", hash: "clients", artistTab: 0
  },
  {
    eyebrow: "Artist tasks", title: "Turn the next move into an assignment",
    description: "Tasks shows work linked to this artist. Add task sets the client for you. Open an existing task to update its owner, due date, status, notes, or attached contract, within your access permissions.",
    selector: "[data-client-detail]", hash: "clients", artistTab: 1
  },
  {
    eyebrow: "Events & tickets", title: "Track events and dated sales updates",
    description: "Add an event first, then Record a sales update for that event. Enter cumulative tickets sold, optional capacity and revenue, currency, and the as-of date. These are manual snapshots, not automatic ticket-provider data. Sales history keeps earlier entries.",
    selector: "[data-client-detail]", hash: "clients", artistTab: 2
  },
  {
    eyebrow: "Socials", title: "Record what the platforms actually show",
    description: "Add social metrics with the platform, date, source and measurement period. Enter only numbers you know; blank means not entered, not zero. These snapshots do not connect or publish to social accounts.",
    selector: "[data-client-detail]", hash: "clients", artistTab: 3
  },
  {
    eyebrow: "Artist files", title: "Find the artist's source materials",
    description: "Files lists this artist's linked assets. Open client folder takes you to their folder in the shared library for logos, brand guides, contracts and campaign files.",
    selector: "[data-client-detail]", hash: "clients", artistTab: 4
  },
  { eyebrow: "Roadmap", title: "Connect outcomes to existing tasks", description: "Roadmap holds goals and milestones. The actions underneath are the same shared tasks shown in Tasks and Home. Link a task to a milestone in the task editor.", selector: "[data-client-detail]", hash: "clients", artistTab: 5 },
  { eyebrow: "Meetings", title: "Keep the client conversation together", description: "Find meeting links and shared recaps in the client's Meetings tab. Keep follow-up work in Tasks, with an owner and date.", selector: "[data-client-detail]", hash: "clients", artistTab: 6 },
  {
    "eyebrow": "Talent Bookings",
    "title": "Track Bobby Outside Show guests",
    "description": "This section is currently for Bobby Outside Show guests, not bookings for every client. Choose Add booking, enter the guest, assign an owner, and set a date. Use Confirmed only once the guest has agreed; link the booking to Bobby Outside.",
    "selector": "#talent-bookings",
    "hash": "talent-bookings"
  },
  {
    "eyebrow": "Calendar",
    "title": "Protect the important dates",
    "description": "Keep internal Kijiji dates and connected client Google schedules together. Filter by client or event source and choose a display time zone. Existing Google events open for viewing. Use Add to client Google Calendar to create an event when Max has enabled that calendar and the client has granted editing access. Check the visible last-sync status, use Sync Google now, or open Calendar settings to reconnect. Max connects and maps calendars; authorized partners can view and sync them.",
    "selector": "#calendar",
    "hash": "calendar"
  },
  {
    "eyebrow": "Files",
    "title": "Keep every client file organized",
    "description": "Select a client folder to manage its approved logo, current brand guide, contracts, briefs, and other assets. Reusable resources stay shared across the team.",
    "selector": "#files",
    "hash": "files"
  },
  {
    "eyebrow": "Add a Task",
    "title": "Connect the work to the contract",
    "description": "Use + New → Task, then add a clear next step, owner, due date, and client. In the same form you can choose an existing file or upload a new contract so the document stays attached to the assignment.",
    "selector": ".create-menu",
    "hash": "my-work"
  },
  {
    "eyebrow": "Team Work",
    "title": "Update or remove a task",
    "description": "Open More → Tasks to see tasks and deals. Select a task to edit it, mark it Done when finished, or choose Delete Task if it is no longer needed. Deletion asks for confirmation and moves the task to Notion trash; normal ownership permissions still apply.",
    "selector": "#work-title",
    "hash": "work"
  },
  {
    "eyebrow": "Reports",
    "title": "Review intake and industry intelligence",
    "description": "Jotform assessment responses and the Kijiji Music Industry Brief appear here. Use Refresh Reports after a new submission or brief is added to pull in the latest information.",
    "selector": "#reports",
    "hash": "reports"
  },
  {
    eyebrow: "Client strategy", title: "Build one shared strategy from the assessment",
    description: "In Reports, choose Build / open client strategy beneath a Jotform response and select the correct client. The first generation saves one internal draft for the team. Max approves the Current Plan. Alternatives and proposed updates stay separate; a client-facing draft comes from the approved plan and is never sent automatically. AI and shared storage must be connected first.",
    selector: "[data-assessment-list]", hash: "reports"
  },
  {
    "eyebrow": "Appearance",
    "title": "Choose the view that works for you",
    "description": "Open More and choose Light, Dark, or Auto. This preference only changes your own dashboard appearance and does not affect another partner’s layout.",
    "selector": ".nav-more",
    "hash": "my-work"
  },
  {
    "eyebrow": "Team Updates",
    "title": "Know when a partner changes something",
    "description": "The bell shows client, task, deal, event, and reminder activity from the team. Open an alert to go to the relevant area, then mark it read once you have handled it.",
    "selector": ".notification-trigger",
    "hash": "my-work"
  },
  {
    "eyebrow": "You’re Ready",
    "title": "Use the dashboard as the team’s operating truth",
    "description": "Start with Today, keep every next move assigned, attach the source documents, and update records when the work changes. You can replay this guide anytime from More → Take Dashboard Tour.",
    "selector": ".portal-nav",
    "hash": "my-work"
  }
];

const getTourStorageKey = () => `kijiji-dashboard-tour-v4:${state.teamUser?.email || "team"}`;
const getQuickStartStorageKey = () => `kijiji-dashboard-quick-start-v1:${state.teamUser?.email || "team"}`;

const setQuickStartVisible = (visible, { save = false } = {}) => {
  if (!els.quickStart) return;
  els.quickStart.hidden = !visible;
  if (save) {
    try {
      window.localStorage.setItem(getQuickStartStorageKey(), visible ? "visible" : "dismissed");
    } catch {
      // The checklist remains usable when storage is unavailable.
    }
  }
};

const applyQuickStartState = () => {
  if (!state.teamUser?.email || !els.quickStart) return;
  let dismissed = false;
  try {
    dismissed = window.localStorage.getItem(getQuickStartStorageKey()) === "dismissed";
  } catch {
    dismissed = false;
  }
  setQuickStartVisible(!dismissed);
};

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
  const step = activeTourSteps[tourIndex];
  if (!step || !els.tourOverlay) return;
  clearTourHighlight();
  window.location.hash = step.hash;
  setActiveView();
  if (step.hash === "clients") {
    document.body.classList.toggle("client-workspace-open", step.artistTab != null);
    if (step.artistTab != null) { renderDetail(); window.showArtistTourTab?.(step.artistTab); }
  }
  const more = document.querySelector(".nav-more");
  if (more) more.open = step.selector === ".nav-more";
  els.tourProgress.textContent = `${tourIndex + 1} of ${activeTourSteps.length}`;
  els.tourEyebrow.textContent = step.eyebrow;
  els.tourTitle.textContent = step.title;
  els.tourDescription.textContent = step.description;
  els.tourBack.hidden = tourIndex === 0;
  els.tourNext.textContent = tourIndex === activeTourSteps.length - 1 ? "Finish" : tourIndex === 0 ? "Start tour" : "Next";

  window.requestAnimationFrame(() => {
    if (els.tourOverlay.hidden || activeTourSteps[tourIndex] !== step) return;
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
  const focusTarget = tourReturnFocus?.checkVisibility?.() ? tourReturnFocus : els.workspaceTitle;
  focusTarget?.focus?.({ preventScroll: true });
};

const startTour = (trigger = null) => {
  if (!els.tourOverlay || els.dashboard.hidden) return;
  tourReturnFocus = trigger || document.activeElement;
  activeTourSteps = tourSteps.filter((step) => step.artistTab == null || state.clients.length > 0);
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
  if (!completed) window.setTimeout(() => {
    if (!state.isLoading && !state.portalError && els.tourOverlay.hidden) startTour();
  }, 450);
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
  window.refreshArtistWorkspace?.();
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
    const incomingClients = Array.isArray(data.clients) ? data.clients : [];
    state.retiredClientIds = incomingClients.filter(isRetiredClient).map((client) => client.id);
    state.clients = incomingClients.filter((client) => !isRetiredClient(client));
    state.actions = (Array.isArray(data.actions) ? data.actions : []).filter(isCurrentRecord);
    state.opportunities = (Array.isArray(data.opportunities) ? data.opportunities : []).filter(isCurrentRecord);
    state.events = (Array.isArray(data.events) ? data.events : []).filter(isCurrentRecord);
    const [documentsResult, insightsResult] = await Promise.allSettled([
      fetch(documentsEndpoint, { headers: getRequestHeaders() }),
      fetch(dashboardInsightsEndpoint, { headers: getRequestHeaders(), cache: "no-store" }),
    ]);
    if (documentsResult.status === "fulfilled") {
      const documentsData = await parseJsonResponse(documentsResult.value);
      state.documentsError = !documentsResult.value.ok;
      state.documentsMessage = documentsData.message || "The file library could not be refreshed.";
      if (documentsResult.value.ok && Array.isArray(documentsData.documents)) { state.documents = documentsData.documents; state.documentsLoaded = true; state.documentsUpdatedAt = new Date().toISOString(); }
    } else {
      state.documentsError = true;
      state.documentsMessage = "The file library could not be reached. Check your connection and retry.";
    }
    if (insightsResult.status === "fulfilled") {
      const insightsData = await parseJsonResponse(insightsResult.value);
      state.submissions = insightsResult.value.ok && Array.isArray(insightsData.submissions) ? insightsData.submissions : [];
      state.industryBriefs = insightsResult.value.ok && Array.isArray(insightsData.briefs) ? insightsData.briefs : [];
      state.insightsIntegrations = insightsResult.value.ok ? insightsData.integrations || {} : {};
    } else {
      state.submissions = [];
      state.industryBriefs = [];
      state.insightsIntegrations = {};
    }
    await window.loadGoogleCalendar?.(data.googleCalendar);
    state.selectedClientId = state.clients.some((client) => client.id === state.selectedClientId)
      ? state.selectedClientId
      : state.clients[0]?.id || "";
    state.isLoading = false;
    setSourceBadge("ready", state.teamUser?.fullName ? `${state.teamUser.fullName} / Notion synced` : "Synced with Notion");
    setAccessMessage("");
    showDashboard();
    renderPortal();
    applyQuickStartState();
    await loadNotifications();
    maybeStartTour();
    return true;
  } catch (error) {
    state.clients = [];
    state.actions = [];
    state.opportunities = [];
    state.events = [];
    state.documents = [];
    state.submissions = [];
    state.industryBriefs = [];
    state.insightsIntegrations = {};
    state.retiredClientIds = [];
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
  els.actionForm.querySelectorAll(".task-form-disclosure").forEach(section => { section.open = false; });
  setFormError(els.actionForm);
  renderClientOptions(els.actionClientSelect);
  els.actionFormTitle.textContent = action ? "Edit task" : "Add task";
  els.actionForm.elements.id.value = action?.id || "";
  $("[data-delete-action]").hidden = !action?.id || !(isAdminUser() || ownerMatches(action.owner, state.teamUser?.owner));
  els.actionForm.elements.title.value = action?.title || "";
  setSelectValue(els.actionForm.elements.status, action?.status || "Open");
  setSelectValue(els.actionForm.elements.owner, action?.owner || "Unassigned");
  setSelectValue(els.actionForm.elements.priority, action?.priority || "Normal");
  els.actionForm.elements.dueDate.value = action?.dueDate || "";
  els.actionForm.elements.clientId.value = action?.clientIds?.[0] || clientId;
  setSelectValue(els.actionForm.elements.approvalOwner, action?.approvalOwner || "");
  setSelectValue(els.actionForm.elements.recurrence, action?.recurrence || "");
  els.actionForm.elements.blocker.checked = Boolean(action?.blocker);
  els.actionForm.elements.dependency.value = action?.dependency || "";
  els.actionForm.elements.notes.value = String(action?.notes || "").replace(/\n?Roadmap milestone ID: [^\n]+/g, "");
  populateTaskMilestones(action?.clientIds?.[0] || clientId, String(action?.notes || "").match(/Roadmap milestone ID: ([^\n]+)/)?.[1] || "");
  els.actionDocumentUploadName.textContent = "No new file selected";
  els.actionDocumentMessage.textContent = "";
  renderActionDocumentPicker(action?.documentIds || [], action?.clientIds?.[0] || clientId);
  applyOwnerFieldPolicy(els.actionForm.elements.owner);
  openDialog(els.actionDialog);
};

const renderActionDocumentPicker = (selectedIds = [], clientId = "") => {
  if (!els.actionDocumentPicker) return;
  const selected = new Set(selectedIds);
  const sorted = [...state.documents].sort((a, b) => {
    const aClient = a.clientIds?.includes(clientId) ? 0 : 1;
    const bClient = b.clientIds?.includes(clientId) ? 0 : 1;
    return aClient - bClient || String(a.name).localeCompare(String(b.name));
  });
  if (!sorted.length) {
    els.actionDocumentPicker.innerHTML = `<span class="task-file-empty">No files uploaded yet.</span>`;
    return;
  }
  els.actionDocumentPicker.innerHTML = sorted.map((file) => {
    const client = file.clientIds?.length ? getClient(file.clientIds[0]) : null;
    return `<label><input type="checkbox" name="documentIds" value="${escapeHtml(file.id)}" ${selected.has(file.id) ? "checked" : ""} /><span><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(client?.name || "Shared Resources")} · ${escapeHtml(file.category || "File")}</small></span></label>`;
  }).join("");
};

const openOpportunityForm = (opportunity = null) => {
  els.opportunityForm.reset();
  setFormError(els.opportunityForm);
  renderClientOptions(els.opportunityClientSelect);
  els.opportunityFormTitle.textContent = opportunity ? "Edit opportunity" : "Add opportunity";
  els.opportunityForm.elements.id.value = opportunity?.id || "";
  $("[data-delete-opportunity]").hidden = !opportunity || !(isAdminUser() || ownerMatches(opportunity.owner, state.teamUser?.owner));
  els.opportunityForm.elements.name.value = opportunity?.name || "";
  setSelectValue(els.opportunityForm.elements.stage, opportunity?.stage || "New");
  setSelectValue(els.opportunityForm.elements.owner, opportunity?.owner || "Unassigned");
  setSelectValue(els.opportunityForm.elements.priority, opportunity?.priority || "Normal");
  els.opportunityForm.elements.dueDate.value = opportunity?.dueDate || "";
  els.opportunityForm.elements.clientId.value = opportunity?.clientIds?.[0] || "";
  els.opportunityForm.elements.blocker.checked = Boolean(opportunity?.blocker);
  els.opportunityForm.elements.nextStep.value = opportunity?.nextStep || "";
  applyOwnerFieldPolicy(els.opportunityForm.elements.owner);
  openDialog(els.opportunityDialog);
};

const openEventForm = (eventItem = null, clientId = "", eventDate = todayISO) => {
  if (eventItem?.source === "google" || eventItem?.readOnly) return;
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

const openDocumentForm = ({ clientId = "", category = "", suggestedName = "" } = {}) => {
  els.documentForm.reset();
  els.documentMessage.textContent = "";
  renderClientOptions(els.documentClientSelect);
  if (clientId) els.documentClientSelect.value = clientId;
  if (category) setSelectValue(els.documentForm.elements.category, category);
  if (suggestedName) els.documentForm.elements.name.value = suggestedName;
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
    notes: [String(formData.get("notes") || "").trim(), formData.get("milestoneId") ? `Roadmap milestone ID: ${formData.get("milestoneId")}` : ""].filter(Boolean).join("\n"),
    documentIds: formData.getAll("documentIds").map(String),
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

let actionMutationPending = false;
const handleActionDelete = async () => {
  const id = els.actionForm.elements.id.value;
  const action = state.actions.find((item) => item.id === id);
  if (!action || actionMutationPending) return;
  if (!window.confirm(`Delete “${action.title}”? This removes the task from the dashboard and moves it to Notion trash.`)) return;
  actionMutationPending = true;
  const button = $("[data-delete-action]");
  const submit = els.actionForm.querySelector('[type="submit"]');
  button.disabled = submit.disabled = true;
  button.textContent = "Deleting…";
  setFormError(els.actionForm);
  try {
    const response = await fetch(apiEndpoint, {
      method: "DELETE", headers: getRequestHeaders(),
      body: JSON.stringify({ resource: "action", id }),
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error(data.message || "Unable to delete the task. Try again.");
    state.actions = state.actions.filter((item) => item.id !== id);
    closeDialog(els.actionDialog);
    renderPortal();
    await loadDashboard();
  } catch (error) {
    setFormError(els.actionForm, error.message);
  } finally {
    actionMutationPending = false;
    button.disabled = submit.disabled = false;
    button.textContent = "Delete Task";
  }
};

const handleActionSubmit = async (event) => {
  event.preventDefault();
  if (actionMutationPending) return;
  actionMutationPending = true;
  $("[data-delete-action]").disabled = true;
  const formData = new FormData(els.actionForm);
  const client = getClient(String(formData.get("clientId") || ""));
  const selectedDocumentIds = formData.getAll("documentIds").map(String);
  const uploadedFile = formData.get("taskDocument");
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
    notes: [String(formData.get("notes") || "").trim(), formData.get("milestoneId") ? `Roadmap milestone ID: ${formData.get("milestoneId")}` : ""].filter(Boolean).join("\n"),
    documentIds: selectedDocumentIds,
  };
  const submit = els.actionForm.querySelector('[type="submit"]');

  submit.disabled = true;
  submit.textContent = "Saving...";

  try {
    if (uploadedFile instanceof File && uploadedFile.size) {
      if (uploadedFile.size > 3 * 1024 * 1024) {
        throw new Error("Choose a file smaller than 3 MB.");
      }
      submit.textContent = "Uploading document...";
      els.actionDocumentMessage.textContent = "Securely uploading and linking the document to this task...";
      const base64 = await fileToBase64(uploadedFile);
      const uploadResponse = await fetch(documentsEndpoint, {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify({
          name: uploadedFile.name.replace(/\.[^.]+$/, ""),
          category: "Contract",
          clientId: client?.id || "",
          description: `Attached to task: ${payload.title}`,
          filename: uploadedFile.name,
          contentType: uploadedFile.type,
          base64,
        }),
      });
      const uploadData = await parseJsonResponse(uploadResponse);
      if (!uploadResponse.ok) throw new Error(uploadData.message || "Unable to upload the document.");
      if (uploadData.document?.id) payload.documentIds.push(uploadData.document.id);
    }
    submit.textContent = "Saving task...";
    await saveResource(payload);
    closeDialog(els.actionDialog);
    await loadDashboard();
  } catch (error) {
    setFormError(els.actionForm, error.message);
  } finally {
    actionMutationPending = false;
    $("[data-delete-action]").disabled = false;
    submit.disabled = false;
    submit.textContent = "Save Task";
  }
};

const handleOpportunitySubmit = async (event) => {
  event.preventDefault();
  if (opportunityDeletePending) return;
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
    const base64 = await fileToBase64(file);
    const response = await fetch(documentsEndpoint, { method: "POST", headers: getRequestHeaders(), body: JSON.stringify({ name: String(formData.get("name") || "").trim(), category: formData.get("category"), clientId: formData.get("clientId"), description: String(formData.get("description") || "").trim(), filename: file.name, contentType: file.type, base64 }) });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error(data.message || "Unable to upload the file.");
    closeDialog(els.documentDialog);
    await loadDashboard();
    window.location.hash = "files";
  } catch (error) {
    els.documentMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "Upload File";
  }
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

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
  window.clearArtistWorkspace?.();
  window.clearGoogleCalendar?.();
  await supabaseClient?.auth?.signOut?.();
  state = {
    clients: [],
    actions: [],
    opportunities: [],
    events: [],
    documents: [], documentsLoaded: false, documentsMessage: "", documentsUpdatedAt: "",
    submissions: [],
    industryBriefs: [],
    insightsIntegrations: {},
    notifications: [],
    selectedClientId: "",
    isLoading: false,
    portalError: "",
    authSession: null,
    teamUser: null,
    documentFolder: "all",
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
  if (event.target.closest("[data-task-file-link], [data-delete-lead]")) return;
  const actionCardEl = event.target.closest("[data-action-id]");
  if (actionCardEl) {
    const action = state.actions.find((item) => item.id === actionCardEl.dataset.actionId);
    if (action) {
      openActionForm(action);
    }
  }
});

[els.todayList, els.priorityList, els.blockerList, els.myWorkActionList, els.myWorkDealList, els.myWorkWatchList, els.dailyPriority, els.approvalList, $("[data-booking-snapshot]"), $("[data-booking-list]")].forEach((target) => {
  target.addEventListener("click", (event) => {
    if (event.target.closest("[data-task-file-link], [data-delete-lead]")) return;
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
    if (event.target.closest("[data-task-file-link], [data-delete-lead]")) return;
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

els.documentFolders?.addEventListener("click", (event) => {
  const folder = event.target.closest("[data-document-folder]");
  if (!folder) return;
  state.documentFolder = folder.dataset.documentFolder || "all";
  renderDocuments();
});

els.documentBrandKit?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-brand-upload]");
  if (!button) return;
  const client = getClient(button.dataset.clientId);
  const category = button.dataset.category || "Brand Asset";
  openDocumentForm({ clientId: client?.id || "", category, suggestedName: client ? `${client.name} ${category}` : category });
});

els.actionClientSelect?.addEventListener("change", () => {
  const selectedIds = [...els.actionForm.querySelectorAll('input[name="documentIds"]:checked')].map((input) => input.value);
  renderActionDocumentPicker(selectedIds, els.actionClientSelect.value);
});

els.actionDocumentUpload?.addEventListener("change", () => {
  const file = els.actionDocumentUpload.files?.[0];
  els.actionDocumentUploadName.textContent = file ? file.name : "No new file selected";
  els.actionDocumentMessage.textContent = file && file.size > 3 * 1024 * 1024 ? "This file is larger than the 3 MB maximum." : "";
});

els.actionForm?.querySelector("[data-close-action-for-files]")?.addEventListener("click", () => closeDialog(els.actionDialog));

els.clientHealthStrip.addEventListener("click", (event) => {
  const clientButton = event.target.closest("[data-health-client-id]");
  if (!clientButton) return;
  state.selectedClientId = clientButton.dataset.healthClientId;
  window.location.hash = "clients";
  renderRows();
  renderDetail();
});

els.actionList.addEventListener("keydown", (event) => {
  if (event.target.closest("button, [data-task-file-link]")) return;
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
  if (event.target.closest("[data-delete-lead]")) return;
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
$$("[data-refresh-dashboard]").forEach((button) => button.addEventListener("click", () => loadDashboard()));
els.logout?.addEventListener("click", logoutPortal);
els.accessForm.addEventListener("submit", handleAccessSubmit);
els.clientForm.addEventListener("submit", handleClientSubmit);
els.actionForm.addEventListener("submit", handleActionSubmit);
$("[data-delete-action]").addEventListener("click", handleActionDelete);
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
els.quickStartDismiss?.addEventListener("click", () => setQuickStartVisible(false, { save: true }));
els.quickStartTriggers.forEach((trigger) => trigger.addEventListener("click", () => {
  trigger.closest("details")?.removeAttribute("open");
  window.location.hash = "my-work";
  setActiveView();
  setQuickStartVisible(true, { save: true });
  window.requestAnimationFrame(() => {
    els.quickStart?.scrollIntoView({ behavior: "smooth", block: "center" });
    els.quickStart?.querySelector("a, button")?.focus({ preventScroll: true });
  });
}));
els.themeButtons.forEach((button) => button.addEventListener("click", () => {
  applyThemePreference(button.dataset.themeOption, { save: true });
}));
els.tourNext?.addEventListener("click", () => {
  if (tourIndex >= activeTourSteps.length - 1) {
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
      window.clearArtistWorkspace?.();
      window.clearGoogleCalendar?.();
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

$("[data-add-booking]").addEventListener("click", () => {
  openEventForm();
  els.eventForm.elements.type.value = "Talent Booking";
  const bobby = state.clients.find((client) => isActiveClient(client) && /bobby outside/i.test(client.name));
  if (bobby) els.eventForm.elements.clientId.value = bobby.id;
  els.eventFormTitle.textContent = "Add guest booking";
});
bootstrapAuth();

// Project records retain their existing Notion IDs and relations.
function renderProjects() {
  const target = document.querySelector('[data-project-list]');
  if (!target) return;
  const projects = state.clients.filter(isProjectClient);
  target.innerHTML = projects.length ? projects.map((client) => `<button class="client-card" type="button" data-open-project="${escapeHtml(client.id)}"><div class="client-card-head"><div class="client-name"><strong>${escapeHtml(client.name)}</strong><span>Film project</span></div></div><p>${escapeHtml(client.nextAction || "Review project scope, milestones, and next actions.")}</p><span class="client-card-open">Open project workspace →</span></button>`).join('') : '<p class="artist-empty">No film projects in the shared records.</p>';
}
function renderTeamCheckins() {
  const target = document.querySelector('[data-team-checkins]');
  if (!target) return;
  target.innerHTML = state.clients.filter(isActiveClient).map((client) => `<button class="button button-secondary" type="button" data-open-meeting="${escapeHtml(client.id)}">${escapeHtml(client.name)} <span aria-hidden="true">→</span></button>`).join('') || '<p>No artists loaded yet.</p>';
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-open-project], [data-open-meeting]');
  if (!button) return;
  state.selectedClientId = button.dataset.openProject || button.dataset.openMeeting;
  location.hash = 'clients';
  renderDetail();
  if (button.dataset.openMeeting) window.showArtistMeeting?.();
  els.detail.scrollIntoView({ block: 'start', behavior: 'smooth' });
});

// Keep the roster and the selected workspace as separate steps.
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-client-id], [data-health-client-id], [data-open-project], [data-open-meeting]')) document.body.classList.add('client-workspace-open');
  if (event.target.closest('.portal-nav a[href="#clients"], .portal-nav a[href="#projects"]')) document.body.classList.remove('client-workspace-open');
}, true);

document.querySelector('[data-home-owner]')?.addEventListener('change', renderMyWork);
document.querySelector('[data-home-clients]')?.addEventListener('click', event => {
  const button = event.target.closest('[data-health-client-id]');
  if (!button) return;
  state.selectedClientId = button.dataset.healthClientId;
  document.body.classList.add('client-workspace-open');
  location.hash = 'clients'; renderDetail();
});
document.querySelector('[data-home-milestone]')?.addEventListener('click', event => {
  const button = event.target.closest('[data-home-milestone-client]');
  if (!button?.dataset.homeMilestoneClient) return;
  state.selectedClientId = button.dataset.homeMilestoneClient;
  document.body.classList.add('client-workspace-open');
  location.hash = 'clients'; renderDetail(); window.showArtistTourTab?.(5);
});

// Keep task execution and opportunity review as distinct, full-width views.
document.querySelectorAll('[data-work-tab]').forEach(button => button.addEventListener('click', () => {
  const opportunities = button.dataset.workTab === 'opportunities';
  document.querySelector('#actions').hidden = opportunities;
  document.querySelector('#opportunities').hidden = !opportunities;
  document.querySelectorAll('[data-work-tab]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
}));

// The same guarded, reversible delete flow is available from the task list.
document.addEventListener('click', event => {
  const button = event.target.closest('[data-open-task-delete]');
  if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const action = state.actions.find(item => item.id === button.dataset.openTaskDelete);
  if (!action || actionMutationPending) return;
  openActionForm(action);
  handleActionDelete();
}, true);

let opportunityDeletePending = false;
const deleteOpportunity = async () => {
  const id = els.opportunityForm.elements.id.value;
  const lead = state.opportunities.find(item => item.id === id);
  if (!lead || opportunityDeletePending || !window.confirm(`Delete “${lead.name}”? This moves the lead to Notion trash. To keep the history, cancel and set its stage to Lost instead.`)) return;
  opportunityDeletePending = true;
  const button = $('[data-delete-opportunity]');
  button.disabled = true;
  try {
    const response = await fetch(apiEndpoint, {method:'DELETE', headers:getRequestHeaders(), body:JSON.stringify({resource:'opportunity', id})});
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error(data.message || 'Unable to delete lead.');
    closeDialog(els.opportunityDialog);
    await loadDashboard();
  } catch(error) { setFormError(els.opportunityForm, error.message); }
  finally { opportunityDeletePending = false; button.disabled = false; }
};
$('[data-delete-opportunity]').addEventListener('click', deleteOpportunity);
document.addEventListener('click', event => {
  const button = event.target.closest('[data-delete-lead]');
  if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation();
  openOpportunityForm(state.opportunities.find(item => item.id === button.dataset.deleteLead));
  deleteOpportunity();
}, true);
const getClientNextTask = clientId => getRelated(state.actions, clientId).filter(item => !isComplete(item)).sort((a,b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || String(a.title).localeCompare(String(b.title)))[0];
const getClientNextStep = client => getClientNextTask(client.id)?.title || 'No open tasks. Add the next agreed action.';
const populateTaskMilestones = (clientId, selected = '') => {
  const select = els.actionForm.elements.milestoneId;
  select.innerHTML = '<option value="">No milestone</option>' + getRelated(state.events, clientId).filter(item => /^milestone$/i.test(item.type || '')).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  if (selected && !Array.from(select.options).some(option => option.value === selected)) select.add(new Option('Previous milestone', selected));
  select.value = selected;
};
els.actionForm.elements.clientId.addEventListener('change', () => populateTaskMilestones(els.actionForm.elements.clientId.value));

// Focused file retry does not reload or discard the rest of the dashboard.
let filesRetryBusy = false;
document.addEventListener('click', async event => {
  const retry = event.target.closest('[data-retry-files]');
  if (!retry || filesRetryBusy) return;
  filesRetryBusy = true; retry.disabled = true; retry.textContent = 'Retrying…';
  const user = state.teamUser?.email;
  try {
    const response = await fetch(documentsEndpoint, { headers: getRequestHeaders(), cache: 'no-store' });
    const data = await parseJsonResponse(response);
    if (user !== state.teamUser?.email) return;
    if (!response.ok) throw new Error(data.message || 'Unable to load files.');
    state.documents = data.documents || []; state.documentsError = false; state.documentsLoaded = true; state.documentsUpdatedAt = new Date().toISOString();
  } catch (error) { if (user === state.teamUser?.email) { state.documentsError = true; state.documentsMessage = error.message; } }
  finally { filesRetryBusy = false; if (user === state.teamUser?.email) { renderDocuments(); renderDetail(); } }
});
document.querySelector('[data-task-queue-filter]')?.addEventListener('change', renderActions);
document.addEventListener('click', event => {
  const link = event.target.closest('[data-home-work-filter]');
  if (!link) return;
  const queueOwner = document.querySelector('[data-task-queue-owner]'); if (queueOwner) queueOwner.value = document.querySelector('[data-home-owner]')?.value || "";
  const filter = document.querySelector('[data-task-queue-filter]'); if (filter) { filter.value = link.dataset.homeWorkFilter; renderActions(); }
});

document.querySelector('[data-task-queue-owner]')?.addEventListener('change', renderActions);
