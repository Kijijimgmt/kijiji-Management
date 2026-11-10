/* Artist workspace: uses the portal's authenticated API and existing record editors. */
(() => {
  const tabs = ["Overview", "Tasks", "Events & tickets", "Socials", "Files", "Roadmap", "Meetings"];
  const cache = new Map();
  const profileLinks = { website: "Website", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", spotify: "Spotify", appleMusic: "Apple Music" };
  window.clearArtistWorkspace = () => cache.clear();
  window.refreshArtistWorkspace = () => cache.forEach((data) => { data.loadedAt = 1; });
  const photos = { "jason mendoza": "assets/roster-jason-mendoza.jpg", "algee smith": "assets/roster-algee-smith.jpg", "bobby outside": "assets/roster-bobby-outside.jpg", medusa: "assets/roster-medusa.jpg" };
  window.artistRosterPortrait = (client) => photos[client.name.toLowerCase()] ? `<img class="artist-roster-portrait" src="${photos[client.name.toLowerCase()]}" alt="" loading="lazy">` : "";
  const safeUrl = (value) => { try { return new URL(value).protocol === "https:" ? value : ""; } catch { return ""; } };
  const e = (value) => escapeHtml(value == null ? "" : String(value));
  const todayValue = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const input = (name, label, value = "", type = "text", extra = "") => `<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${extra}></label>`;
  const area = (name, label, value = "", max = 4000) => `<label class="artist-wide">${label}<textarea name="${name}" rows="5" maxlength="${max}">${e(value)}</textarea></label>`;
  const select = (name, label, values) => `<label>${label}<select name="${name}">${values.map(([value, text]) => `<option value="${e(value)}">${e(text)}</option>`).join("")}</select></label>`;
  const empty = (text) => `<p class="artist-empty">${e(text)}</p>`;
  const metric = (label, value, unit = "") => `<div class="artist-metric"><span>${e(label)}</span><strong>${value == null ? "Not entered" : e(Number(value).toLocaleString()) + unit}</strong></div>`;
  const form = (kind, title, body) => `<details class="artist-editor"><summary>${title}</summary><form data-artist-form="${kind}" class="artist-form">${body}<div class="artist-wide"><button class="button button-primary" type="submit">${kind === "draft" ? "Save draft" : "Save to artist profile"}</button></div></form></details>`;
  const entryStamp = (item) => `<small>Manual entry · ${e(item.date || item.createdAt?.slice(0, 10))} · ${e(item.author)}</small>`;
  function taskRow(task) {
    return `<button class="artist-record team-task-row" type="button" data-jump-action="${e(task.id)}"><span class="team-task-dot" aria-hidden="true"></span><span><strong>${e(task.title || task.name)}</strong><span class="team-task-context">${e(task.owner || "Owner needed")} · ${task.dueDate ? e(formatDate(task.dueDate)) : "Date needed"}</span></span><span class="status-pill">${e(task.status || "Open")}</span></button>`;
  }
  function renderRoadmap(client, tasks, events, data) {
    const milestones = events.filter(event => /^milestone$/i.test(event.type || "")).sort((a,b) => String(a.name).localeCompare(String(b.name), undefined, {numeric: true}));
    const grouped = new Set();
    const groups = milestones.map((milestone, index) => {
      const number = String(milestone.name || "").match(/^(\d+)[.\s]/)?.[1];
      // The approved Medusa reset predates stored milestone context on some records.
      // Only these exact, agreed task titles use a fallback; other tasks stay ungrouped.
      const approvedMedusaGroups = {
        "hold medusa listening and direction session": "1",
        "review and edit strategic plan for medusa": "1",
        "finalize management agreement following independent attorney review": "1",
        "establish medusa communication rhythm": "1",
        "inventory released and unreleased catalog": "2",
        "assess master ownership and existing rights obligations": "2",
        "audit publishing registrations and royalty collection": "2",
        "map medusa’s existing relationships": "3",
        "assess team strengths and support gaps": "3",
        "confirm outstanding hip hop under the big top items": "4",
        "follow up on marcus johnson/ln show and opportunities": "4",
        "review collaboration project idea": "4",
      };
      const linked = number ? tasks.filter(task => {
        const explicit = String(task.notes || "").match(/milestone\s+(\d+)\s*:/i)?.[1];
        const approved = /^medusa$/i.test(client.name) ? approvedMedusaGroups[String(task.title || task.name || "").trim().toLowerCase()] : undefined;
        return (explicit || approved) === number;
      }) : [];
      linked.forEach(task => grouped.add(task.id));
      const done = linked.filter(isComplete).length;
      const open = data.openGroups ? data.openGroups.includes(milestone.id) : index === 0;
      return `<details class="team-milestone" data-roadmap-group="${e(milestone.id)}" ${open ? "open" : ""}><summary><span class="team-milestone-number">${index+1}</span><strong>${e(String(milestone.name).replace(/^\d+[.\s]+/, ""))}</strong><span>${done} / ${linked.length} actions</span></summary><div class="team-milestone-body"><p>${e(milestone.notes || "Open the milestone to review its completion conditions.")}</p><button class="text-action" data-jump-event="${e(milestone.id)}">Edit milestone →</button>${linked.map(taskRow).join("") || empty("No tasks linked by milestone number yet. Add “Milestone N:” to a task’s context to group it here.")}</div></details>`;
    }).join("");
    const remaining = tasks.filter(task => !grouped.has(task.id));
    return `<div class="artist-section-head"><div><h3>Roadmap</h3><p>Outcomes first. Actions underneath.</p></div><div class="meeting-actions"><button class="button button-secondary" data-roadmap-add-task="${e(client.id)}">Add Task</button><button class="button button-primary" data-roadmap-add-milestone="${e(client.id)}">Add Milestone</button></div></div><div class="team-roadmap">${groups || empty("Add the first milestone for this client.")}</div>${remaining.length ? `<details class="team-milestone" open><summary><strong>Other actions</strong><span>${remaining.length} tasks</span></summary><div class="team-milestone-body">${remaining.map(taskRow).join("")}</div></details>` : ""}`;
  }
  function renderMeetings(data) {
    const latest = data.entries.find(entry => entry.kind === "meeting") || {};
    const history = data.entries.filter(entry => entry.kind === "meeting" && entry.mode === "recap");
    const draft = latest.mode === "recap" ? { ...latest, meetingDate: "", meetingTime: "", notes: "", decisions: "", actions: "" } : latest;
    const zoom = safeUrl(latest.zoomUrl);
    const agenda = draft.agenda || "Artist check-in\nReview last week’s commitments\nResolve decisions and blockers\nAgree on the next three priorities";
    return `<div class="team-meeting-head"><div><p class="eyebrow">Internal team check-in</p><h3>${latest.mode !== "recap" && latest.meetingDate ? e(formatDate(latest.meetingDate)) + " · " + e(latest.meetingTime) : "Set up the next conversation"}</h3><p>${e(latest.timeZone || "America/New_York")} · ${e(latest.lead || "Lead manager needed")}</p></div>${zoom ? `<a class="button button-primary" href="${e(zoom)}" target="_blank" rel="noopener noreferrer">Join Zoom →</a>` : '<span class="status-pill">Add a Zoom link below</span>'}</div><p class="artist-notice">Internal notes save to the shared artist profile in Notion. Saving does not send invitations, texts, or create a Google Calendar event. Use Events & tickets to manage the connected calendar.</p><form data-artist-form="meeting" class="artist-form"><input type="hidden" name="mode" value="draft">${input("zoomUrl", "Zoom meeting link", draft.zoomUrl, "url")}${input("lead", "Lead manager", draft.lead)}${input("meetingDate", "Next meeting date", draft.meetingDate, "date")}${input("meetingTime", "Meeting time", draft.meetingTime, "time")}${input("timeZone", "Meeting timezone (e.g. America/New_York)", draft.timeZone || "America/New_York")}${area("agenda", "Agenda", agenda)}${area("notes", "Internal notes", draft.notes)}${area("decisions", "Decisions agreed", draft.decisions)}${area("actions", "Next actions · owner · due date", draft.actions)}<div class="artist-wide meeting-actions"><button class="button button-primary" type="submit" value="draft">Save meeting draft</button><button class="button button-secondary" type="submit" value="recap">Save recap to history</button></div></form><section class="artist-section"><h3>Past meeting recaps</h3>${history.map(entry => `<details class="artist-editor"><summary>${e(entry.meetingDate || entry.createdAt?.slice(0,10))} · ${e(entry.author)}</summary><p>${e(entry.meetingTime)} ${e(entry.timeZone)} · Lead: ${e(entry.lead || "Not assigned")}</p><h4>Notes</h4><p class="artist-prewrap">${e(entry.notes)}</p><h4>Decisions</h4><p class="artist-prewrap">${e(entry.decisions)}</p><h4>Next actions</h4><p class="artist-prewrap">${e(entry.actions)}</p></details>`).join("") || empty("No recaps yet. Save the first one after your check-in.")}</section>`;
  }
  async function api(clientId, body) {
    const response = await fetch(`/api/notion-clients?view=artist-workspace&clientId=${encodeURIComponent(clientId)}`, { method: body ? "POST" : "GET", headers: getRequestHeaders(), ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await parseJsonResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to load artist workspace.");
    return result;
  }
  function render(client, host) {
    const key = `${state.teamUser?.email || state.teamUser?.owner || "session"}:${client.id}`;
    let data = cache.get(key);
    if (!data) { data = { entries: [], tab: 0, loading: true, forms: {} }; cache.set(key, data); }
    if (data.loadedAt && Date.now() - data.loadedAt > 60000 && !data.loading && !data.busy) { data.loading = true; data.requested = false; data.error = ""; }
    const retainedOpen = Array.from(host.querySelectorAll("details[open][data-roadmap-group]")).map(el => el.dataset.roadmapGroup);
    const oldLegacy = host.querySelector("[data-artist-legacy]");
    const legacy = oldLegacy ? Array.from(oldLegacy.children).filter((node) => node.tagName !== "SUMMARY").map((node) => node.outerHTML).join("") : host.innerHTML;
    const profile = data.entries.find((item) => item.kind === "profile") || {};
    const photo = safeUrl(profile.photo) || photos[client.name.toLowerCase()];
    host.innerHTML = `<button type="button" class="text-action workspace-back" data-back-to-roster>← All clients & projects</button><div class="artist-header">${photo ? `<img src="${e(photo)}" alt="${e(client.name)}" class="artist-portrait">` : `<span class="artist-avatar" aria-hidden="true">${e(client.name.slice(0, 1))}</span>`}<div><p class="eyebrow">${/luchador/i.test(client.name) ? "Film project workspace" : "Artist workspace"}</p><h2>${e(client.name)}</h2><p>${e(client.category || "Talent")} · ${e(client.owner || "Assign a team member")}</p></div><span class="status-pill">${e(client.status)}</span></div>
      <nav class="artist-tabs" aria-label="Artist profile sections">${tabs.map((tab, index) => `<button type="button" data-artist-tab="${index}" aria-current="${index === data.tab ? "page" : "false"}">${tab}</button>`).join("")}</nav>
      <p class="artist-message" role="status">${e(data.message || "")}</p><div data-artist-content></div><details data-artist-legacy ${data.tab === 0 ? "" : "hidden"}><summary>Client details & full roadmap</summary>${legacy}</details>`;
    const panel = host.querySelector("[data-artist-content]");
    const tasks = getRelated(state.actions, client.id);
    const events = getRelated(state.events, client.id);
    const files = state.documents.filter((item) => item.clientIds?.includes(client.id));
    const stats = data.entries.filter((item) => item.kind === "social").sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const tickets = data.entries.filter((item) => item.kind === "tickets").sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    if (data.tab === 0) {
      panel.innerHTML = `<div class="artist-metrics">${metric("Open tasks", tasks.filter((t) => !isComplete(t)).length)}${metric("Linked events", events.length)}${metric("Shared files", files.length)}</div><section class="artist-section"><h3>Current priority</h3><p>${e(client.nextAction || "Add a next move in client details below.")}</p><div class="artist-section-head"><h3>Next actions</h3><button class="text-action" type="button" data-overview-roadmap>Open roadmap →</button></div>${tasks.filter(t => !isComplete(t)).slice(0,3).map(taskRow).join("") || empty("No open tasks. Add the next agreed action.")}<details class="artist-bio"><summary>About ${e(client.name)} & official links</summary><p class="artist-prewrap">${e(profile.bio || "Add a short bio and official links so the team has a shared starting point.")}</p><div class="artist-links">${Object.keys(profileLinks).filter((name) => safeUrl(profile[name])).map((name) => `<a href="${e(profile[name])}" target="_blank" rel="noopener noreferrer">${profileLinks[name]} ↗</a>`).join("")}</div></details></section>${form("profile", "Edit bio, photo & official links", area("bio", "Artist bio", profile.bio) + input("photo", "Photo URL (https)", profile.photo, "url") + Object.keys(profileLinks).map((name) => input(name, profileLinks[name] + " URL", profile[name], "url")).join(""))}`;
    } else if (data.tab === 1) {
      const owners = [...new Set(tasks.map(t => t.owner || "Unassigned"))];
      panel.innerHTML = `<div class="artist-section-head"><h3>Artist tasks</h3><button class="button button-primary" data-roadmap-add-task="${e(client.id)}">Add task</button></div><div class="artist-task-filters"><label>Owner<select data-task-owner><option value="">Everyone</option>${owners.map(owner => `<option ${data.taskOwner === owner ? "selected" : ""}>${e(owner)}</option>`).join("")}</select></label><label>Status<select data-task-status>${["Open", "All", "Done", "Waiting"].map(status => `<option ${status === (data.taskStatus || "Open") ? "selected" : ""}>${status}</option>`).join("")}</select></label></div><div data-artist-task-list>${tasks.filter(t => (!data.taskOwner || (t.owner || "Unassigned") === data.taskOwner) && ((data.taskStatus || "Open") === "All" || (data.taskStatus || "Open") === "Open" && !isComplete(t) || data.taskStatus === "Done" && isComplete(t) || data.taskStatus === "Waiting" && /waiting/i.test(t.status))).map(taskRow).join("") || empty("No tasks match these filters.")}</div>`;
    } else if (data.tab === 5) {
      panel.innerHTML = renderRoadmap(client, tasks, events, data, retainedOpen);
    } else if (data.tab === 6) {
      panel.innerHTML = renderMeetings(data);
    } else if (data.tab === 2) {
      panel.innerHTML = `${window.googleCalendar?.profile(client)||""}<div class="artist-section-head"><h3>Events & ticket sales</h3><button class="button button-primary" data-artist-add-event>Add internal event</button></div><p>Sales are entered manually. Connect your ticket provider later.</p>${events.map((event) => {
        const ticket = tickets.find((item) => item.eventId === event.id);
        return `<article class="artist-section"><button class="artist-record" data-jump-event="${e(event.id)}"><strong>${e(event.name)}</strong><span>${e(formatDate(event.date))} · ${e(event.status)}</span></button>${ticket ? `<div class="artist-metrics">${metric("Tickets sold", ticket.sold)}${metric("Remaining capacity", ticket.capacity == null ? null : ticket.capacity - ticket.sold)}${metric(`Revenue (${ticket.currency})`, ticket.revenue)}</div>${entryStamp(ticket)}${safeUrl(ticket.ticketUrl) ? `<p><a href="${e(ticket.ticketUrl)}" target="_blank" rel="noopener noreferrer">Open ticket page ↗</a></p>` : ""}` : empty("No sales entered yet.")}</article>`;
      }).join("") || empty("Add an event before recording ticket sales.")}${events.length ? form("tickets", "Record a sales update", select("eventId", "Event", events.map((event) => [event.id, event.name])) + input("date", "As of", todayValue(), "date", "required") + input("sold", "Total tickets sold", "", "number", 'required min="0" step="1"') + input("capacity", "Event capacity (optional)", "", "number", 'min="0" step="1"') + input("revenue", "Total revenue (optional)", "", "number", 'min="0" step="0.01"') + select("currency", "Currency", ["USD", "CAD", "GBP", "EUR"].map((v) => [v,v])) + input("ticketUrl", "Ticket page (optional)", "", "url")) : ""}${tickets.length ? `<details class="artist-editor"><summary>Sales history</summary>${tickets.map((t) => `<p>${e(t.eventName)} · ${t.sold} sold · ${t.revenue == null ? "Revenue not entered" : e(t.currency + " " + t.revenue)}<br>${entryStamp(t)}</p>`).join("")}</details>` : ""}`;
    } else if (data.tab === 3) {
      panel.innerHTML = `<h3>Social performance</h3><p>Manual snapshots, with the date and source visible. Blank metrics mean not entered.</p>${[...new Set(stats.map((s) => s.platform))].map((platform) => { const item = stats.find((s) => s.platform === platform); return `<article class="artist-section"><h4>${e(platform)}</h4><div class="artist-metrics">${metric("Followers / listeners", item.followers)}${metric("Views", item.views)}${metric("Engagement", item.engagement, "%")}</div>${entryStamp(item)}<p>${e(item.notes)}</p></article>`; }).join("") || empty("No social metrics yet. Add your first snapshot below.")}${form("social", "Add social metrics", select("platform", "Platform", ["Instagram", "TikTok", "YouTube", "Facebook", "Spotify"].map((v) => [v,v])) + input("date", "As of", todayValue(), "date", "required") + input("followers", "Followers / monthly listeners", "", "number", 'min="0" step="1"') + input("views", "Views", "", "number", 'min="0" step="1"') + input("engagement", "Engagement rate (%)", "", "number", 'min="0" max="100" step="0.01"') + area("notes", "Source & measurement period (e.g. Instagram, last 30 days)", "", 1000))}${stats.length ? `<details class="artist-editor"><summary>Snapshot history</summary>${stats.map((s) => `<p>${e(s.platform)} · ${s.followers == null ? "Followers not entered" : e(s.followers) + " followers/listeners"} · ${s.views == null ? "Views not entered" : e(s.views) + " views"}<br>${entryStamp(s)}</p>`).join("")}</details>` : ""}`;
    } else {
      panel.innerHTML = `<div class="artist-section-head"><h3>Artist files & brand kit</h3><div class="meeting-actions"><button class="button button-primary" data-artist-files-upload>Upload file</button><button class="button button-secondary" data-artist-files>Open artist folder</button></div></div><p>Keep logos, brand guides, contracts, and campaign assets together.</p>${files.map((file) => `<article class="artist-record"><strong>${e(file.name)}</strong><span>${e(file.category)}</span>${safeUrl(file.fileUrl) ? `<a href="${e(file.fileUrl)}" target="_blank" rel="noopener noreferrer">Open file ↗</a>` : ""}</article>`).join("") || empty("No linked files yet. Open the artist folder to upload the first file.")}`;
    }
    if (data.loading || data.error) {
      const notice = document.createElement("p"); notice.className = "artist-notice"; notice.textContent = data.loading ? "Loading shared artist profile…" : data.error; panel.prepend(notice);
      if (data.error) { const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "Retry loading"; retry.className = "button button-secondary"; retry.onclick = () => { data.error = ""; data.loading = true; data.requested = false; render(client, host); }; notice.append(" ", retry); }
    }
    panel.querySelectorAll("form").forEach((f) => {
      const saved = data.forms[f.dataset.artistForm];
      if (saved) { Object.entries(saved).forEach(([name, value]) => { if (f.elements[name]) f.elements[name].value = value; }); if (f.closest("details")) f.closest("details").open = true; }
      f.querySelectorAll("button").forEach((b) => { b.disabled = data.loading || Boolean(data.error) || data.busy || (b.hasAttribute("data-artist-generate") && !data.aiReady); });
      f.querySelectorAll("input, select, textarea").forEach((field) => { field.disabled = Boolean(data.busy); });
      f.oninput = () => { data.forms[f.dataset.artistForm] = Object.fromEntries(new FormData(f)); };
      f.onsubmit = async (event) => {
        event.preventDefault(); if (data.busy) return;
        const body = { ...Object.fromEntries(new FormData(f)), kind: f.dataset.artistForm };
        if (body.kind === "meeting") body.mode = event.submitter?.value || "draft";
        data.forms[body.kind] = Object.fromEntries(new FormData(f));
        data.busy = true; data.message = "Saving…"; render(client, host);
        try { const result = await api(client.id, body); data.entries.unshift(result.entry); delete data.forms[body.kind]; data.message = "Saved to the shared artist profile."; }
        catch (error) { data.message = error.message; }
        finally { data.busy = false; if (cache.get(key) === data && state.selectedClientId === client.id) render(client, host); }
      };
    });
    host.querySelectorAll("[data-artist-tab]").forEach((button) => { button.onclick = () => { data.tab = Number(button.dataset.artistTab); render(client, host); host.querySelector(`[data-artist-tab="${data.tab}"]`).focus(); }; });
    host.querySelector('[data-back-to-roster]')?.addEventListener('click', () => { document.body.classList.remove('client-workspace-open'); location.hash = /luchador/i.test(client.name) ? 'projects' : 'clients'; document.querySelector('#clients')?.scrollIntoView({block: 'start'}); });
    host.querySelector('[data-overview-roadmap]')?.addEventListener('click', () => { data.tab = 5; render(client, host); });
    host.querySelector('[data-task-owner]')?.addEventListener('change', event => { data.taskOwner = event.target.value; render(client, host); });
    host.querySelector('[data-task-status]')?.addEventListener('change', event => { data.taskStatus = event.target.value; render(client, host); });
    host.querySelectorAll('[data-roadmap-group]').forEach(el => el.addEventListener('toggle', () => { data.openGroups = Array.from(host.querySelectorAll('[data-roadmap-group][open]')).map(group => group.dataset.roadmapGroup); }));
    host.querySelector('[data-artist-files-upload]')?.addEventListener('click', () => { state.documentFolder = client.id; renderDocuments(); location.hash = 'files'; openDocumentForm({ clientId: client.id }); });
    host.querySelector("[data-artist-add-event]")?.addEventListener("click", () => openEventForm(null, client.id));
    host.querySelector("[data-artist-files]")?.addEventListener("click", () => { state.documentFolder = client.id; renderDocuments(); location.hash = "files"; });
    host.querySelector("[data-artist-generate]")?.addEventListener("click", async () => {
      if (data.busy) return;
      const f = host.querySelector('[data-artist-form="draft"]');
      const values = Object.fromEntries(new FormData(f)); data.forms.draft = values;
      if (values.content && !window.confirm("Replace the current draft text with a new AI draft?")) return;
      data.busy = true; data.message = "Drafting with AI…"; render(client, host);
      try { const result = await api(client.id, { kind: "generate", format: values.format, brief: values.brief }); data.forms.draft.content = result.content; data.message = "Draft ready. Review it, then save to share with the team."; }
      catch (error) { data.message = error.message; }
      finally { data.busy = false; if (cache.get(key) === data && state.selectedClientId === client.id) render(client, host); }
    });
    host.querySelectorAll("[data-artist-copy]").forEach((button) => { button.onclick = async () => { try { await navigator.clipboard.writeText(data.entries.find((d) => d.id === button.dataset.artistCopy).content); button.textContent = "Copied"; } catch { button.textContent = "Select the draft text to copy"; } }; });
    if (data.loading && !data.requested) {
      data.requested = true;
      api(client.id).then((result) => { data.entries = result.entries; data.aiReady = result.aiReady; }).catch((error) => { data.error = error.message; }).finally(() => { data.loading = false; data.loadedAt = Date.now(); if (cache.get(key) === data && state.selectedClientId === client.id) render(client, host); });
    }
  }
  window.addEventListener("beforeunload", (event) => { if ([...cache.values()].some((data) => Object.keys(data.forms).length)) { event.preventDefault(); event.returnValue = ""; } });
  window.renderArtistWorkspace = render;
  window.showArtistMeeting = () => window.showArtistTourTab(6);
  window.showArtistTourTab = (index) => {
    const client = getClient(state.selectedClientId) || state.clients[0];
    if (!client) return;
    state.selectedClientId = client.id;
    const key = `${state.teamUser?.email || state.teamUser?.owner || "session"}:${client.id}`;
    render(client, els.detail);
    cache.get(key).tab = index;
    render(client, els.detail);
  };
})();
