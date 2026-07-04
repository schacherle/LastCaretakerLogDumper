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

// ---------- browse rendering ----------

function renderLogCard(log) {
  const fragments = (log.fragments || [])
    .map(
      (f) => `<div class="fragment">
        <div class="fragment-title">${escapeHtml(f.title)}</div>
        <p>${escapeHtml(f.description)}</p>
      </div>`
    )
    .join("");
  return `<details class="card">
    <summary><span class="summary-title">${escapeHtml(log.title) || "<em>(untitled)</em>"}</span><span class="id-tag">${escapeHtml(log.id)}</span></summary>
    <div class="card-body">
      ${log.description ? `<p>${escapeHtml(log.description)}</p>` : ""}
      ${fragments}
      ${log.footer ? `<p class="footer-text">${escapeHtml(log.footer)}</p>` : ""}
    </div>
  </details>`;
}

function renderSubRow(sub) {
  return `<div class="sub-row">
    <div class="sub-row-head"><span>${escapeHtml(sub.Name)}</span><span>${formatDuration(sub.Duration)}</span></div>
    <p>${escapeHtml(sub.Subtitle)}</p>
  </div>`;
}

function renderBrowseLogs(filterText) {
  const term = (filterText || "").toLowerCase();
  const filtered = currentBrowseLogs.filter(
    (l) => !term || (l.title || "").toLowerCase().includes(term) || (l.id || "").toLowerCase().includes(term)
  );
  const container = document.getElementById("logs-list");
  container.innerHTML = filtered.length
    ? filtered.map(renderLogCard).join("")
    : `<p class="empty-note">No logs match your filter.</p>`;
}

function renderBrowseSubs(filterText) {
  const term = (filterText || "").toLowerCase();
  const filtered = currentBrowseSubs.filter(
    (s) => !term || (s.Name || "").toLowerCase().includes(term) || (s.Subtitle || "").toLowerCase().includes(term)
  );
  const container = document.getElementById("subs-list");
  container.innerHTML = filtered.length
    ? filtered.map(renderSubRow).join("")
    : `<p class="empty-note">No subtitles match your filter.</p>`;
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

    const badge = document.getElementById("browse-build");
    if (buildNumber) {
      badge.textContent = `Build ${buildNumber}`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }

    renderBrowseLogs(document.getElementById("logs-filter").value);
    renderBrowseSubs(document.getElementById("subs-filter").value);
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

function renderLogDiffCard(kind, log, otherLog) {
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

// ---------- tab wiring ----------

function wireModeTabs() {
  const tabs = document.querySelectorAll("#mode-tabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const mode = tab.dataset.mode;
      document.getElementById("panel-browse").classList.toggle("active", mode === "browse");
      document.getElementById("panel-compare").classList.toggle("active", mode === "compare");
      if (mode === "compare") loadCompare();
    });
  });
}

function wireContentTabs(scope) {
  const buttons = document.querySelectorAll(`.content-tabs[data-scope="${scope}"] .content-tab`);
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const content = btn.dataset.content;
      document.getElementById(`${scope}-logs`).classList.toggle("active", content === "logs");
      document.getElementById(`${scope}-subtitles`).classList.toggle("active", content === "subtitles");
    });
  });
}

// ---------- bootstrap ----------

async function init() {
  wireModeTabs();
  wireContentTabs("browse");
  wireContentTabs("compare");

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
  document.getElementById("logs-filter").addEventListener("input", (e) => renderBrowseLogs(e.target.value));
  document.getElementById("subs-filter").addEventListener("input", (e) => renderBrowseSubs(e.target.value));
  document.getElementById("compare-from").addEventListener("change", loadCompare);
  document.getElementById("compare-to").addEventListener("change", loadCompare);

  await loadBrowseVersion(document.getElementById("browse-version").value);
}

document.addEventListener("DOMContentLoaded", init);
