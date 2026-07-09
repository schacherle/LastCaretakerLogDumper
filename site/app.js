"use strict";

const REPO = "schacherle/LastCaretakerLogDumper";
const PATHS = {
  logs: "voyage_logs_dump.json",
  subtitles: "voyage_quest_subtitles_dump.json",
};

const fileCache = new Map(); // `${sha}:${path}` -> parsed json | null (missing)

let versions = []; // [{ sha, message, date }], newest first
let currentBrowseLogs = [];
let currentBrowseSubs = [];
let filteredLogs = [];
let filteredSubs = [];

let currentMode = "browse"; // "browse" | "compare"
let browseScope = "logs"; // "logs" | "subtitles"
let compareScope = "logs"; // "logs" | "subtitles"
let selectedLogIdx = -1;
let selectedSubIdx = -1;

let displayOn = true;
let brt = 100, con = 100, sat = 100;

// ---------- helpers ----------

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDuration(d) {
  return typeof d === "number" ? `${d.toFixed(1)}s` : "";
}

function formatDate(iso) {
  return iso ? iso.slice(0, 10) : "";
}

function firstLine(msg) {
  const line = (msg || "").split("\n")[0];
  return line.length > 70 ? line.slice(0, 67) + "…" : line;
}

function setStatus(text, isError) {
  const el = document.getElementById("status");
  if (!text) {
    el.classList.add("hidden");
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("error", !!isError);
}

function decodeArrayBuffer(buf) {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf.slice(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf.slice(2));
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buf.slice(3));
  }
  return new TextDecoder("utf-8").decode(buf);
}

async function fetchFileAtSha(path, sha) {
  const key = `${sha}:${path}`;
  if (fileCache.has(key)) return fileCache.get(key);
  const url = `https://raw.githubusercontent.com/${REPO}/${sha}/${path}`;
  const res = await fetch(url);
  if (res.status === 404) {
    fileCache.set(key, null);
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path} @ ${sha.slice(0, 7)} (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  const json = JSON.parse(decodeArrayBuffer(buf));
  fileCache.set(key, json);
  return json;
}

function normalizeLogs(json) {
  if (!json) return { buildNumber: null, logs: [] };
  if (Array.isArray(json)) return { buildNumber: null, logs: json };
  return { buildNumber: json.build_number || null, logs: json.data || [] };
}

function normalizeSubtitles(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  return json.data || [];
}

// ---------- commit history ----------

async function fetchCommitsForPath(path) {
  const url = `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(path)}&per_page=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to list commits for ${path} (${res.status})`);
  const data = await res.json();
  return data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    date: c.commit.author?.date || c.commit.committer?.date,
  }));
}

