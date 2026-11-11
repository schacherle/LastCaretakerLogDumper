import { escapeHtml, formatDuration, clamp, trimmedSelectionText } from "../core/formatters.js";
import { state, currentSelectedEntryKey, SCOPE_TITLES } from "../state/store.js";
import { logPageKey } from "../domain/logs.js";
import { groupSubtitles, subtitlePartLabel, subtitlePageKey } from "../domain/subtitles.js";
import { sampleCode, sampleSiteLabel, sampleImageUrl } from "../domain/sampledata.js";
import { writeBrowseHash, browseShareUrl, getActiveDetailPane } from "../state/router.js";

export function currentFilterValue() {
  return document.getElementById("filter-input")?.value || "";
}

export function entryRowHtml(idx, title, badge, isSelected) {
  return `<div class="entry ${isSelected ? "selected" : ""}" data-idx="${idx}">
    <span class="entry-title">${escapeHtml(title) || "<em>(untitled)</em>"}</span>
    <span class="entry-badge">${escapeHtml(badge)}</span>
  </div>`;
}

export function setBrowseModeUi(scope) {
  const title = document.getElementById("list-screen-title");
  document.querySelectorAll("#browse-content-tabs .content-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.content === scope);
  });
  document.getElementById("logs-list").classList.toggle("hidden", scope !== "logs");
  document.getElementById("subs-list").classList.toggle("hidden", scope !== "subtitles");
  document.getElementById("sampledata-list").classList.toggle("hidden", scope !== "sampledata");
  document.getElementById("detail-pane").classList.toggle("hidden", scope === "sampledata");
  document.getElementById("sampledata-detail-pane").classList.toggle("hidden", scope !== "sampledata");
  document.getElementById("sampledata-content-tabs").classList.toggle("hidden", scope !== "sampledata");
  title.textContent = SCOPE_TITLES[scope];
}

export function setSampleScopeUi(scope) {
  document.querySelectorAll("#sampledata-content-tabs .content-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.content === scope);
  });
}

export function updateCopyLinkButton() {
  const btn = document.getElementById("copy-link-btn");
  if (!btn) return;
  const entryKey = currentSelectedEntryKey();
  btn.disabled = state.currentMode !== "browse" || !entryKey;
  btn.textContent = "COPY ENTRY LINK";
}

export function hideSelectionLinkButton() {
  state.activeSelectionContext = null;
  document.getElementById("selection-link-btn")?.classList.add("hidden");
}

