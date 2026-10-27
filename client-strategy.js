(() => {
  let generation = 0;
  const e = (value) => escapeHtml(value == null ? "" : String(value));
  const dialog = document.createElement("dialog");
  dialog.className = "strategy-dialog";
  dialog.setAttribute("aria-labelledby", "strategy-heading");
  document.body.append(dialog);
  let selectedClient = "", submissionId = "", data = null, pending = false, message = "", trigger = null;
  const api = async (body) => {
    const response = await fetch(`/api/notion-clients?view=strategy&clientId=${encodeURIComponent(selectedClient)}`, { method: body ? "POST" : "GET", headers: getRequestHeaders(), ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await parseJsonResponse(response);
    if (!response.ok) throw new Error(result.message || "Unable to load shared strategy.");
    return result;
  };
  const busy = () => pending || (data?.busyUntil && new Date(data.busyUntil).getTime() > Date.now());
  function render() {
    const versions = data?.versions || [];
    const current = versions.find((v) => v.id === data.currentId);
    const initial = versions.find((v) => v.kind === "initial");
    const formatDate = (value) => new Date(value).toLocaleString();
    const card = (v) => {
      const status = v.id === data.currentId ? "CURRENT PLAN" : v.kind === "client" ? (v.base_id === data.currentId ? "CLIENT-FACING DRAFT · REVIEW BEFORE SHARING" : "OLDER CLIENT-FACING DRAFT") : v.approved_at ? "PREVIOUSLY APPROVED" : "PROPOSAL · NOT APPROVED";
      return `<details class="strategy-version" ${v.id === data.currentId || (!current && v === initial) ? "open" : ""}><summary>${e(status)} · ${e(v.kind)} · ${e(formatDate(v.created_at))}</summary><p>Created by ${e(v.created_by)} · Assessment ${e(v.submission_id)}${v.approved_by ? ` · Approved by ${e(v.approved_by)} on ${e(formatDate(v.approved_at))}` : ""}</p><p>Version ${e(v.id.slice(0,8))}${v.base_id ? ` · Based on ${e(v.base_id.slice(0,8))}` : ""}</p><div class="strategy-copy">${e(v.content)}</div>${v.citations.length ? `<h4>Research sources</h4><ul>${v.citations.filter((c) => /^https:\/\//.test(c.url)).map((c) => `<li><a href="${e(c.url)}" target="_blank" rel="noopener noreferrer">${e(c.title)}</a></li>`).join("")}</ul><small>Research retrieved ${e(formatDate(v.created_at))}; publication dates appear in the plan where available.</small>` : ""}<div class="strategy-actions"><button type="button" class="button button-secondary" data-strategy-copy="${e(v.id)}">Copy text</button>${data.canApprove && v.kind !== "client" && !v.approved_at && (v.base_id || null) === data.currentId ? `<button type="button" class="button button-primary" data-strategy-approve="${e(v.id)}" ${busy() ? "disabled" : ""}>Approve as Current Plan</button>` : ""}</div></details>`;
    };
    dialog.innerHTML = `<header class="strategy-head"><div><p class="eyebrow">Shared management strategy</p><h2 id="strategy-heading">One client. One Current Plan.</h2></div><button type="button" class="button button-secondary" data-strategy-close>Close</button></header><p>Start from the client's answers and current capabilities. Proposals and creative alternatives never replace an approved plan automatically.</p><label class="strategy-client-label">Client this assessment belongs to<select data-strategy-client ${pending ? "disabled" : ""}><option value="">Choose the correct client…</option>${state.clients.map((c) => `<option value="${e(c.id)}" ${c.id === selectedClient ? "selected" : ""}>${e(c.name)}</option>`).join("")}</select></label><p class="strategy-message" role="status">${e(message)}</p>${selectedClient && data ? `<div class="strategy-notice">${busy() ? "A team member is generating a strategy. Use Refresh shared plan to check progress. If interrupted, generation unlocks after three minutes." : current ? `Current Plan: ${e(current.id.slice(0,8))}. New ideas stay proposals until Max approves them.` : initial ? "The shared draft is ready for review. Max can approve it as the Current Plan." : "No shared strategy yet. Generate once; every partner opens the same saved result."}${!data.aiReady ? " AI setup is still needed to generate new content." : ""}</div><div class="strategy-actions"><button type="button" class="button button-secondary" data-strategy-refresh ${pending ? "disabled" : ""}>Refresh shared plan</button>${!initial ? `<button type="button" class="button button-primary" data-strategy-action="initial" ${busy() || !data.aiReady ? "disabled" : ""}>Build Client Strategy</button>` : ""}${current ? `<button type="button" class="button button-secondary" data-strategy-action="client" ${busy() || !data.aiReady ? "disabled" : ""}>Create client-facing draft</button>` : ""}</div>${current ? `<label>What changed, or what alternative should we explore?<textarea data-strategy-direction rows="3" maxlength="2000" placeholder="New results, constraints, overlooked audiences, or an assumption to challenge"></textarea></label><div class="strategy-actions"><button class="button button-secondary" type="button" data-strategy-action="revision" ${busy() || !data.aiReady ? "disabled" : ""}>Propose an update</button><button class="button button-secondary" type="button" data-strategy-action="alternative" ${busy() || !data.aiReady ? "disabled" : ""}>Explore another approach</button></div>` : ""}<p class="strategy-notice">Internal assessment: review facts and assumptions before approving. Client-facing drafts are never sent automatically. No tasks or spending commitments are created by these buttons.</p>${current ? card(current) : ""}${versions.filter((v) => v.id !== data.currentId).map(card).join("")}` : ""}`;
    if (selectedClient && !data && !pending) {
      const retry = document.createElement("button");
      retry.type = "button"; retry.className = "button button-secondary";
      retry.textContent = "Retry loading shared plan"; retry.onclick = refresh;
      dialog.append(retry);
    }
    dialog.querySelector("[data-strategy-close]").onclick = () => dialog.close();
    dialog.querySelector("[data-strategy-client]").onchange = (event) => { selectedClient = event.target.value; data = null; message = ""; if (selectedClient) refresh(); else render(); };
    dialog.querySelector("[data-strategy-refresh]")?.addEventListener("click", refresh);
    dialog.querySelectorAll("[data-strategy-action]").forEach((button) => { button.onclick = () => perform(button.dataset.strategyAction); });
    dialog.querySelectorAll("[data-strategy-approve]").forEach((button) => { button.onclick = () => { if (confirm("Make this proposal the shared Current Plan for this client? The previous version stays in history.")) perform("approve", button.dataset.strategyApprove); }; });
    dialog.querySelectorAll("[data-strategy-copy]").forEach((button) => { button.onclick = async () => { try { const v = versions.find((v) => v.id === button.dataset.strategyCopy); await navigator.clipboard.writeText(v.content + "\n\n" + v.citations.map((c) => `${c.title}: ${c.url}`).join("\n")); button.textContent = "Copied"; } catch { button.textContent = "Select text to copy"; } }; });
  }
  async function refresh() {
    const ticket = ++generation;
    pending = true; message = "Loading the shared plan…"; render();
    try { const result = await api(); if (ticket === generation) { data = result; message = ""; } }
    catch (error) { if (ticket === generation) message = error.message; }
    finally { if (ticket === generation) { pending = false; render(); } }
  }
  async function perform(action, versionId) {
    if (busy()) return;
    const direction = dialog.querySelector("[data-strategy-direction]")?.value || "";
    if (["revision", "alternative"].includes(action) && !direction.trim()) { dialog.querySelector("[data-strategy-direction]").focus(); return; }
    const ticket = ++generation;
    pending = true; message = action === "approve" ? "Saving approval…" : "Researching and building the shared draft. This can take about a minute…"; render();
    try { const result = await api({ action, submissionId, direction, versionId, expectedCurrentId: data.currentId }); if (ticket === generation) { data = result; message = action === "approve" ? "Current Plan approved for the team." : "Shared plan refreshed. Review the saved version below."; } }
    catch (error) { if (ticket === generation) message = error.message; }
    finally { if (ticket === generation) { pending = false; render(); const field = dialog.querySelector("[data-strategy-direction]"); if (field) field.value = direction; } }
  }
  dialog.addEventListener("close", () => { generation++; pending = false; trigger?.focus(); });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-build-strategy]");
    if (!button) return;
    trigger = button; submissionId = button.dataset.buildStrategy; selectedClient = ""; data = null; message = "Choose the correct client to open their shared plan. Selecting a client does not change the assessment.";
    render(); dialog.showModal();
  });
})();