async function buildVersionList() {
  const [logCommits, subCommits] = await Promise.all([
    fetchCommitsForPath(PATHS.logs),
    fetchCommitsForPath(PATHS.subtitles),
  ]);
  const bySha = new Map();
  for (const c of [...logCommits, ...subCommits]) {
    if (!bySha.has(c.sha)) bySha.set(c.sha, c);
  }
  return [...bySha.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function populateVersionSelects() {
  const optionsHtml = versions
    .map((v) => `<option value="${v.sha}">${escapeHtml(formatDate(v.date))} · ${escapeHtml(firstLine(v.message))} (${v.sha.slice(0, 7)})</option>`)
    .join("");
  for (const id of ["browse-version", "compare-from", "compare-to"]) {
    document.getElementById(id).innerHTML = optionsHtml;
  }
  document.getElementById("browse-version").value = versions[0].sha;
  document.getElementById("compare-to").value = versions[0].sha;
  document.getElementById("compare-from").value = (versions[1] || versions[0]).sha;
}

// ---------- browse: master list rendering ----------

function entryRowHtml(idx, title, badge, isSelected) {
  return `<div class="entry ${isSelected ? "selected" : ""}" data-idx="${idx}">
    <span class="entry-title">${escapeHtml(title) || "<em>(untitled)</em>"}</span>
    <span class="entry-badge">${escapeHtml(badge)}</span>
  </div>`;
}

function renderBrowseLogs(filterText) {
  const term = (filterText || "").toLowerCase();
  filteredLogs = currentBrowseLogs.filter(
    (l) => !term || (l.title || "").toLowerCase().includes(term) || (l.id || "").toLowerCase().includes(term)
  );
  if (selectedLogIdx >= filteredLogs.length) selectedLogIdx = filteredLogs.length ? 0 : -1;
  if (selectedLogIdx === -1 && filteredLogs.length) selectedLogIdx = 0;

  const container = document.getElementById("logs-list");
  container.innerHTML = filteredLogs.length
    ? filteredLogs
        .map((l, i) => {
          const count = (l.fragments || []).length;
          return entryRowHtml(i, l.title, `${count} ${count === 1 ? "PAGE" : "PAGES"}`, i === selectedLogIdx);
        })
        .join("")
    : `<p class="empty-note">No logs match your filter.</p>`;

  if (browseScope === "logs") renderDetail();
}

function renderBrowseSubs(filterText) {
  const term = (filterText || "").toLowerCase();
  filteredSubs = currentBrowseSubs.filter(
    (s) => !term || (s.Name || "").toLowerCase().includes(term) || (s.Subtitle || "").toLowerCase().includes(term)
  );
  if (selectedSubIdx >= filteredSubs.length) selectedSubIdx = filteredSubs.length ? 0 : -1;
  if (selectedSubIdx === -1 && filteredSubs.length) selectedSubIdx = 0;

  const container = document.getElementById("subs-list");
  container.innerHTML = filteredSubs.length
    ? filteredSubs.map((s, i) => entryRowHtml(i, s.Name, formatDuration(s.Duration), i === selectedSubIdx)).join("")
    : `<p class="empty-note">No subtitles match your filter.</p>`;

  if (browseScope === "subtitles") renderDetail();
}

// ---------- browse: detail pane rendering ----------

function renderLogDetail() {
  const pane = document.getElementById("detail-pane");
  const log = filteredLogs[selectedLogIdx];
  if (!log) {
    pane.innerHTML = `<p class="empty-note">Select an entry from the list.</p>`;
    return;
  }
  const fragments = (log.fragments || [])
    .map(
      (f) => `<div class="fragment">
        <div class="fragment-title">${escapeHtml(f.title)}</div>
        <p>${escapeHtml(f.description)}</p>
      </div>`
    )
    .join("");
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(log.title) || "(untitled)"} ${selectedLogIdx + 1}/${filteredLogs.length}</div>
    <div class="detail-head-2">${escapeHtml(log.id)}</div>
    ${log.description ? `<p class="detail-intro">${escapeHtml(log.description)}</p>` : ""}
    ${fragments}
    ${log.footer ? `<p class="footer-text">${escapeHtml(log.footer)}</p>` : ""}
  `;
}

function renderSubDetail() {
  const pane = document.getElementById("detail-pane");
  const sub = filteredSubs[selectedSubIdx];
  if (!sub) {
    pane.innerHTML = `<p class="empty-note">Select an entry from the list.</p>`;
    return;
  }
  pane.innerHTML = `
    <div class="detail-head-1">${escapeHtml(sub.Name)} ${selectedSubIdx + 1}/${filteredSubs.length}</div>
    <div class="detail-head-2">${formatDuration(sub.Duration)}</div>
    <p>${escapeHtml(sub.Subtitle)}</p>
  `;
}

function renderDetail() {
  if (browseScope === "logs") renderLogDetail();
  else renderSubDetail();
}

async function loadBrowseVersion(sha) {
  setStatus("Loading version…");
  try {
    const [logsJson, subsJson] = await Promise.all([
      fetchFileAtSha(PATHS.logs, sha),
      fetchFileAtSha(PATHS.subtitles, sha),
    ]);
    const { buildNumber, logs } = normalizeLogs(logsJson);
    currentBrowseLogs = logs;
    currentBrowseSubs = normalizeSubtitles(subsJson);
    selectedLogIdx = -1;
    selectedSubIdx = -1;

    const badge = document.getElementById("browse-build");
    if (buildNumber) {
      badge.textContent = `Build ${buildNumber}`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }

    renderBrowseLogs(document.getElementById("filter-input").value);
    renderBrowseSubs(document.getElementById("filter-input").value);
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  }
}

// ---------- diffing ----------

function renderWordDiff(oldText, newText) {
  oldText = oldText || "";
  newText = newText || "";
  if (oldText === newText) return escapeHtml(newText);
  if (typeof Diff === "undefined") {
    return `${escapeHtml(oldText)} → ${escapeHtml(newText)}`;
  }
  return Diff.diffWords(oldText, newText)
    .map((part) => {
      const text = escapeHtml(part.value);
      if (part.added) return `<ins class="diff-ins">${text}</ins>`;
      if (part.removed) return `<del class="diff-del">${text}</del>`;
      return text;
    })
    .join("");
}

function diffByKey(fromList, toList, keyFn) {
  const fromMap = new Map(fromList.map((x) => [keyFn(x), x]));
  const toMap = new Map(toList.map((x) => [keyFn(x), x]));
  const added = [...toMap.keys()].filter((k) => !fromMap.has(k)).map((k) => toMap.get(k));
  const removed = [...fromMap.keys()].filter((k) => !toMap.has(k)).map((k) => fromMap.get(k));
  const changed = [];
  for (const k of toMap.keys()) {
    if (!fromMap.has(k)) continue;
    const a = fromMap.get(k);
    const b = toMap.get(k);
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push({ key: k, from: a, to: b });
  }
  return { added, removed, changed };
}

function renderFragmentDiff(fromLog, toLog) {
  const { added, removed, changed } = diffByKey(fromLog.fragments || [], toLog.fragments || [], (f) => f.id);
  if (!added.length && !removed.length && !changed.length) return "";
  const parts = [];
  for (const f of added) parts.push(`<div class="fragment"><span class="diff-tag added">New fragment</span><div class="fragment-title">${escapeHtml(f.title)}</div><p>${escapeHtml(f.description)}</p></div>`);
  for (const f of removed) parts.push(`<div class="fragment"><span class="diff-tag removed">Removed fragment</span><div class="fragment-title">${escapeHtml(f.title)}</div></div>`);
  for (const { from, to } of changed) {
    parts.push(`<div class="fragment"><span class="diff-tag changed">Changed fragment</span>
      <div class="fragment-title">${renderWordDiff(from.title, to.title)}</div>
      <p>${renderWordDiff(from.description, to.description)}</p>
    </div>`);
  }
  return parts.join("");
}

function renderLogDiffCard(kind, log) {
  if (kind === "added") {
    return `<div class="diff-card added"><span class="diff-tag added">Added</span><span class="id-tag">${escapeHtml(log.id)}</span>
      <div class="fragment-title" style="margin-top:.4rem">${escapeHtml(log.title)}</div>
      <p>${escapeHtml(log.description)}</p></div>`;
  }
  if (kind === "removed") {
    return `<div class="diff-card removed"><span class="diff-tag removed">Removed</span><span class="id-tag">${escapeHtml(log.id)}</span>
      <div class="fragment-title" style="margin-top:.4rem">${escapeHtml(log.title)}</div></div>`;
  }
  // changed
  const titleChanged = log.from.title !== log.to.title;
  const descChanged = log.from.description !== log.to.description;
  const footerChanged = log.from.footer !== log.to.footer;
  return `<div class="diff-card changed"><span class="diff-tag changed">Changed</span><span class="id-tag">${escapeHtml(log.to.id)}</span>
    <div class="fragment-title" style="margin-top:.4rem">${titleChanged ? renderWordDiff(log.from.title, log.to.title) : escapeHtml(log.to.title)}</div>
    ${descChanged ? `<p>${renderWordDiff(log.from.description, log.to.description)}</p>` : ""}
    ${footerChanged ? `<p class="footer-text">${renderWordDiff(log.from.footer, log.to.footer)}</p>` : ""}
    ${renderFragmentDiff(log.from, log.to)}
  </div>`;
}

function renderLogsDiff(fromLogs, toLogs) {
  const { added, removed, changed } = diffByKey(fromLogs, toLogs, (l) => l.id);
  const container = document.getElementById("compare-logs");
  if (!added.length && !removed.length && !changed.length) {
    container.innerHTML = `<p class="empty-note">No differences in voyage logs between these versions.</p>`;
    return;
  }
  let html = "";
  if (added.length) {
    html += `<div class="section-heading">Added (${added.length})</div>`;
    html += added.map((l) => renderLogDiffCard("added", l)).join("");
  }
  if (changed.length) {
    html += `<div class="section-heading">Changed (${changed.length})</div>`;
    html += changed.map((c) => renderLogDiffCard("changed", c)).join("");
  }
  if (removed.length) {
    html += `<div class="section-heading">Removed (${removed.length})</div>`;
    html += removed.map((l) => renderLogDiffCard("removed", l)).join("");
  }
  container.innerHTML = html;
}

function renderSubDiffCard(kind, item) {
  if (kind === "added") {
    return `<div class="diff-card added"><span class="diff-tag added">Added</span><span class="id-tag">${escapeHtml(item.Name)}</span> ${formatDuration(item.Duration)}
      <p>${escapeHtml(item.Subtitle)}</p></div>`;
  }
  if (kind === "removed") {
    return `<div class="diff-card removed"><span class="diff-tag removed">Removed</span><span class="id-tag">${escapeHtml(item.Name)}</span>
      <p>${escapeHtml(item.Subtitle)}</p></div>`;
  }
  const durationChanged = item.from.Duration !== item.to.Duration;
  return `<div class="diff-card changed"><span class="diff-tag changed">Changed</span><span class="id-tag">${escapeHtml(item.to.Name)}</span>
    ${durationChanged ? `<span class="muted"> ${formatDuration(item.from.Duration)} → ${formatDuration(item.to.Duration)}</span>` : ""}
    <p>${renderWordDiff(item.from.Subtitle, item.to.Subtitle)}</p></div>`;
}

function renderSubsDiff(fromSubs, toSubs) {
  const { added, removed, changed } = diffByKey(fromSubs, toSubs, (s) => s.Name);
  const container = document.getElementById("compare-subtitles");
  if (!added.length && !removed.length && !changed.length) {
    container.innerHTML = `<p class="empty-note">No differences in quest subtitles between these versions.</p>`;
    return;
  }
  let html = "";
  if (added.length) {
    html += `<div class="section-heading">Added (${added.length})</div>`;
    html += added.map((s) => renderSubDiffCard("added", s)).join("");
  }
  if (changed.length) {
    html += `<div class="section-heading">Changed (${changed.length})</div>`;
    html += changed.map((c) => renderSubDiffCard("changed", c)).join("");
  }
  if (removed.length) {
    html += `<div class="section-heading">Removed (${removed.length})</div>`;
    html += removed.map((s) => renderSubDiffCard("removed", s)).join("");
  }
  container.innerHTML = html;
}

async function loadCompare() {
  const fromSha = document.getElementById("compare-from").value;
  const toSha = document.getElementById("compare-to").value;
  if (!fromSha || !toSha) return;
  setStatus("Comparing versions…");
  try {
    const [fromLogsJson, toLogsJson, fromSubsJson, toSubsJson] = await Promise.all([
      fetchFileAtSha(PATHS.logs, fromSha),
      fetchFileAtSha(PATHS.logs, toSha),
      fetchFileAtSha(PATHS.subtitles, fromSha),
      fetchFileAtSha(PATHS.subtitles, toSha),
    ]);
    renderLogsDiff(normalizeLogs(fromLogsJson).logs, normalizeLogs(toLogsJson).logs);
    renderSubsDiff(normalizeSubtitles(fromSubsJson), normalizeSubtitles(toSubsJson));
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  }
}

// ---------- toolbar wiring ----------

function wireModeTabs() {
  const tabs = document.querySelectorAll("#mode-tabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentMode = tab.dataset.mode;
      document.getElementById("panel-browse").classList.toggle("active", currentMode === "browse");
      document.getElementById("panel-compare").classList.toggle("active", currentMode === "compare");
      document.getElementById("browse-controls").classList.toggle("hidden", currentMode !== "browse");
      document.getElementById("compare-controls").classList.toggle("hidden", currentMode !== "compare");
      const filterInput = document.getElementById("filter-input");
      const terminalBar = document.getElementById("terminal-bar");
      if (currentMode === "compare") {
        terminalBar.classList.add("disabled");
        filterInput.placeholder = "filtering not available in compare mode";
      } else {
        terminalBar.classList.remove("disabled");
        filterInput.placeholder = "type to filter…";
      }
      if (currentMode === "compare") loadCompare();
    });
  });
}

function wireBrowseContentTabs() {
  const buttons = document.querySelectorAll("#browse-content-tabs .content-tab");
  const title = document.getElementById("list-screen-title");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      browseScope = btn.dataset.content;
      document.getElementById("logs-list").classList.toggle("hidden", browseScope !== "logs");
      document.getElementById("subs-list").classList.toggle("hidden", browseScope !== "subtitles");
      title.textContent = browseScope === "logs" ? "DATA LOGS" : "QUEST SUBTITLES";
      document.getElementById("filter-input").value = "";
      renderBrowseLogs("");
      renderBrowseSubs("");
    });
  });
}

function wireCompareContentTabs() {
  const buttons = document.querySelectorAll("#compare-content-tabs .content-tab");
  const label = document.getElementById("compare-scope-label");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      compareScope = btn.dataset.content;
      document.getElementById("compare-logs").classList.toggle("active", compareScope === "logs");
      document.getElementById("compare-subtitles").classList.toggle("active", compareScope === "subtitles");
      label.textContent = compareScope === "logs" ? "VOYAGE LOGS" : "QUEST SUBTITLES";
    });
  });
}

function wireEntryListClicks() {
  document.getElementById("logs-list").addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    selectedLogIdx = Number(row.dataset.idx);
    renderBrowseLogs(document.getElementById("filter-input").value);
  });
  document.getElementById("subs-list").addEventListener("click", (e) => {
    const row = e.target.closest(".entry");
    if (!row) return;
    selectedSubIdx = Number(row.dataset.idx);
    renderBrowseSubs(document.getElementById("filter-input").value);
  });
}

function wireFilterInput() {
  document.getElementById("filter-input").addEventListener("input", (e) => {
    if (currentMode !== "browse") return;
    if (browseScope === "logs") renderBrowseLogs(e.target.value);
    else renderBrowseSubs(e.target.value);
  });
}

// ---------- device controls ----------

function moveSelection(delta) {
  if (currentMode !== "browse") return;
  if (browseScope === "logs") {
    if (!filteredLogs.length) return;
    selectedLogIdx = (selectedLogIdx + delta + filteredLogs.length) % filteredLogs.length;
    renderBrowseLogs(document.getElementById("filter-input").value);
    document.querySelector("#logs-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  } else {
    if (!filteredSubs.length) return;
    selectedSubIdx = (selectedSubIdx + delta + filteredSubs.length) % filteredSubs.length;
    renderBrowseSubs(document.getElementById("filter-input").value);
    document.querySelector("#subs-list .entry.selected")?.scrollIntoView({ block: "nearest" });
  }
}

function stepVersion(delta) {
  const selectId = currentMode === "compare" ? "compare-to" : "browse-version";
  const select = document.getElementById(selectId);
  const nextIndex = select.selectedIndex + delta;
  if (nextIndex < 0 || nextIndex >= select.options.length) return;
  select.selectedIndex = nextIndex;
  select.dispatchEvent(new Event("change"));
}

function wireDeviceControls() {
  document.getElementById("btn-up").addEventListener("click", () => moveSelection(-1));
  document.getElementById("btn-down").addEventListener("click", () => moveSelection(1));
  document.getElementById("btn-prev").addEventListener("click", () => stepVersion(1)); // older
  document.getElementById("btn-next").addEventListener("click", () => stepVersion(-1)); // newer
  document.getElementById("btn-exe").addEventListener("click", () => {
    if (currentMode === "compare") {
      loadCompare();
    } else {
      document.getElementById("filter-input").focus();
    }
  });
  document.getElementById("btn-exit").addEventListener("click", () => {
    const input = document.getElementById("filter-input");
    input.value = "";
    input.blur();
    if (currentMode === "browse") {
      if (browseScope === "logs") renderBrowseLogs("");
      else renderBrowseSubs("");
    }
  });

  const led = document.getElementById("status-led");
  const dispBtn = document.getElementById("disp-toggle");
  const screensEls = () => document.querySelectorAll(".screens");

  function applyDisplayFilter() {
    screensEls().forEach((el) => {
      el.style.filter = displayOn ? `brightness(${brt}%) contrast(${con}%) saturate(${sat}%)` : "brightness(0%)";
    });
  }

  dispBtn.addEventListener("click", () => {
    displayOn = !displayOn;
    dispBtn.textContent = displayOn ? "DISP ON" : "DISP OFF";
    led.classList.toggle("off", !displayOn);
    applyDisplayFilter();
  });

  document.querySelectorAll(".control-grid [data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const clamp = (v) => Math.max(40, Math.min(160, v));
      if (action === "brt-up") brt = clamp(brt + 10);
      if (action === "brt-down") brt = clamp(brt - 10);
      if (action === "con-up") con = clamp(con + 10);
      if (action === "con-down") con = clamp(con - 10);
      if (action === "sat-up") sat = clamp(sat + 10);
      if (action === "sat-down") sat = clamp(sat - 10);
      applyDisplayFilter();
    });
  });
}

// ---------- bootstrap ----------

async function init() {
  wireModeTabs();
  wireBrowseContentTabs();
  wireCompareContentTabs();
  wireEntryListClicks();
  wireFilterInput();
  wireDeviceControls();

  setStatus("Loading commit history…");
  try {
    versions = await buildVersionList();
    if (!versions.length) throw new Error("No commit history found for these files.");
    populateVersionSelects();
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
    return;
  }

  document.getElementById("browse-version").addEventListener("change", (e) => loadBrowseVersion(e.target.value));
  document.getElementById("compare-from").addEventListener("change", loadCompare);
  document.getElementById("compare-to").addEventListener("change", loadCompare);

  await loadBrowseVersion(document.getElementById("browse-version").value);
}

document.addEventListener("DOMContentLoaded", init);