export function getDetailSelectionContext() {
  if (state.currentMode !== "browse") return null;
  const pane = getActiveDetailPane();
  const selection = window.getSelection();
  if (!pane || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  if (!container || !pane.contains(container)) return null;

  const text = trimmedSelectionText(selection.toString());
  if (!text) return null;
  const pageEl = container.closest("[data-link-page]");
  return {
    page: pageEl?.dataset.linkPage || "",
    text,
  };
}

function selectionButtonRect(range) {
  const rects = Array.from(range.getClientRects());
  return rects[rects.length - 1] || range.getBoundingClientRect();
}

export function updateSelectionLinkButton() {
  const btn = document.getElementById("selection-link-btn");
  if (!btn) return;
  const selection = window.getSelection();
  const context = getDetailSelectionContext();
  if (state.currentMode !== "browse" || !context || !selection || selection.rangeCount === 0) {
    hideSelectionLinkButton();
    return;
  }

  state.activeSelectionContext = context;
  const rect = selectionButtonRect(selection.getRangeAt(0));
  if (!rect || (!rect.width && !rect.height)) {
    hideSelectionLinkButton();
    return;
  }

  btn.classList.remove("hidden");
  const margin = 10;
  const width = btn.offsetWidth;
  const height = btn.offsetHeight;
  const left = clamp(rect.right - width / 2, margin, window.innerWidth - width - margin);
  const top = clamp(rect.bottom + 8, margin, window.innerHeight - height - margin);
  btn.style.left = `${left}px`;
  btn.style.top = `${top}px`;
}

export function syncBrowseSelectionHash() {
  writeBrowseHash();
  updateCopyLinkButton();
  updateSelectionLinkButton();
}

export function renderBrowseLogs(filterText) {
  const term = (filterText || "").toLowerCase();
  state.filteredLogs = state.currentBrowseLogs.filter(
    (l) => !term || (l.title || "").toLowerCase().includes(term) || (l.id || "").toLowerCase().includes(term)
  );
  if (state.selectedLogKey) {
    const matchIdx = state.filteredLogs.findIndex((l) => l.id === state.selectedLogKey);
    if (matchIdx !== -1) state.selectedLogIdx = matchIdx;
  }
  if (state.selectedLogIdx >= state.filteredLogs.length) state.selectedLogIdx = state.filteredLogs.length ? 0 : -1;
  if (state.selectedLogIdx === -1 && state.filteredLogs.length) state.selectedLogIdx = 0;
  state.selectedLogKey = state.filteredLogs[state.selectedLogIdx]?.id || null;

  const container = document.getElementById("logs-list");
  container.innerHTML = state.filteredLogs.length
    ? state.filteredLogs
        .map((l, i) => {
          const count = (l.fragments || []).length;
          return entryRowHtml(i, l.title, `${count} ${count === 1 ? "PAGE" : "PAGES"}`, i === state.selectedLogIdx);
        })
        .join("")
    : `<p class="empty-note">No logs match your filter.</p>`;

  if (state.browseScope === "logs") {
    document.getElementById("list-count").textContent = `${state.filteredLogs.length}/${state.currentBrowseLogs.length}`;
    renderDetail();
    syncBrowseSelectionHash();
  }
}

export function renderBrowseSubs(filterText) {
  const term = (filterText || "").toLowerCase();
  const groups = groupSubtitles(state.currentBrowseSubs);
  state.filteredSubGroups = !term
    ? groups
    : groups.filter(
        (g) =>
          g.key.toLowerCase().includes(term) ||
          g.items.some((s) => (s.Name || "").toLowerCase().includes(term) || (s.Subtitle || "").toLowerCase().includes(term))
      );
  if (state.selectedSubKey) {
    const matchIdx = state.filteredSubGroups.findIndex((g) => g.key === state.selectedSubKey);
    if (matchIdx !== -1) state.selectedSubIdx = matchIdx;
  }
  if (state.selectedSubIdx >= state.filteredSubGroups.length) state.selectedSubIdx = state.filteredSubGroups.length ? 0 : -1;
  if (state.selectedSubIdx === -1 && state.filteredSubGroups.length) state.selectedSubIdx = 0;
  state.selectedSubKey = state.filteredSubGroups[state.selectedSubIdx]?.key || null;

  const container = document.getElementById("subs-list");
  container.innerHTML = state.filteredSubGroups.length
    ? state.filteredSubGroups
        .map((g, i) => {
          const count = g.items.length;
          return entryRowHtml(i, g.key, `${count} ${count === 1 ? "LINE" : "LINES"}`, i === state.selectedSubIdx);
        })
        .join("")
    : `<p class="empty-note">No subtitles match your filter.</p>`;

  if (state.browseScope === "subtitles") {
    document.getElementById("list-count").textContent = `${state.filteredSubGroups.length}/${groups.length}`;
    renderDetail();
    syncBrowseSelectionHash();
  }
}

export function renderLogDetail() {
  const pane = document.getElementById("detail-pane");
  const log = state.filteredLogs[state.selectedLogIdx];
  if (!log) {
    pane.innerHTML = `<p class="empty-note">Select an entry from the list.</p>`;
    return;
  }
  const fragments = (log.fragments || [])
    .map(
      (f, index) => `<div class="fragment" data-link-page="${escapeHtml(logPageKey(f, index))}">
        <div class="fragment-title">${escapeHtml(f.title)}</div>
        <p>${escapeHtml(f.description)}</p>
      </div>`
    )
    .join("");
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(log.title) || "(untitled)"} ${state.selectedLogIdx + 1}/${state.filteredLogs.length}</div>
    <div class="detail-head-2">${escapeHtml(log.id)}</div>
    ${log.description ? `<p class="detail-intro" data-link-page="intro">${escapeHtml(log.description)}</p>` : ""}
    ${fragments}
    ${log.footer ? `<p class="footer-text" data-link-page="footer">${escapeHtml(log.footer)}</p>` : ""}
  `;
}

export function renderSubDetail() {
  const pane = document.getElementById("detail-pane");
  const group = state.filteredSubGroups[state.selectedSubIdx];
  if (!group) {
    pane.innerHTML = `<p class="empty-note">Select an entry from the list.</p>`;
    return;
  }
  const lines = group.items
    .map(
      (s) => `<div class="fragment" data-link-page="${escapeHtml(subtitlePageKey(s))}">
        <div class="fragment-title">Part ${escapeHtml(subtitlePartLabel(s.Name)) || "?"} <span class="muted">${formatDuration(s.Duration)}</span></div>
        <p>${escapeHtml(s.Subtitle)}</p>
      </div>`
    )
    .join("");
  const count = group.items.length;
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(group.key)} ${state.selectedSubIdx + 1}/${state.filteredSubGroups.length}</div>
    <div class="detail-head-2">${count} ${count === 1 ? "line" : "lines"} · ${formatDuration(group.totalDuration)}</div>
    ${lines}
  `;
}

