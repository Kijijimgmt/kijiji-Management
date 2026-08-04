const apiEndpoint = "/api/notion-clients";
const accessStorageKey = "kijiji-portal-access-code";
const today = new Date();
const isoDate = (offsetDays) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const rowsTarget = document.querySelector("[data-client-rows]");
const detailTarget = document.querySelector("[data-client-detail]");
const actionListTarget = document.querySelector("[data-action-list]");
const ownerGridTarget = document.querySelector("[data-owner-grid]");
const searchInput = document.querySelector("[data-search-clients]");
const statusFilter = document.querySelector("[data-status-filter]");
const clientDialog = document.querySelector("[data-client-dialog]");
const clientForm = document.querySelector("[data-client-form]");
const formTitle = document.querySelector("[data-form-title]");
const totalMetric = document.querySelector("[data-metric-total]");
const activeMetric = document.querySelector("[data-metric-active]");
const progressMetric = document.querySelector("[data-metric-progress]");
const dueMetric = document.querySelector("[data-metric-due]");
const sourceBadge = document.querySelector("[data-source-badge]");
const logoutButton = document.querySelector("[data-logout-portal]");
const accessPanel = document.querySelector("[data-access-panel]");
const accessForm = document.querySelector("[data-access-form]");
const accessInput = document.querySelector("[data-access-code]");
const accessSubmit = document.querySelector("[data-access-submit]");
const accessMessage = document.querySelector("[data-access-message]");
const dashboardContent = document.querySelector("[data-dashboard-content]");
const accessRequiredControls = document.querySelectorAll("[data-requires-access]");

let clients = [];
let selectedClientId = "";
let isLoading = true;
let portalError = "";
let portalAccessCode = sessionStorage.getItem(accessStorageKey) || "";

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
  const start = new Date(today.toISOString().slice(0, 10));
  const difference = dueDate.getTime() - start.getTime();
  return Math.ceil(difference / 86400000);
};

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

