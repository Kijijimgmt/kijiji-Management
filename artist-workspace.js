/* Artist workspace: uses the portal's authenticated API and existing record editors. */
(() => {
  const tabs = ["Overview", "Tasks", "Events & tickets", "Socials", "Marketing", "Files"];
  const cache = new Map();
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
    const oldLegacy = host.querySelector("[data-artist-legacy]");
    const legacy = oldLegacy ? Array.from(oldLegacy.children).filter((node) => node.tagName !== "SUMMARY").map((node) => node.outerHTML).join("") : host.innerHTML;
    const profile = data.entries.find((item) => item.kind === "profile") || {};
    const photo = safeUrl(profile.photo) || photos[client.name.toLowerCase()];
    host.innerHTML = `<div class="artist-header">${photo ? `<img src="${e(photo)}" alt="${e(client.name)}" class="artist-portrait">` : `<span class="artist-avatar" aria-hidden="true">${e(client.name.slice(0, 1))}</span>`}<div><p class="eyebrow">Artist workspace</p><h2>${e(client.name)}</h2><p>${e(client.category || "Talent")} · ${e(client.owner || "Assign a team member")}</p></div><span class="status-pill">${e(client.status)}</span></div>
      <nav class="artist-tabs" aria-label="Artist profile sections">${tabs.map((tab, index) => `<button type="button" data-artist-tab="${index}" aria-current="${index === data.tab ? "page" : "false"}">${tab}</button>`).join("")}</nav>
      <p class="artist-message" role="status">${e(data.message || "")}</p><div data-artist-content></div><details data-artist-legacy ${data.tab === 0 ? "" : "hidden"}><summary>Client details & full roadmap</summary>${legacy}</details>`;
    const panel = host.querySelector("[data-artist-content]");
    const tasks = getRelated(state.actions, client.id);
    const events = getRelated(state.events, client.id);
    const files = state.documents.filter((item) => item.clientIds?.includes(client.id));
    const stats = data.entries.filter((item) => item.kind === "social").sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const tickets = data.entries.filter((item) => item.kind === "tickets").sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    if (data.tab === 0) {
      panel.innerHTML = `<div class="artist-metrics">${metric("Open tasks", tasks.filter((t) => !isComplete(t)).length)}${metric("Linked events", events.length)}${metric("Shared files", files.length)}</div><section class="artist-section"><h3>Current priority</h3><p>${e(client.nextAction || "Add a next move in client details below.")}</p><h3>About ${e(client.name)}</h3><p class="artist-prewrap">${e(profile.bio || "Add a short bio and official links so the team has a shared starting point.")}</p><div class="artist-links">${["website", "instagram", "tiktok", "youtube"].filter((name) => safeUrl(profile[name])).map((name) => `<a href="${e(profile[name])}" target="_blank" rel="noopener noreferrer">${name} ↗</a>`).join("")}</div></section>${form("profile", "Edit bio, photo & official links", area("bio", "Artist bio", profile.bio) + input("photo", "Photo URL (https)", profile.photo, "url") + ["website", "instagram", "tiktok", "youtube"].map((name) => input(name, name[0].toUpperCase() + name.slice(1) + " URL", profile[name], "url")).join(""))}`;
    } else if (data.tab === 1) {
      panel.innerHTML = `<div class="artist-section-head"><h3>Artist tasks</h3><button class="button button-primary" data-roadmap-add-task="${e(client.id)}">Add task</button></div>${tasks.length ? tasks.map((task) => `<button class="artist-record" data-jump-action="${e(task.id)}"><strong>${e(task.name || task.title)}</strong><span>${e(task.status)} · ${e(task.owner || "Unassigned")} · ${e(formatDate(task.dueDate))}</span></button>`).join("") : empty("No tasks yet. Add the first next step for this artist.")}`;
    } else if (data.tab === 2) {
      panel.innerHTML = `<div class="artist-section-head"><h3>Events & ticket sales</h3><button class="button button-primary" data-artist-add-event>Add event</button></div><p>Sales are entered manually. Connect your ticket provider later.</p>${events.map((event) => {
        const ticket = tickets.find((item) => item.eventId === event.id);
        return `<article class="artist-section"><button class="artist-record" data-jump-event="${e(event.id)}"><strong>${e(event.name)}</strong><span>${e(formatDate(event.date))} · ${e(event.status)}</span></button>${ticket ? `<div class="artist-metrics">${metric("Tickets sold", ticket.sold)}${metric("Remaining capacity", ticket.capacity == null ? null : ticket.capacity - ticket.sold)}${metric(`Revenue (${ticket.currency})`, ticket.revenue)}</div>${entryStamp(ticket)}${safeUrl(ticket.ticketUrl) ? `<p><a href="${e(ticket.ticketUrl)}" target="_blank" rel="noopener noreferrer">Open ticket page ↗</a></p>` : ""}` : empty("No sales entered yet.")}</article>`;
      }).join("") || empty("Add an event before recording ticket sales.")}${events.length ? form("tickets", "Record a sales update", select("eventId", "Event", events.map((event) => [event.id, event.name])) + input("date", "As of", todayValue(), "date", "required") + input("sold", "Total tickets sold", "", "number", 'required min="0" step="1"') + input("capacity", "Event capacity (optional)", "", "number", 'min="0" step="1"') + input("revenue", "Total revenue (optional)", "", "number", 'min="0" step="0.01"') + select("currency", "Currency", ["USD", "CAD", "GBP", "EUR"].map((v) => [v,v])) + input("ticketUrl", "Ticket page (optional)", "", "url")) : ""}${tickets.length ? `<details class="artist-editor"><summary>Sales history</summary>${tickets.map((t) => `<p>${e(t.eventName)} · ${t.sold} sold · ${t.revenue == null ? "Revenue not entered" : e(t.currency + " " + t.revenue)}<br>${entryStamp(t)}</p>`).join("")}</details>` : ""}`;
    } else if (data.tab === 3) {
      panel.innerHTML = `<h3>Social performance</h3><p>Manual snapshots, with the date and source visible. Blank metrics mean not entered.</p>${[...new Set(stats.map((s) => s.platform))].map((platform) => { const item = stats.find((s) => s.platform === platform); return `<article class="artist-section"><h4>${e(platform)}</h4><div class="artist-metrics">${metric("Followers / listeners", item.followers)}${metric("Views", item.views)}${metric("Engagement", item.engagement, "%")}</div>${entryStamp(item)}<p>${e(item.notes)}</p></article>`; }).join("") || empty("No social metrics yet. Add your first snapshot below.")}${form("social", "Add social metrics", select("platform", "Platform", ["Instagram", "TikTok", "YouTube", "Facebook", "Spotify"].map((v) => [v,v])) + input("date", "As of", todayValue(), "date", "required") + input("followers", "Followers / monthly listeners", "", "number", 'min="0" step="1"') + input("views", "Views", "", "number", 'min="0" step="1"') + input("engagement", "Engagement rate (%)", "", "number", 'min="0" max="100" step="0.01"') + area("notes", "Source & measurement period (e.g. Instagram, last 30 days)", "", 1000))}${stats.length ? `<details class="artist-editor"><summary>Snapshot history</summary>${stats.map((s) => `<p>${e(s.platform)} · ${s.followers == null ? "Followers not entered" : e(s.followers) + " followers/listeners"} · ${s.views == null ? "Views not entered" : e(s.views) + " views"}<br>${entryStamp(s)}</p>`).join("")}</details>` : ""}`;
    } else if (data.tab === 4) {
      const drafts = data.entries.filter((item) => item.kind === "draft");
      panel.innerHTML = `<h3>Marketing studio</h3><p>Create emails, captions, and campaign plans for ${e(client.name)}. Saved drafts are shared with partners who can access this artist.</p><p class="artist-notice">${data.aiReady ? "AI drafting is connected. Review facts and wording before using a draft." : "AI is not connected yet. You can write and save drafts now."} Email sending and social publishing are not connected.</p>${form("draft", "Create a marketing draft", select("format", "Content type", ["Email", "Social captions", "Marketing plan", "Activity summary"].map((v) => [v,v])) + input("title", "Campaign / draft title", "", "text", 'required maxlength="200"') + area("brief", "Brief for AI (goal, audience, tone, dates)") + `<div class="artist-wide"><button type="button" class="button button-secondary" data-artist-generate ${data.aiReady ? "" : "disabled"}>Draft with AI</button><small> Uses the brief, artist bio, priorities, events, and manual metrics.</small></div>` + area("content", "Draft content — review and edit before saving", "", 10000))}<h4>Saved drafts</h4>${drafts.map((draft) => `<details class="artist-editor"><summary>${e(draft.title)} · ${e(draft.format)}</summary><small>${e(draft.author)} · ${e(draft.createdAt?.slice(0,10))}</small><pre class="artist-draft">${e(draft.content)}</pre><button class="button button-secondary" data-artist-copy="${e(draft.id)}">Copy draft</button></details>`).join("") || empty("No marketing drafts yet.")}`;
    } else {
      panel.innerHTML = `<div class="artist-section-head"><h3>Artist files & brand kit</h3><button class="button button-primary" data-artist-files>Open artist folder</button></div><p>Keep logos, brand guides, contracts, and campaign assets together.</p>${files.map((file) => `<article class="artist-record"><strong>${e(file.name)}</strong><span>${e(file.category)}</span>${safeUrl(file.fileUrl) ? `<a href="${e(file.fileUrl)}" target="_blank" rel="noopener noreferrer">Open file ↗</a>` : ""}</article>`).join("") || empty("No linked files yet. Open the artist folder to upload the first file.")}`;
    }
    if (data.loading || data.error) {
      const notice = document.createElement("p"); notice.className = "artist-notice"; notice.textContent = data.loading ? "Loading shared artist profile…" : data.error; panel.prepend(notice);
      if (data.error) { const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "Retry loading"; retry.className = "button button-secondary"; retry.onclick = () => { data.error = ""; data.loading = true; data.requested = false; render(client, host); }; notice.append(" ", retry); }
    }
    panel.querySelectorAll("form").forEach((f) => {
      const saved = data.forms[f.dataset.artistForm];
      if (saved) { Object.entries(saved).forEach(([name, value]) => { if (f.elements[name]) f.elements[name].value = value; }); f.closest("details").open = true; }
      f.querySelectorAll("button").forEach((b) => { b.disabled = data.loading || Boolean(data.error) || data.busy || (b.hasAttribute("data-artist-generate") && !data.aiReady); });
      f.querySelectorAll("input, select, textarea").forEach((field) => { field.disabled = Boolean(data.busy); });
      f.oninput = () => { data.forms[f.dataset.artistForm] = Object.fromEntries(new FormData(f)); };
      f.onsubmit = async (event) => {
        event.preventDefault(); if (data.busy) return;
        const body = { ...Object.fromEntries(new FormData(f)), kind: f.dataset.artistForm };
        data.forms[body.kind] = Object.fromEntries(new FormData(f));
        data.busy = true; data.message = "Saving…"; render(client, host);
        try { const result = await api(client.id, body); data.entries.unshift(result.entry); delete data.forms[body.kind]; data.message = "Saved to the shared artist profile."; }
        catch (error) { data.message = error.message; }
        finally { data.busy = false; if (cache.get(key) === data && state.selectedClientId === client.id) render(client, host); }
      };
    });
    host.querySelectorAll("[data-artist-tab]").forEach((button) => { button.onclick = () => { data.tab = Number(button.dataset.artistTab); render(client, host); host.querySelector(`[data-artist-tab="${data.tab}"]`).focus(); }; });
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
})();