export function renderDetail() {
  if (state.browseScope === "logs") renderLogDetail();
  else if (state.browseScope === "subtitles") renderSubDetail();
}

export function renderSampleDetail() {
  const pane = document.getElementById("sampledata-detail-pane");
  const it = state.filteredSamples[state.selectedSampleIdx];
  if (!it) {
    pane.innerHTML = `<p class="empty-note">Select a record from the list.</p>`;
    return;
  }

  const imgUrl = sampleImageUrl(it, state.currentBrowseSha);
  const media = `
    <div class="framebuffer" id="sample-framebuffer">
      <img id="sample-image" src="${imgUrl}" alt="${escapeHtml(it.title)}" loading="lazy">
      <div class="framebuffer-cap">FRAMEBUFFER // ${sampleCode(it)}.CAP</div>
    </div>
    <div class="fb-missing hidden" id="sample-image-missing">[ NO CAPTURE ON RECORD ]<br>scan exists in log only — image was never recovered</div>
  `;

  const isUnlocked = state.unlockedSamples.has(it.id);
  let lockHtml;
  if (!it.unlock) {
    lockHtml = `<div class="lock-block">
      <div class="lock-line">&gt; memory status: <span class="muted">N/A</span></div>
      <p class="unlock-empty">No deeper memory was reconstructed from this scan.</p>
    </div>`;
  } else if (isUnlocked) {
    lockHtml = `<div class="lock-block">
      <div class="lock-line">&gt; decrypting payload...... <span class="ok-tag">[OK]</span></div>
      <div class="section-label">Unlocked memory</div>
      <p class="unlock-text">${escapeHtml(it.unlock)}</p>
    </div>`;
  } else {
    lockHtml = `<div class="lock-block">
      <div class="lock-line">&gt; memory status: <span class="locked-tag">LOCKED</span></div>
      <button class="device-btn unlock-btn" type="button" id="inline-unlock">Unlock memory</button>
    </div>`;
  }

  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(it.title)} ${state.selectedSampleIdx + 1}/${state.filteredSamples.length}</div>
    <div class="detail-head-2">${sampleCode(it)} · ${escapeHtml(sampleSiteLabel(it))}</div>
    ${media}
    <div class="section-label">Field reading</div>
    <p data-link-page="field-reading">${escapeHtml(it.short)}</p>
    ${lockHtml}
  `;

  const btn = document.getElementById("inline-unlock");
  if (btn) btn.addEventListener("click", () => unlockSample(it.id));

  const img = document.getElementById("sample-image");
  if (img) {
    img.addEventListener(
      "error",
      () => {
        document.getElementById("sample-framebuffer")?.classList.add("hidden");
        document.getElementById("sample-image-missing")?.classList.remove("hidden");
      },
      { once: true }
    );
  }
}

export function unlockSample(id) {
  const it = state.sampleData.find((s) => s.id === id);
  if (!it || !it.unlock) return;
  state.unlockedSamples.add(id);
  renderSampleDetail();
  syncBrowseSelectionHash();
}

export function renderSampleList(filterText) {
  const term = (filterText || "").toLowerCase();
  state.filteredSamples = state.sampleData.filter((it) => {
    const matchesScope = state.sampleScope === "all" || it.collection === state.sampleScope;
    const hay = `${it.title} ${it.short} ${it.site || ""}`.toLowerCase();
    const matchesTerm = !term || hay.includes(term);
    return matchesScope && matchesTerm;
  });
  if (state.selectedSampleKey) {
    const matchIdx = state.filteredSamples.findIndex((it) => it.id === state.selectedSampleKey);
    if (matchIdx !== -1) state.selectedSampleIdx = matchIdx;
  }
  if (state.selectedSampleIdx >= state.filteredSamples.length) state.selectedSampleIdx = state.filteredSamples.length ? 0 : -1;
  if (state.selectedSampleIdx === -1 && state.filteredSamples.length) state.selectedSampleIdx = 0;
  state.selectedSampleKey = state.filteredSamples[state.selectedSampleIdx]?.id || null;

  const container = document.getElementById("sampledata-list");
  container.innerHTML = state.filteredSamples.length
    ? state.filteredSamples
        .map((it, i) => entryRowHtml(i, it.title, sampleCode(it), i === state.selectedSampleIdx))
        .join("")
    : `<p class="empty-note">No sample data matches your filter.</p>`;

  if (state.browseScope === "sampledata") {
    document.getElementById("list-count").textContent = `${state.filteredSamples.length}/${state.sampleData.length}`;
    renderSampleDetail();
    syncBrowseSelectionHash();
  }
}

export function applyBrowseScope(scope, options = {}) {
  if (!SCOPE_TITLES[scope]) return;
  const { resetFilter = true } = options;
  state.browseScope = scope;
  setBrowseModeUi(scope);

  const filterInput = document.getElementById("filter-input");
  if (resetFilter) filterInput.value = "";
  filterInput.placeholder = state.browseScope === "sampledata" ? "type to filter sample data…" : "type to filter…";

  renderBrowseLogs(currentFilterValue());
  renderBrowseSubs(currentFilterValue());
  renderSampleList(currentFilterValue());
  updateCopyLinkButton();
}

export function applySampleScope(scope, options = {}) {
  if (!["all", "field", "cave"].includes(scope)) return;
  const { resetFilter = true } = options;
  state.sampleScope = scope;
  setSampleScopeUi(scope);
  if (resetFilter) document.getElementById("filter-input").value = "";
  renderSampleList(currentFilterValue());
}

export function scrollSelectedEntryIntoView() {
  if (state.browseScope === "logs") document.querySelector("#logs-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  else if (state.browseScope === "subtitles") document.querySelector("#subs-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  else document.querySelector("#sampledata-list .entry.selected")?.scrollIntoView({ block: "nearest" });
}

export function selectBrowseEntryByKey(scope, key) {
  if (!key) return false;
  if (scope === "logs") {
    state.selectedLogKey = key;
    renderBrowseLogs(currentFilterValue());
    return !!state.filteredLogs[state.selectedLogIdx] && state.filteredLogs[state.selectedLogIdx].id === key;
  }
  if (scope === "subtitles") {
    state.selectedSubKey = key;
    renderBrowseSubs(currentFilterValue());
    return !!state.filteredSubGroups[state.selectedSubIdx] && state.filteredSubGroups[state.selectedSubIdx].key === key;
  }
  state.selectedSampleKey = key;
  renderSampleList(currentFilterValue());
  return !!state.filteredSamples[state.selectedSampleIdx] && state.filteredSamples[state.selectedSampleIdx].id === key;
}

export function currentEntryShareUrl() {
  return browseShareUrl();
}

export function currentSelectionShareUrl() {
  return browseShareUrl(state.activeSelectionContext || getDetailSelectionContext() || {});
}