const getFilteredClients = () => {
  const query = String(searchInput?.value || "").trim().toLowerCase();
  const status = statusFilter?.value || "all";

  return clients.filter((client) => {
    const searchable = [
      client.name,
      client.category,
      client.type?.join(" "),
      client.status,
      client.owner,
      client.stage,
      client.nextAction,
      client.email,
      client.phone,
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = !query || searchable.includes(query);
    const matchesStatus = status === "all" || client.status === status;

    return matchesQuery && matchesStatus;
  });
};

const setSourceBadge = (state, text) => {
  if (!sourceBadge) {
    return;
  }

  sourceBadge.dataset.state = state;
  sourceBadge.textContent = text;
};

const setAccessMessage = (message = "", state = "") => {
  if (!accessMessage) {
    return;
  }

  accessMessage.textContent = message;
  accessMessage.dataset.state = state;
};

const setAccessBusy = (isBusy) => {
  if (accessSubmit) {
    accessSubmit.disabled = isBusy;
    accessSubmit.textContent = isBusy ? "Unlocking..." : "Unlock Dashboard";
  }

  if (accessInput) {
    accessInput.disabled = isBusy;
  }
};

const setProtectedAccess = (isAvailable) => {
  accessRequiredControls.forEach((control) => {
    control.disabled = !isAvailable;
  });
};

const showAccessPanel = (message = "", state = "") => {
  accessPanel.hidden = false;
  dashboardContent.hidden = true;
  setProtectedAccess(false);
  setAccessBusy(false);
  setAccessMessage(message, state);
};

const showDashboard = () => {
  accessPanel.hidden = true;
  dashboardContent.hidden = false;
  setProtectedAccess(true);
};

const setLoadingState = () => {
  totalMetric.textContent = "-";
  activeMetric.textContent = "-";
  progressMetric.textContent = "-";
  dueMetric.textContent = "-";
  rowsTarget.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">
          <p class="eyebrow">Loading Notion</p>
          <h2>Syncing the shared roster</h2>
        </div>
      </td>
    </tr>
  `;
  detailTarget.innerHTML = `
    <div class="empty-state">
      <p class="eyebrow">Client detail</p>
      <h2>Loading</h2>
      <p>Roster details will appear here after Notion responds.</p>
    </div>
  `;
  actionListTarget.innerHTML = "";
  ownerGridTarget.innerHTML = "";
};

const getRequestHeaders = () => ({
  "Content-Type": "application/json",
  "X-Portal-Access-Code": portalAccessCode,
});

const setErrorState = () => {
  setSourceBadge("error", "Notion setup needed");
  totalMetric.textContent = "0";
  activeMetric.textContent = "0";
  progressMetric.textContent = "0%";
  dueMetric.textContent = "0";
  rowsTarget.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">
          <p class="eyebrow">Shared data unavailable</p>
          <h2>Connect Notion to use the team portal</h2>
          <p>${escapeHtml(portalError || "The portal could not reach the shared Kijiji Client Roster.")}</p>
        </div>
      </td>
    </tr>
  `;
  detailTarget.innerHTML = `
    <div class="empty-state">
      <p class="eyebrow">Source of truth</p>
      <h2>Notion Client Roster</h2>
      <p>Add a Vercel environment variable named NOTION_TOKEN and share the Kijiji Client Roster database with that Notion integration.</p>
    </div>
  `;
  actionListTarget.innerHTML = `
    <article class="action-item">
      <header>
        <strong>Required setup</strong>
        <span class="date-chip">Notion</span>
      </header>
      <p>Set NOTION_TOKEN in Vercel and redeploy. Optional: set NOTION_CLIENT_ROSTER_DATABASE_ID if the roster database changes.</p>
    </article>
  `;
  ownerGridTarget.innerHTML = "";
};

const getPortalErrorMessage = (response, data) => {
  if (response.status === 401) {
    return "That passcode did not unlock the dashboard. Check it and try again.";
  }

  if (data?.error === "notion_not_configured") {
    return "The passcode worked, but Notion is not configured in Vercel yet.";
  }

  if (data?.error === "portal_access_not_configured") {
    return "The portal passcode is not configured in Vercel yet.";
  }

  if (response.status >= 500) {
    return "The passcode was accepted, but the shared roster could not load. Check the Notion token and database sharing.";
  }

  return data?.message || "The dashboard could not load. Try again or check the portal configuration.";
};

const renderMetrics = () => {
  const activeClients = clients.filter((client) => client.status === "Active");
  const avgProgress = clients.length
    ? Math.round(clients.reduce((sum, client) => sum + getProgressEstimate(client), 0) / clients.length)
    : 0;
  const dueSoon = clients.filter((client) => {
    const days = getDaysUntil(client.lastTouch || client.dueDate);
    return days >= 0 && days <= 7;
  });

  totalMetric.textContent = String(clients.length);
  activeMetric.textContent = String(activeClients.length);
  progressMetric.textContent = `${avgProgress}%`;
  dueMetric.textContent = String(dueSoon.length);
};

const renderRows = () => {
  const filteredClients = getFilteredClients();

  rowsTarget.innerHTML = filteredClients
    .map((client) => {
      const progress = getProgressEstimate(client);

      return `
        <tr data-client-id="${escapeHtml(client.id)}" class="${client.id === selectedClientId ? "is-selected" : ""}" tabindex="0">
          <td>
            <div class="client-name">
              <strong>${escapeHtml(client.name || "Untitled client")}</strong>
              <span>${escapeHtml(client.category || "Type not set")}</span>
            </div>
          </td>
          <td><span class="status-pill" data-status="${escapeHtml(client.status)}">${escapeHtml(client.status)}</span></td>
          <td>${escapeHtml(client.owner || "Unassigned")}</td>
          <td>${escapeHtml(client.nextAction || "Add next move in Notion")}</td>
          <td>
            <div class="client-name">
              <strong>${escapeHtml(client.email || "Email not added")}</strong>
              <span>${escapeHtml(client.phone || client.leadSource || "Add contact details")}</span>
            </div>
          </td>
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

  if (!filteredClients.length) {
    rowsTarget.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <p class="eyebrow">No matches</p>
            <h2>No clients found</h2>
          </div>
        </td>
      </tr>
    `;
  }
};

const renderDetail = () => {
  const client = clients.find((item) => item.id === selectedClientId);

  if (!client) {
    detailTarget.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">Client detail</p>
        <h2>Select a client</h2>
        <p>Roster details appear here when an account is selected.</p>
      </div>
    `;
    return;
  }

  const progress = getProgressEstimate(client);

  detailTarget.innerHTML = `
    <div class="client-detail-head">
      <div>
        <p class="eyebrow">${escapeHtml(client.category || "Client")}</p>
        <h2>${escapeHtml(client.name)}</h2>
        <span class="status-pill" data-status="${escapeHtml(client.status)}">${escapeHtml(client.status)}</span>
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
    </div>

    <div class="contact-grid">
      <div>
        <span>Contact email</span>
        <strong>${escapeHtml(client.email || "Not added")}</strong>
      </div>
      <div>
        <span>Contact phone</span>
        <strong>${escapeHtml(client.phone || "Not added")}</strong>
      </div>
      <div>
        <span>Lead source</span>
        <strong>${escapeHtml(client.leadSource || "Not added")}</strong>
      </div>
      <div>
        <span>Progress estimate</span>
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
  const sorted = [...clients].sort((a, b) => {
    const aDate = a.lastTouch || a.dueDate || "9999-12-31";
    const bDate = b.lastTouch || b.dueDate || "9999-12-31";
    return new Date(aDate) - new Date(bDate);
  });

  actionListTarget.innerHTML = sorted
    .slice(0, 6)
    .map(
      (client) => `
        <article class="action-item" data-action-client="${escapeHtml(client.id)}" tabindex="0">
          <header>
            <strong>${escapeHtml(client.name)}</strong>
            <span class="date-chip">${formatDate(client.lastTouch || client.dueDate)}</span>
          </header>
          <p>${escapeHtml(client.nextAction || "Add the next move in Notion.")}</p>
          <span class="muted">${escapeHtml(client.owner || "Unassigned")} | ${escapeHtml(client.status || "No status")}</span>
        </article>
      `
    )
    .join("");
};

const renderOwners = () => {
  const ownerNames = [...new Set(clients.map((client) => client.owner || "Unassigned"))];
  const owners = ownerNames.length ? ownerNames : ["Unassigned"];

  ownerGridTarget.innerHTML = owners
    .map((owner) => {
      const ownedClients = clients.filter((client) => (client.owner || "Unassigned") === owner);
      const activeCount = ownedClients.filter((client) => client.status === "Active").length;
      const nextClient = [...ownedClients].sort((a, b) => {
        const aDate = a.lastTouch || a.dueDate || "9999-12-31";
        const bDate = b.lastTouch || b.dueDate || "9999-12-31";
        return new Date(aDate) - new Date(bDate);
      })[0];

      return `
        <article class="owner-card">
          <h3>${escapeHtml(owner)}</h3>
          <strong>${ownedClients.length}</strong>
          <p>${activeCount} active account${activeCount === 1 ? "" : "s"}</p>
          <p class="muted">${nextClient ? `Next: ${escapeHtml(nextClient.name)} on ${formatDate(nextClient.lastTouch || nextClient.dueDate)}` : "No account assigned"}</p>
        </article>
      `;
    })
    .join("");
};

const renderPortal = () => {
  if (isLoading) {
    setLoadingState();
    return;
  }

  if (portalError) {
    setErrorState();
    return;
  }

  renderMetrics();
  renderRows();
  renderDetail();
  renderActions();
  renderOwners();
};

const loadClients = async ({ code = portalAccessCode, fromUnlock = false } = {}) => {
  const candidateCode = String(code || "").trim();
  let shouldShowAccessAfterFailure = false;

  if (!candidateCode) {
    portalAccessCode = "";
    sessionStorage.removeItem(accessStorageKey);
    setSourceBadge("locked", "Locked");
    showAccessPanel("Enter the team passcode to unlock the dashboard.", "info");
    return false;
  }

  isLoading = true;
  portalError = "";
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

    portalAccessCode = candidateCode;
    sessionStorage.setItem(accessStorageKey, portalAccessCode);
    clients = Array.isArray(data.clients) ? data.clients : [];
    selectedClientId = selectedClientId || clients[0]?.id || "";
    setSourceBadge("ready", "Synced with Notion");
    setAccessMessage("");
    showDashboard();
    isLoading = false;
    renderPortal();
    return true;
  } catch (error) {
    clients = [];
    selectedClientId = "";
    portalAccessCode = error.statusCode === 401 ? "" : candidateCode;
    portalError = fromUnlock ? "" : error.message;

    if (error.statusCode === 401) {
      sessionStorage.removeItem(accessStorageKey);
    } else if (candidateCode) {
      sessionStorage.setItem(accessStorageKey, candidateCode);
    }

    if (fromUnlock) {
      setSourceBadge("error", "Access failed");
      showAccessPanel(error.message, "error");
    } else if (error.statusCode === 401) {
      portalError = "";
      shouldShowAccessAfterFailure = true;
      setSourceBadge("locked", "Locked");
      showAccessPanel("Your saved passcode no longer works. Enter it again to unlock the dashboard.", "error");
    }

    return false;
  } finally {
    isLoading = false;
    setAccessBusy(false);

    if (!fromUnlock && !shouldShowAccessAfterFailure) {
      renderPortal();
    }
  }
};

const selectClient = (clientId) => {
  selectedClientId = clientId;
  renderPortal();
};

const openClientForm = (client = null) => {
  clientForm.reset();
  formTitle.textContent = client ? "Edit client" : "Add client";
  clientForm.elements.id.value = client?.id || "";
  clientForm.elements.name.value = client?.name || "";
  clientForm.elements.category.value = client?.category || "";
  clientForm.elements.status.value = client?.status || "Prospect";
  clientForm.elements.owner.value = client?.owner || "";
  clientForm.elements.stage.value = client?.stage || "";
  clientForm.elements.lastTouch.value = client?.lastTouch || client?.dueDate || isoDate(0);
  clientForm.elements.nextAction.value = client?.nextAction || "";
  clientForm.elements.progress.value = client?.progress || getProgressEstimate(client || {});
  clientForm.elements.email.value = client?.email || "";
  clientForm.elements.phone.value = client?.phone || "";
  clientForm.elements.leadSource.value = client?.leadSource || "";
  clientForm.elements.notes.value = client?.notes || "";

  if (typeof clientDialog.showModal === "function") {
    clientDialog.showModal();
  } else {
    clientDialog.setAttribute("open", "");
  }
};

const closeClientForm = () => {
  clientDialog.close();
};

const logoutPortal = () => {
  sessionStorage.removeItem(accessStorageKey);
  portalAccessCode = "";
  clients = [];
  selectedClientId = "";
  portalError = "";
  isLoading = false;
  setSourceBadge("signed-out", "Signed out");
  showAccessPanel("You have been signed out. Enter the team passcode to unlock the dashboard again.", "info");
  accessInput?.focus();
};

const saveClient = async (payload) => {
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
    throw new Error(data.message || "Unable to save client to Notion.");
  }

  return data.client;
};

const handleFormSubmit = async (event) => {
  event.preventDefault();

  const formData = new FormData(clientForm);
  const payload = {
    id: String(formData.get("id") || ""),
    name: String(formData.get("name") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    status: String(formData.get("status") || "Prospect"),
    owner: String(formData.get("owner") || "").trim(),
    stage: String(formData.get("stage") || "").trim(),
    lastTouch: String(formData.get("lastTouch") || "").trim(),
    nextAction: String(formData.get("nextAction") || "").trim(),
    progress: Number(formData.get("progress") || 0),
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    leadSource: String(formData.get("leadSource") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
  };
  const submitButton = clientForm.querySelector('[type="submit"]');

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  try {
    const savedClient = await saveClient(payload);
    selectedClientId = savedClient.id;
    closeClientForm();
    await loadClients();
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save Client";
  }
};

const handleAccessSubmit = async (event) => {
  event.preventDefault();

  const code = accessInput.value.trim();

  if (!code) {
    setAccessMessage("Enter the team passcode to unlock the dashboard.", "error");
    accessInput.focus();
    return;
  }

  const didUnlock = await loadClients({ code, fromUnlock: true });

  if (!didUnlock) {
    accessInput.focus();
    accessInput.select();
  }
};

const exportCsv = () => {
  const headers = [
    "Client",
    "Type",
    "Status",
    "Owner",
    "Current Offer",
    "Progress Estimate",
    "Next Move",
    "Last Touch",
    "Email",
    "Phone",
    "Lead Source",
    "Notes",
    "Notion URL",
  ];
  const rows = clients.map((client) => [
    client.name,
    client.category,
    client.status,
    client.owner,
    client.stage,
    getProgressEstimate(client),
    client.nextAction,
    client.lastTouch || client.dueDate,
    client.email,
    client.phone,
    client.leadSource,
    client.notes,
    client.url,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = "kijiji-notion-client-roster.csv";
  link.click();
  URL.revokeObjectURL(link.href);
};

rowsTarget.addEventListener("click", (event) => {
  const row = event.target.closest("[data-client-id]");

  if (row) {
    selectClient(row.dataset.clientId);
  }
});

rowsTarget.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const row = event.target.closest("[data-client-id]");

  if (row) {
    event.preventDefault();
    selectClient(row.dataset.clientId);
  }
});

detailTarget.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-client]");

  if (!editButton) {
    return;
  }

  const client = clients.find((item) => item.id === editButton.dataset.editClient);

  if (client) {
    openClientForm(client);
  }
});

actionListTarget.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action-client]");

  if (action) {
    selectClient(action.dataset.actionClient);
  }
});

document.querySelector("[data-open-client-form]").addEventListener("click", () => openClientForm());
document.querySelectorAll("[data-close-client-form]").forEach((button) => {
  button.addEventListener("click", closeClientForm);
});
document.querySelector("[data-export-csv]").addEventListener("click", exportCsv);
document.querySelector("[data-refresh-roster]").addEventListener("click", loadClients);
logoutButton?.addEventListener("click", logoutPortal);
accessForm.addEventListener("submit", handleAccessSubmit);
clientForm.addEventListener("submit", handleFormSubmit);
searchInput.addEventListener("input", renderRows);
statusFilter.addEventListener("change", renderRows);

if (portalAccessCode) {
  loadClients();
} else {
  isLoading = false;
  setSourceBadge("locked", "Locked");
  showAccessPanel("Enter the team passcode to unlock the dashboard.", "info");
}
